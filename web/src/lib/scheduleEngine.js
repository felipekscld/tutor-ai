// web/src/lib/scheduleEngine.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

/**
 * Default available hours by day
 * Users can customize these in their profile
 */
const DEFAULT_AVAILABLE_HOURS = {
  sunday: { start: "09:00", end: "18:00" },
  monday: { start: "08:00", end: "22:00" },
  tuesday: { start: "08:00", end: "22:00" },
  wednesday: { start: "08:00", end: "22:00" },
  thursday: { start: "08:00", end: "22:00" },
  friday: { start: "08:00", end: "22:00" },
  saturday: { start: "09:00", end: "18:00" },
};

/**
 * Get day of week name
 */
function getDayOfWeekName(date) {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[date.getDay()];
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse time string (HH:MM) to minutes since midnight
 */
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string (HH:MM)
 */
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Get fixed commitments for a specific day
 */
async function getCommitmentsForDay(uid, dayOfWeek) {
  const commitmentsRef = collection(db, "users", uid, "fixed_commitments");
  const snap = await getDocs(commitmentsRef);
  
  return snap.docs
    .map(doc => doc.data())
    .filter(c => c.day_of_week === dayOfWeek);
}

/**
 * Find available time slots for a day, avoiding commitments
 * Uses the user's available hours configuration
 */
function findAvailableSlots(commitments, dayOfWeek, availableHours = null) {
  // Get available hours for this day
  const dayHours = availableHours?.[dayOfWeek] || DEFAULT_AVAILABLE_HOURS[dayOfWeek];
  const dayStart = timeToMinutes(dayHours.start);
  const dayEnd = timeToMinutes(dayHours.end);
  
  // Build list of blocked intervals
  const blocked = commitments
    .map(c => ({
      start: timeToMinutes(c.start_time),
      end: timeToMinutes(c.end_time),
    }))
    .sort((a, b) => a.start - b.start);
  
  // Find gaps
  const available = [];
  let currentTime = dayStart;
  
  for (const interval of blocked) {
    // Only consider blocks within our available time
    if (interval.end <= dayStart || interval.start >= dayEnd) continue;
    
    const blockStart = Math.max(interval.start, dayStart);
    const blockEnd = Math.min(interval.end, dayEnd);
    
    if (currentTime < blockStart) {
      available.push({
        start: currentTime,
        end: blockStart,
        duration: blockStart - currentTime,
      });
    }
    currentTime = Math.max(currentTime, blockEnd);
  }
  
  // Add remaining time at end of day
  if (currentTime < dayEnd) {
    available.push({
      start: currentTime,
      end: dayEnd,
      duration: dayEnd - currentTime,
    });
  }
  
  return available;
}

/**
 * Assign start times to tasks based on available slots
 */
function assignTaskTimes(tasks, availableSlots) {
  const assignedTasks = [];
  let slotIndex = 0;
  let slotUsedTime = 0;
  
  for (const task of tasks) {
    // Find a slot that can fit this task
    while (slotIndex < availableSlots.length) {
      const slot = availableSlots[slotIndex];
      const remainingInSlot = slot.duration - slotUsedTime;
      
      if (remainingInSlot >= task.duration) {
        // Task fits in current slot
        const startTime = slot.start + slotUsedTime;
        assignedTasks.push({
          ...task,
          start_time: minutesToTime(startTime),
          end_time: minutesToTime(startTime + task.duration),
        });
        slotUsedTime += task.duration;
        break;
      } else {
        // Move to next slot
        slotIndex++;
        slotUsedTime = 0;
      }
    }
    
    // If no slot found, mark as flexible
    if (assignedTasks.length < tasks.indexOf(task) + 1) {
      assignedTasks.push({
        ...task,
        start_time: null,
        end_time: null,
        flexible: true,
      });
    }
  }
  
  return assignedTasks;
}

/**
 * Generate tasks for a specific day based on goals
 */
export async function ensureTodaySchedule(uid, date = new Date()) {
  const dateStr = formatDate(date);
  const dayOfWeek = getDayOfWeekName(date);
  
  // Check if schedule already exists
  const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
  const scheduleSnap = await getDoc(scheduleRef);
  
  if (scheduleSnap.exists()) {
    return scheduleSnap.data();
  }
  
  // Load goals summary
  const summaryRef = doc(db, "users", uid, "goals_summary", "current");
  const summarySnap = await getDoc(summaryRef);
  
  if (!summarySnap.exists()) {
    throw new Error("Goals summary not found. Please complete onboarding first.");
  }
  
  const summary = summarySnap.data();
  const dailyDistribution = summary.daily_distribution || {};
  const todayTopics = dailyDistribution[dayOfWeek] || [];
  
  // Load user profile for available hours
  const profileRef = doc(db, "users", uid, "profile", "default");
  const profileSnap = await getDoc(profileRef);
  const availableHours = profileSnap.exists() ? profileSnap.data().available_hours : null;
  
  if (todayTopics.length === 0) {
    // No topics scheduled for today, return empty schedule
    const emptySchedule = {
      date: dateStr,
      day_of_week: dayOfWeek,
      tasks: [],
      total_minutes: 0,
      created_at: serverTimestamp(),
    };
    await setDoc(scheduleRef, emptySchedule);
    return emptySchedule;
  }
  
  // Load fixed commitments for this day
  const commitments = await getCommitmentsForDay(uid, dayOfWeek);
  const availableSlots = findAvailableSlots(commitments, dayOfWeek, availableHours);
  
  // Generate tasks for each topic
  const rawTasks = [];
  let totalMinutes = 0;
  
  todayTopics.forEach((topicInfo, index) => {
    const { subject, topic, minutes } = topicInfo;
    
    // Split time between theory and practice (60/40 split generally)
    const theoryMinutes = Math.round(minutes * 0.6);
    const practiceMinutes = minutes - theoryMinutes;
    
    // Create theory task
    if (theoryMinutes > 0) {
      rawTasks.push({
        id: `${dateStr}_${index}_theory`,
        subject,
        topic,
        type: "theory",
        description: `Estudar teoria de ${topic}`,
        duration: theoryMinutes,
        status: "pending",
        difficulty: null,
        order: rawTasks.length,
      });
      totalMinutes += theoryMinutes;
    }
    
    // Create practice task
    if (practiceMinutes > 0) {
      rawTasks.push({
        id: `${dateStr}_${index}_practice`,
        subject,
        topic,
        type: "practice",
        description: `Resolver exercícios de ${topic}`,
        duration: practiceMinutes,
        status: "pending",
        difficulty: null,
        order: rawTasks.length,
      });
      totalMinutes += practiceMinutes;
    }
  });
  
  // Assign times to tasks based on available slots
  const tasks = assignTaskTimes(rawTasks, availableSlots);
  
  // Save schedule
  const schedule = {
    date: dateStr,
    day_of_week: dayOfWeek,
    tasks,
    total_minutes: totalMinutes,
    has_commitments: commitments.length > 0,
    created_at: serverTimestamp(),
  };
  
  await setDoc(scheduleRef, schedule);
  console.log(`✓ Created schedule for ${dateStr} with ${tasks.length} tasks (${totalMinutes} min)`);
  
  return schedule;
}

/**
 * Get schedule for a specific date
 */
export async function getSchedule(uid, date = new Date()) {
  const dateStr = formatDate(date);
  const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
  
  const snap = await getDoc(scheduleRef);
  
  if (snap.exists()) {
    return snap.data();
  }
  
  return await ensureTodaySchedule(uid, date);
}

/**
 * Generate schedule for the entire week starting from a date
 */
export async function generateWeekSchedule(uid, startDate = new Date()) {
  const schedules = [];
  
  // Start from the beginning of the week (Sunday)
  const weekStart = new Date(startDate);
  weekStart.setDate(startDate.getDate() - startDate.getDay());
  
  console.log(`📅 Generating schedule for week starting ${formatDate(weekStart)}`);
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    
    try {
      const schedule = await ensureTodaySchedule(uid, date);
      schedules.push(schedule);
    } catch (e) {
      console.error(`Error generating schedule for ${formatDate(date)}:`, e);
    }
  }
  
  console.log(`✓ Generated ${schedules.length} daily schedules`);
  return schedules;
}

/**
 * Force regenerate schedule for a specific day (deletes existing and creates new)
 */
export async function regenerateDaySchedule(uid, date = new Date()) {
  const dateStr = formatDate(date);
  const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
  
  // Delete existing schedule
  const snap = await getDoc(scheduleRef);
  if (snap.exists()) {
    // Keep completed tasks
    const existing = snap.data();
    const completedTasks = existing.tasks?.filter(t => t.status !== "pending") || [];
    
    if (completedTasks.length > 0) {
      // If there are completed tasks, just update with new pending tasks
      console.log(`📌 Preserving ${completedTasks.length} completed tasks for ${dateStr}`);
    }
  }
  
  // Generate new schedule by temporarily setting it as non-existent
  // We need to delete and recreate
  const newSchedule = await createScheduleForDay(uid, date);
  
  return newSchedule;
}

/**
 * Internal function to create schedule for a day (bypasses existence check)
 */
async function createScheduleForDay(uid, date) {
  const dateStr = formatDate(date);
  const dayOfWeek = getDayOfWeekName(date);
  const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
  
  // Load goals summary
  const summaryRef = doc(db, "users", uid, "goals_summary", "current");
  const summarySnap = await getDoc(summaryRef);
  
  if (!summarySnap.exists()) {
    throw new Error("Goals summary not found.");
  }
  
  const summary = summarySnap.data();
  const dailyDistribution = summary.daily_distribution || {};
  const todayTopics = dailyDistribution[dayOfWeek] || [];
  
  // Load user profile for available hours
  const profileRef = doc(db, "users", uid, "profile", "default");
  const profileSnap = await getDoc(profileRef);
  const availableHours = profileSnap.exists() ? profileSnap.data().available_hours : null;
  
  if (todayTopics.length === 0) {
    const emptySchedule = {
      date: dateStr,
      day_of_week: dayOfWeek,
      tasks: [],
      total_minutes: 0,
      created_at: serverTimestamp(),
    };
    await setDoc(scheduleRef, emptySchedule);
    return emptySchedule;
  }
  
  // Load fixed commitments
  const commitments = await getCommitmentsForDay(uid, dayOfWeek);
  const availableSlots = findAvailableSlots(commitments, dayOfWeek, availableHours);
  
  // Generate tasks
  const rawTasks = [];
  let totalMinutes = 0;
  
  todayTopics.forEach((topicInfo, index) => {
    const { subject, topic, minutes } = topicInfo;
    
    const theoryMinutes = Math.round(minutes * 0.6);
    const practiceMinutes = minutes - theoryMinutes;
    
    if (theoryMinutes > 0) {
      rawTasks.push({
        id: `${dateStr}_${index}_theory`,
        subject,
        topic,
        type: "theory",
        description: `Estudar teoria de ${topic}`,
        duration: theoryMinutes,
        status: "pending",
        difficulty: null,
        order: rawTasks.length,
      });
      totalMinutes += theoryMinutes;
    }
    
    if (practiceMinutes > 0) {
      rawTasks.push({
        id: `${dateStr}_${index}_practice`,
        subject,
        topic,
        type: "practice",
        description: `Resolver exercícios de ${topic}`,
        duration: practiceMinutes,
        status: "pending",
        difficulty: null,
        order: rawTasks.length,
      });
      totalMinutes += practiceMinutes;
    }
  });
  
  const tasks = assignTaskTimes(rawTasks, availableSlots);
  
  const schedule = {
    date: dateStr,
    day_of_week: dayOfWeek,
    tasks,
    total_minutes: totalMinutes,
    has_commitments: commitments.length > 0,
    created_at: serverTimestamp(),
  };
  
  await setDoc(scheduleRef, schedule);
  console.log(`✓ Created schedule for ${dateStr} with ${tasks.length} tasks`);
  
  return schedule;
}

/**
 * Adapt existing schedules when a new commitment is added
 * Moves conflicting tasks to available time slots
 */
export async function adaptScheduleForCommitment(uid, commitment) {
  const { day_of_week, start_time, end_time } = commitment;
  const commitmentStart = timeToMinutes(start_time);
  const commitmentEnd = timeToMinutes(end_time);
  
  // Get all schedules
  const scheduleRef = collection(db, "users", uid, "schedule");
  const snap = await getDocs(scheduleRef);
  
  // Load profile for available hours
  const profileRef = doc(db, "users", uid, "profile", "default");
  const profileSnap = await getDoc(profileRef);
  const availableHours = profileSnap.exists() ? profileSnap.data().available_hours : null;
  
  // Load all commitments including the new one
  const commitmentsRef = collection(db, "users", uid, "fixed_commitments");
  const commitmentsSnap = await getDocs(commitmentsRef);
  const allCommitments = commitmentsSnap.docs.map(d => d.data());
  
  let schedulesUpdated = 0;
  
  for (const schedDoc of snap.docs) {
    const schedule = schedDoc.data();
    
    // Only update schedules for the affected day of week
    if (schedule.day_of_week !== day_of_week) continue;
    
    // Check if any tasks conflict with the new commitment
    const hasConflict = schedule.tasks?.some(task => {
      if (!task.start_time || !task.end_time) return false;
      const taskStart = timeToMinutes(task.start_time);
      const taskEnd = timeToMinutes(task.end_time);
      
      // Check overlap
      return (taskStart < commitmentEnd && taskEnd > commitmentStart);
    });
    
    if (!hasConflict) continue;
    
    // Get commitments for this day
    const dayCommitments = allCommitments.filter(c => c.day_of_week === day_of_week);
    const availableSlots = findAvailableSlots(dayCommitments, day_of_week, availableHours);
    
    // Separate completed tasks and pending tasks
    const completedTasks = schedule.tasks?.filter(t => t.status !== "pending") || [];
    const pendingTasks = schedule.tasks?.filter(t => t.status === "pending") || [];
    
    // Re-assign times to pending tasks
    const reassignedTasks = assignTaskTimes(
      pendingTasks.map(t => ({ ...t, start_time: null, end_time: null })),
      availableSlots
    );
    
    // Combine completed and reassigned tasks
    const newTasks = [...completedTasks, ...reassignedTasks];
    
    // Update the schedule
    await setDoc(doc(db, "users", uid, "schedule", schedDoc.id), {
      ...schedule,
      tasks: newTasks,
      has_commitments: true,
      updated_at: serverTimestamp(),
    });
    
    schedulesUpdated++;
    console.log(`✓ Adapted schedule for ${schedDoc.id}`);
  }
  
  return { schedulesUpdated };
}

/**
 * Update task status
 */
export async function updateTaskStatus(uid, date, taskId, status, difficulty = null) {
  const dateStr = typeof date === "string" ? date : formatDate(date);
  const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
  const snap = await getDoc(scheduleRef);
  
  if (!snap.exists()) {
    throw new Error("Schedule not found");
  }
  
  const schedule = snap.data();
  
  const tasks = schedule.tasks.map(task => {
    if (task.id === taskId) {
      return {
        ...task,
        status,
        difficulty,
        completed_at: status !== "pending" ? new Date().toISOString() : null,
      };
    }
    return task;
  });
  
  await setDoc(scheduleRef, { ...schedule, tasks }, { merge: true });
  
  return tasks.find(t => t.id === taskId);
}


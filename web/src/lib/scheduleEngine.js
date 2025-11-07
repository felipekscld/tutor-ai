// web/src/lib/scheduleEngine.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

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
  
  // Generate tasks for each topic
  const tasks = [];
  let totalMinutes = 0;
  
  todayTopics.forEach((topicInfo, index) => {
    const { subject, topic, minutes } = topicInfo;
    
    // Split time between theory and practice (60/40 split generally)
    const theoryMinutes = Math.round(minutes * 0.6);
    const practiceMinutes = minutes - theoryMinutes;
    
    // Create theory task
    if (theoryMinutes > 0) {
      tasks.push({
        id: `${dateStr}_${index}_theory`,
        subject,
        topic,
        type: "theory",
        description: `Estudar teoria de ${topic}`,
        duration: theoryMinutes,
        status: "pending",
        difficulty: null,
        order: tasks.length,
      });
      totalMinutes += theoryMinutes;
    }
    
    // Create practice task
    if (practiceMinutes > 0) {
      tasks.push({
        id: `${dateStr}_${index}_practice`,
        subject,
        topic,
        type: "practice",
        description: `Resolver exercícios de ${topic}`,
        duration: practiceMinutes,
        status: "pending",
        difficulty: null,
        order: tasks.length,
      });
      totalMinutes += practiceMinutes;
    }
  });
  
  // Save schedule
  const schedule = {
    date: dateStr,
    day_of_week: dayOfWeek,
    tasks,
    total_minutes: totalMinutes,
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


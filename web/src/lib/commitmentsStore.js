// web/src/lib/commitmentsStore.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, serverTimestamp } from "firebase/firestore";

/**
 * Days of the week mapping
 */
const DAYS_OF_WEEK = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DAYS_LABELS = {
  sunday: "Domingo",
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
};

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
 * Get all fixed commitments for a user
 */
export async function getFixedCommitments(uid) {
  const commitmentsRef = collection(db, "users", uid, "fixed_commitments");
  const snap = await getDocs(commitmentsRef);
  
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Get commitments for a specific day of the week
 */
export async function getCommitmentsForDay(uid, dayOfWeek) {
  const allCommitments = await getFixedCommitments(uid);
  return allCommitments.filter(c => c.day_of_week === dayOfWeek);
}

/**
 * Add a new fixed commitment
 */
export async function addFixedCommitment(uid, commitment) {
  const commitmentsRef = collection(db, "users", uid, "fixed_commitments");
  const newDocRef = doc(commitmentsRef);
  
  const newCommitment = {
    day_of_week: commitment.day_of_week,
    start_time: commitment.start_time,
    end_time: commitment.end_time,
    description: commitment.description || "",
    created_at: serverTimestamp(),
  };
  
  await setDoc(newDocRef, newCommitment);
  
  return { id: newDocRef.id, ...newCommitment };
}

/**
 * Update a fixed commitment
 */
export async function updateFixedCommitment(uid, commitmentId, updates) {
  const commitmentRef = doc(db, "users", uid, "fixed_commitments", commitmentId);
  
  await setDoc(commitmentRef, {
    ...updates,
    updated_at: serverTimestamp(),
  }, { merge: true });
  
  return { id: commitmentId, ...updates };
}

/**
 * Delete a fixed commitment
 */
export async function deleteFixedCommitment(uid, commitmentId) {
  const commitmentRef = doc(db, "users", uid, "fixed_commitments", commitmentId);
  await deleteDoc(commitmentRef);
  return true;
}

/**
 * Check if a time slot is available (doesn't conflict with commitments or tasks)
 * 
 * @param {string} uid - User ID
 * @param {Date} date - The date to check
 * @param {string} startTime - Start time in HH:MM format
 * @param {number} durationMinutes - Duration in minutes
 * @param {Array} existingTasks - Already scheduled tasks for the day
 * @returns {Object} { available: boolean, conflicts: Array }
 */
export async function isTimeSlotAvailable(uid, date, startTime, durationMinutes, existingTasks = []) {
  const dayOfWeek = getDayOfWeekName(date);
  const commitments = await getCommitmentsForDay(uid, dayOfWeek);
  
  const slotStart = timeToMinutes(startTime);
  const slotEnd = slotStart + durationMinutes;
  
  const conflicts = [];
  
  // Check against fixed commitments
  for (const commitment of commitments) {
    const commitStart = timeToMinutes(commitment.start_time);
    const commitEnd = timeToMinutes(commitment.end_time);
    
    // Check for overlap
    if (slotStart < commitEnd && slotEnd > commitStart) {
      conflicts.push({
        type: "commitment",
        description: commitment.description,
        start_time: commitment.start_time,
        end_time: commitment.end_time,
      });
    }
  }
  
  // Check against existing tasks
  for (const task of existingTasks) {
    if (!task.start_time) continue;
    
    const taskStart = timeToMinutes(task.start_time);
    const taskEnd = taskStart + (task.duration || 30);
    
    if (slotStart < taskEnd && slotEnd > taskStart) {
      conflicts.push({
        type: "task",
        description: `${task.subject} - ${task.topic}`,
        start_time: task.start_time,
        duration: task.duration,
      });
    }
  }
  
  return {
    available: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Find next available time slot for a task
 * 
 * @param {string} uid - User ID
 * @param {Date} date - The date to check
 * @param {number} durationMinutes - Required duration in minutes
 * @param {string} startFrom - Earliest start time (HH:MM), default "08:00"
 * @param {string} endBy - Latest end time (HH:MM), default "22:00"
 * @param {Array} existingTasks - Already scheduled tasks
 * @returns {Object|null} { start_time, end_time } or null if no slot available
 */
export async function findNextAvailableSlot(uid, date, durationMinutes, startFrom = "08:00", endBy = "22:00", existingTasks = []) {
  const dayOfWeek = getDayOfWeekName(date);
  const commitments = await getCommitmentsForDay(uid, dayOfWeek);
  
  const dayStart = timeToMinutes(startFrom);
  const dayEnd = timeToMinutes(endBy);
  
  // Build list of all blocked intervals
  const blockedIntervals = [];
  
  // Add commitments
  for (const c of commitments) {
    blockedIntervals.push({
      start: timeToMinutes(c.start_time),
      end: timeToMinutes(c.end_time),
    });
  }
  
  // Add existing tasks
  for (const t of existingTasks) {
    if (!t.start_time) continue;
    blockedIntervals.push({
      start: timeToMinutes(t.start_time),
      end: timeToMinutes(t.start_time) + (t.duration || 30),
    });
  }
  
  // Sort by start time
  blockedIntervals.sort((a, b) => a.start - b.start);
  
  // Find first available gap
  let currentTime = dayStart;
  
  for (const interval of blockedIntervals) {
    // Check if there's a gap before this interval
    if (currentTime + durationMinutes <= interval.start) {
      return {
        start_time: minutesToTime(currentTime),
        end_time: minutesToTime(currentTime + durationMinutes),
      };
    }
    
    // Move current time to after this interval
    if (interval.end > currentTime) {
      currentTime = interval.end;
    }
  }
  
  // Check if there's room at the end of the day
  if (currentTime + durationMinutes <= dayEnd) {
    return {
      start_time: minutesToTime(currentTime),
      end_time: minutesToTime(currentTime + durationMinutes),
    };
  }
  
  return null; // No available slot
}

/**
 * Calculate total blocked time for a day
 */
export async function getTotalBlockedTime(uid, date) {
  const dayOfWeek = getDayOfWeekName(date);
  const commitments = await getCommitmentsForDay(uid, dayOfWeek);
  
  let totalMinutes = 0;
  
  for (const c of commitments) {
    const start = timeToMinutes(c.start_time);
    const end = timeToMinutes(c.end_time);
    totalMinutes += end - start;
  }
  
  return totalMinutes;
}

/**
 * Get available study hours for a day
 * Assumes study window is 08:00-22:00 (14 hours = 840 minutes)
 */
export async function getAvailableStudyMinutes(uid, date, studyWindowStart = "08:00", studyWindowEnd = "22:00") {
  const totalWindow = timeToMinutes(studyWindowEnd) - timeToMinutes(studyWindowStart);
  const blocked = await getTotalBlockedTime(uid, date);
  return Math.max(0, totalWindow - blocked);
}

/**
 * Get day of week name from date
 */
function getDayOfWeekName(date) {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[date.getDay()];
}

/**
 * Export constants
 */
export { DAYS_OF_WEEK, DAYS_LABELS, timeToMinutes, minutesToTime };


// web/src/lib/activityLog.js
import { db } from "../firebase";
import { collection, addDoc, query, where, getDocs, orderBy, serverTimestamp } from "firebase/firestore";
import { updateLastActive } from "./userActivity";

/**
 * Log a task update (done, failed, skipped)
 */
export async function logTaskUpdate(uid, taskId, status, difficulty, duration, subject = null, topic = null) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  
  await addDoc(activityRef, {
    type: "task_update",
    task_id: taskId,
    status,
    difficulty,
    duration_minutes: duration,
    subject: subject || "unknown",
    topic: topic || null,
    date: dateStr,
    timestamp: serverTimestamp(),
  });
}

/**
 * Log session start
 */
export async function logSessionStart(uid) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const docRef = await addDoc(activityRef, {
    type: "session_start",
    session_start: now.toISOString(),
    date: dateStr,
    timestamp: serverTimestamp(),
  });
  
  await updateLastActive(uid);
  
  return docRef.id;
}

/**
 * Log session end
 */
export async function logSessionEnd(uid, sessionId, sessionStartTime) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  const sessionEnd = new Date();
  const sessionStart = new Date(sessionStartTime);
  const minutesDelta = Math.round((sessionEnd - sessionStart) / 1000 / 60);
  const dateStr = sessionEnd.toISOString().split('T')[0]; // YYYY-MM-DD
  
  await addDoc(activityRef, {
    type: "session_end",
    session_id: sessionId,
    session_start: sessionStartTime,
    session_end: sessionEnd.toISOString(),
    minutes_delta: minutesDelta,
    date: dateStr,
    timestamp: serverTimestamp(),
  });
  
  await updateLastActive(uid);
  
  return minutesDelta;
}

/**
 * Get activity log for a specific date
 */
export async function getActivityLogForDate(uid, date) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  // Create date range for the day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const q = query(
    activityRef,
    where("timestamp", ">=", startOfDay),
    where("timestamp", "<=", endOfDay),
    orderBy("timestamp", "desc")
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get total minutes studied for a date
 */
export async function getTotalMinutesForDate(uid, date) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  // Format date as YYYY-MM-DD
  const dateStr = date instanceof Date 
    ? date.toISOString().split('T')[0]
    : date.split('T')[0];
  
  const q = query(
    activityRef,
    where("type", "==", "task_update"),
    where("status", "==", "done"),
    where("date", "==", dateStr)
  );
  
  const snap = await getDocs(q);
  
  let totalMinutes = 0;
  snap.docs.forEach(doc => {
    const data = doc.data();
    totalMinutes += data.duration_minutes || 0;
  });
  
  return totalMinutes;
}

/**
 * Get total minutes studied (all time)
 */
export async function getTotalMinutesAllTime(uid) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  const q = query(
    activityRef,
    where("type", "==", "task_update"),
    where("status", "==", "done")
  );
  
  try {
    const snap = await getDocs(q);
    
    let totalMinutes = 0;
    snap.docs.forEach(doc => {
      const data = doc.data();
      totalMinutes += data.duration_minutes || 0;
    });
    
    return totalMinutes;
  } catch (error) {
    console.error("Error getting total minutes:", error);
    return 0;
  }
}

/**
 * Get total minutes studied for a specific subject
 */
export async function getTotalMinutesForSubject(uid, subject) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  const q = query(
    activityRef,
    where("type", "==", "task_update"),
    where("status", "==", "done"),
    where("subject", "==", subject)
  );
  
  try {
    const snap = await getDocs(q);
    
    let totalMinutes = 0;
    snap.docs.forEach(doc => {
      const data = doc.data();
      totalMinutes += data.duration_minutes || 0;
    });
    
    return totalMinutes;
  } catch (error) {
    console.error(`Error getting minutes for ${subject}:`, error);
    return 0;
  }
}

/**
 * Get activity log for a specific subject
 */
export async function getActivityLogForSubject(uid, subject, limit = 50) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  const q = query(
    activityRef,
    where("subject", "==", subject),
    orderBy("timestamp", "desc")
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).slice(0, limit);
  } catch (error) {
    console.error(`Error getting logs for ${subject}:`, error);
    return [];
  }
}


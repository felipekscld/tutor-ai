// web/src/lib/pomodoroStore.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { addXP } from "./gamificationEngine";

/**
 * Pomodoro modes
 */
export const POMODORO_MODES = {
  CLASSIC: { focus: 25, shortBreak: 5, longBreak: 15, cyclesForLong: 4 },
  DEEP_WORK: { focus: 50, shortBreak: 10, longBreak: 30, cyclesForLong: 2 },
  SHORT: { focus: 15, shortBreak: 3, longBreak: 10, cyclesForLong: 4 },
};

/**
 * Timer states
 */
export const TIMER_STATES = {
  IDLE: "idle",
  FOCUS: "focus",
  SHORT_BREAK: "short_break",
  LONG_BREAK: "long_break",
  PAUSED: "paused",
};

/**
 * XP rewards for Pomodoro
 */
const POMODORO_XP = {
  FOCUS_COMPLETE: 15,
  FOUR_CYCLES: 25,
  STREAK_BONUS: 5,
};

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
 * Save a completed Pomodoro session
 */
export async function savePomodoroSession(uid, sessionData) {
  const sessionRef = collection(db, "users", uid, "pomodoro_sessions");
  
  const session = {
    mode: sessionData.mode || "CLASSIC",
    focus_duration: sessionData.focusDuration,
    completed_cycles: sessionData.completedCycles,
    total_focus_minutes: sessionData.totalFocusMinutes,
    interruptions: sessionData.interruptions || 0,
    task_subject: sessionData.taskSubject || null,
    task_topic: sessionData.taskTopic || null,
    date: formatDate(new Date()),
    started_at: sessionData.startedAt,
    ended_at: new Date().toISOString(),
    timestamp: serverTimestamp(),
  };
  
  await addDoc(sessionRef, session);
  
  // Update daily stats
  await updateDailyStats(uid, session);
  
  // Award XP
  if (sessionData.completedCycles > 0) {
    await addXP(uid, POMODORO_XP.FOCUS_COMPLETE * sessionData.completedCycles, "pomodoro");
    
    if (sessionData.completedCycles >= 4) {
      await addXP(uid, POMODORO_XP.FOUR_CYCLES, "pomodoro_streak");
    }
  }
  
  return session;
}

/**
 * Update daily Pomodoro stats
 */
async function updateDailyStats(uid, session) {
  const today = formatDate(new Date());
  const statsRef = doc(db, "users", uid, "pomodoro_stats", today);
  
  const snap = await getDoc(statsRef);
  
  if (snap.exists()) {
    const current = snap.data();
    await setDoc(statsRef, {
      ...current,
      total_sessions: (current.total_sessions || 0) + 1,
      total_cycles: (current.total_cycles || 0) + session.completed_cycles,
      total_focus_minutes: (current.total_focus_minutes || 0) + session.total_focus_minutes,
      total_interruptions: (current.total_interruptions || 0) + session.interruptions,
      updated_at: serverTimestamp(),
    }, { merge: true });
  } else {
    await setDoc(statsRef, {
      date: today,
      total_sessions: 1,
      total_cycles: session.completed_cycles,
      total_focus_minutes: session.total_focus_minutes,
      total_interruptions: session.interruptions,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  }
}

/**
 * Get Pomodoro stats for a period
 */
export async function getPomodoroStats(uid, period = "today") {
  const today = formatDate(new Date());
  
  if (period === "today") {
    const statsRef = doc(db, "users", uid, "pomodoro_stats", today);
    const snap = await getDoc(statsRef);
    
    if (snap.exists()) {
      return snap.data();
    }
    
    return {
      date: today,
      total_sessions: 0,
      total_cycles: 0,
      total_focus_minutes: 0,
      total_interruptions: 0,
    };
  }
  
  // For week/month, aggregate from sessions
  const sessionsRef = collection(db, "users", uid, "pomodoro_sessions");
  
  let startDate = new Date();
  if (period === "week") {
    startDate.setDate(startDate.getDate() - 7);
  } else if (period === "month") {
    startDate.setDate(startDate.getDate() - 30);
  }
  
  const startDateStr = formatDate(startDate);
  
  const q = query(
    sessionsRef,
    where("date", ">=", startDateStr),
    orderBy("date", "desc")
  );
  
  try {
    const snap = await getDocs(q);
    const sessions = snap.docs.map(doc => doc.data());
    
    return {
      period,
      total_sessions: sessions.length,
      total_cycles: sessions.reduce((sum, s) => sum + (s.completed_cycles || 0), 0),
      total_focus_minutes: sessions.reduce((sum, s) => sum + (s.total_focus_minutes || 0), 0),
      total_interruptions: sessions.reduce((sum, s) => sum + (s.interruptions || 0), 0),
      sessions_by_day: groupSessionsByDay(sessions),
    };
  } catch (e) {
    console.error("Error getting Pomodoro stats:", e);
    return {
      period,
      total_sessions: 0,
      total_cycles: 0,
      total_focus_minutes: 0,
      total_interruptions: 0,
    };
  }
}

/**
 * Group sessions by day
 */
function groupSessionsByDay(sessions) {
  const grouped = {};
  
  sessions.forEach(s => {
    if (!grouped[s.date]) {
      grouped[s.date] = { cycles: 0, minutes: 0, sessions: 0 };
    }
    grouped[s.date].cycles += s.completed_cycles || 0;
    grouped[s.date].minutes += s.total_focus_minutes || 0;
    grouped[s.date].sessions += 1;
  });
  
  return grouped;
}

/**
 * Get active Pomodoro streak (consecutive days with at least 1 pomodoro)
 */
export async function getPomodoroStreak(uid) {
  const statsRef = collection(db, "users", uid, "pomodoro_stats");
  
  const q = query(
    statsRef,
    orderBy("date", "desc"),
    limit(30)
  );
  
  try {
    const snap = await getDocs(q);
    const stats = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (stats.length === 0) return 0;
    
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    for (const stat of stats) {
      const statDate = new Date(stat.date);
      statDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.round((currentDate - statDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === streak) {
        streak++;
        currentDate = new Date(statDate);
        currentDate.setDate(currentDate.getDate() - 1);
      } else if (diffDays > streak) {
        break;
      }
    }
    
    return streak;
  } catch (e) {
    console.error("Error getting Pomodoro streak:", e);
    return 0;
  }
}

/**
 * Get recent Pomodoro sessions
 */
export async function getRecentSessions(uid, maxResults = 10) {
  const sessionsRef = collection(db, "users", uid, "pomodoro_sessions");
  
  const q = query(
    sessionsRef,
    orderBy("timestamp", "desc"),
    limit(maxResults)
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error getting recent sessions:", e);
    return [];
  }
}


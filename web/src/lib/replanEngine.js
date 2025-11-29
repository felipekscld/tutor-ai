// web/src/lib/replanEngine.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { findNextAvailableSlot, getAvailableStudyMinutes } from "./commitmentsStore";

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
 * Add days to a date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  const diffTime = d2 - d1;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get all overdue tasks (scheduled before today, still pending)
 */
async function getOverdueTasks(uid, todayStr) {
  const scheduleRef = collection(db, "users", uid, "schedule");
  const snap = await getDocs(scheduleRef);
  
  const overdue = [];
  
  snap.docs.forEach(docSnap => {
    const schedule = docSnap.data();
    if (schedule.date && schedule.date < todayStr) {
      const pendingTasks = (schedule.tasks || []).filter(t => t.status === "pending");
      pendingTasks.forEach(task => {
        overdue.push({
          ...task,
          original_date: schedule.date,
          schedule_doc_id: docSnap.id,
        });
      });
    }
  });
  
  // Sort by original date (oldest first)
  overdue.sort((a, b) => a.original_date.localeCompare(b.original_date));
  
  return overdue;
}

/**
 * Get or create schedule for a specific date
 */
async function getOrCreateSchedule(uid, dateStr) {
  const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
  const snap = await getDoc(scheduleRef);
  
  if (snap.exists()) {
    return snap.data();
  }
  
  // Create empty schedule
  const newSchedule = {
    date: dateStr,
    tasks: [],
    total_minutes: 0,
    created_at: serverTimestamp(),
  };
  
  await setDoc(scheduleRef, newSchedule);
  return newSchedule;
}

/**
 * Calculate total scheduled minutes for a day
 */
function getTotalScheduledMinutes(tasks) {
  return tasks.reduce((sum, t) => sum + (t.duration || 0), 0);
}

/**
 * Maximum daily study load in minutes (default 2 hours)
 */
const MAX_DAILY_LOAD = 120;

/**
 * Replan schedule for a user
 * Redistributes overdue pending tasks into the next 7 days
 * 
 * @param {string} uid - User ID
 * @param {Object} options - Options
 * @param {number} options.maxDailyLoad - Max minutes per day (default 120)
 * @param {number} options.planningWindow - Days to plan ahead (default 7)
 * @returns {Object} { replannedCount, newDistribution, message }
 */
export async function replanScheduleForUser(uid, options = {}) {
  const {
    maxDailyLoad = MAX_DAILY_LOAD,
    planningWindow = 7,
  } = options;
  
  const today = new Date();
  const todayStr = formatDate(today);
  
  try {
    // 1. Get all overdue tasks
    const overdueTasks = await getOverdueTasks(uid, todayStr);
    
    if (overdueTasks.length === 0) {
      return {
        replannedCount: 0,
        newDistribution: {},
        message: "Nenhuma tarefa atrasada para replanejar.",
      };
    }
    
    // 2. Build distribution for the next N days
    const distribution = {};
    
    for (let i = 0; i < planningWindow; i++) {
      const targetDate = addDays(today, i);
      const targetDateStr = formatDate(targetDate);
      
      // Get or create schedule for this day
      const schedule = await getOrCreateSchedule(uid, targetDateStr);
      const existingMinutes = getTotalScheduledMinutes(schedule.tasks || []);
      const availableMinutes = await getAvailableStudyMinutes(uid, targetDate);
      
      distribution[targetDateStr] = {
        date: targetDateStr,
        schedule,
        existingMinutes,
        availableMinutes: Math.min(availableMinutes, maxDailyLoad),
        remainingCapacity: Math.max(0, Math.min(availableMinutes, maxDailyLoad) - existingMinutes),
        tasksToAdd: [],
      };
    }
    
    // 3. Distribute overdue tasks
    const replannedTasks = [];
    const unableToReplan = [];
    
    for (const task of overdueTasks) {
      let placed = false;
      
      // Try to find a day with capacity
      for (const dateStr of Object.keys(distribution).sort()) {
        const day = distribution[dateStr];
        
        if (day.remainingCapacity >= task.duration) {
          // Place task here
          day.tasksToAdd.push({
            ...task,
            replanned_from: task.original_date,
            replanned_at: todayStr,
          });
          day.remainingCapacity -= task.duration;
          replannedTasks.push({ task, newDate: dateStr });
          placed = true;
          break;
        }
      }
      
      if (!placed) {
        unableToReplan.push(task);
      }
    }
    
    // 4. Save updated schedules
    for (const [dateStr, day] of Object.entries(distribution)) {
      if (day.tasksToAdd.length === 0) continue;
      
      const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
      const existingTasks = day.schedule.tasks || [];
      const newTasks = [...existingTasks, ...day.tasksToAdd];
      const totalMinutes = getTotalScheduledMinutes(newTasks);
      
      await setDoc(scheduleRef, {
        ...day.schedule,
        tasks: newTasks,
        total_minutes: totalMinutes,
        updated_at: serverTimestamp(),
        last_replan_at: serverTimestamp(),
      }, { merge: true });
    }
    
    // 5. Mark original overdue tasks as replanned in their original schedules
    const originalSchedules = new Map();
    
    for (const { task } of replannedTasks) {
      if (!originalSchedules.has(task.original_date)) {
        const scheduleRef = doc(db, "users", uid, "schedule", task.original_date);
        const snap = await getDoc(scheduleRef);
        if (snap.exists()) {
          originalSchedules.set(task.original_date, snap.data());
        }
      }
    }
    
    for (const [dateStr, schedule] of originalSchedules) {
      const updatedTasks = schedule.tasks.map(t => {
        const wasReplanned = replannedTasks.some(
          r => r.task.id === t.id && r.task.original_date === dateStr
        );
        if (wasReplanned) {
          return { ...t, status: "replanned" };
        }
        return t;
      });
      
      const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
      await setDoc(scheduleRef, {
        ...schedule,
        tasks: updatedTasks,
        updated_at: serverTimestamp(),
      }, { merge: true });
    }
    
    // 6. Build summary
    const newDistribution = {};
    for (const { task, newDate } of replannedTasks) {
      if (!newDistribution[newDate]) {
        newDistribution[newDate] = [];
      }
      newDistribution[newDate].push(task);
    }
    
    let message = `${replannedTasks.length} tarefa(s) redistribuída(s).`;
    if (unableToReplan.length > 0) {
      message += ` ${unableToReplan.length} tarefa(s) não couberam na janela de ${planningWindow} dias.`;
    }
    
    return {
      replannedCount: replannedTasks.length,
      unableToReplanCount: unableToReplan.length,
      newDistribution,
      message,
    };
  } catch (error) {
    console.error("Error replanning schedule:", error);
    throw error;
  }
}

/**
 * Check for inactivity and replan if needed
 * 
 * @param {string} uid - User ID
 * @returns {Object} { needsReplan, daysMissed, replanResult, message }
 */
export async function checkInactivityAndReplan(uid) {
  const today = new Date();
  const todayStr = formatDate(today);
  
  try {
    // 1. Get user's last_active
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return {
        needsReplan: false,
        daysMissed: 0,
        replanResult: null,
        message: "Usuário não encontrado.",
      };
    }
    
    const userData = userSnap.data();
    let lastActiveDate = null;
    
    if (userData.last_active) {
      // Handle Firestore timestamp
      if (userData.last_active.toDate) {
        lastActiveDate = userData.last_active.toDate();
      } else if (userData.last_active instanceof Date) {
        lastActiveDate = userData.last_active;
      } else if (typeof userData.last_active === "string") {
        lastActiveDate = new Date(userData.last_active);
      }
    }
    
    if (!lastActiveDate) {
      return {
        needsReplan: false,
        daysMissed: 0,
        replanResult: null,
        message: "Sem registro de última atividade.",
      };
    }
    
    // 2. Calculate days missed
    const daysMissed = daysBetween(lastActiveDate, today);
    
    if (daysMissed <= 1) {
      return {
        needsReplan: false,
        daysMissed,
        replanResult: null,
        message: "Você está em dia com seu plano!",
      };
    }
    
    // 3. Check if there are overdue tasks
    const overdueTasks = await getOverdueTasks(uid, todayStr);
    
    if (overdueTasks.length === 0) {
      return {
        needsReplan: false,
        daysMissed,
        replanResult: null,
        message: `${daysMissed} dias sem estudo, mas sem tarefas atrasadas.`,
      };
    }
    
    // 4. Replan
    const replanResult = await replanScheduleForUser(uid);
    
    return {
      needsReplan: true,
      daysMissed,
      replanResult,
      message: `Seu plano foi reajustado após ${daysMissed} dias sem estudo. ${replanResult.message}`,
    };
  } catch (error) {
    console.error("Error checking inactivity:", error);
    throw error;
  }
}

/**
 * Get replan status without actually replanning
 * Useful for displaying warnings
 */
export async function getReplanStatus(uid) {
  const today = new Date();
  const todayStr = formatDate(today);
  
  try {
    // Get overdue tasks count
    const overdueTasks = await getOverdueTasks(uid, todayStr);
    
    // Get user's last_active
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    
    let daysMissed = 0;
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.last_active) {
        let lastActiveDate;
        if (userData.last_active.toDate) {
          lastActiveDate = userData.last_active.toDate();
        } else if (userData.last_active instanceof Date) {
          lastActiveDate = userData.last_active;
        } else if (typeof userData.last_active === "string") {
          lastActiveDate = new Date(userData.last_active);
        }
        
        if (lastActiveDate) {
          daysMissed = daysBetween(lastActiveDate, today);
        }
      }
    }
    
    return {
      overdueCount: overdueTasks.length,
      daysMissed,
      needsAttention: overdueTasks.length > 5 || daysMissed > 1,
      overdueTasks: overdueTasks.slice(0, 10), // Return first 10 for display
    };
  } catch (error) {
    console.error("Error getting replan status:", error);
    return {
      overdueCount: 0,
      daysMissed: 0,
      needsAttention: false,
      overdueTasks: [],
    };
  }
}


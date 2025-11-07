// web/src/lib/progressCalc.js
import { getSchedule } from "./scheduleEngine";
import { getTotalMinutesForDate, getTotalMinutesAllTime } from "./activityLog";

/**
 * Calculate progress statistics for a user
 */
export async function calculateProgress(uid, date = new Date()) {
  try {
    // Get today's schedule
    const schedule = await getSchedule(uid, date);
    
    // Count task statuses
    const tasks = schedule.tasks || [];
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.status === "done").length;
    const failedTasks = tasks.filter(t => t.status === "failed").length;
    const skippedTasks = tasks.filter(t => t.status === "skipped").length;
    const pendingTasks = tasks.filter(t => t.status === "pending").length;
    
    // Calculate completion percentage
    const completedTasks = doneTasks + failedTasks + skippedTasks;
    const completionPercentage = totalTasks > 0 
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;
    
    // Get minutes studied today
    const minutesToday = await getTotalMinutesForDate(uid, date);
    
    // Get total minutes all time
    const minutesAllTime = await getTotalMinutesAllTime(uid);
    
    return {
      today: {
        total_tasks: totalTasks,
        done: doneTasks,
        failed: failedTasks,
        skipped: skippedTasks,
        pending: pendingTasks,
        completion_percentage: completionPercentage,
        minutes_studied: minutesToday,
        target_minutes: schedule.total_minutes || 0,
      },
      all_time: {
        minutes_studied: minutesAllTime,
        hours_studied: Math.floor(minutesAllTime / 60),
      },
    };
  } catch (error) {
    console.error("Error calculating progress:", error);
    return {
      today: {
        total_tasks: 0,
        done: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        completion_percentage: 0,
        minutes_studied: 0,
        target_minutes: 0,
      },
      all_time: {
        minutes_studied: 0,
        hours_studied: 0,
      },
    };
  }
}


// web/src/lib/scheduleStore.js
import { updateTaskStatus } from "./scheduleEngine";
import { logTaskUpdate } from "./activityLog";
import { updateLastActive } from "./userActivity";
import { updateProgress, updateSpacedRepetition } from "./progressStore";
import { recordTaskCompletion } from "./gamificationEngine";

/**
 * Mark task as done
 */
export async function markTaskDone(uid, date, task, difficulty = null) {
  await updateTaskStatus(uid, date, task.id, "done", difficulty);
  await logTaskUpdate(uid, task.id, "done", difficulty, task.duration, task.subject, task.topic);
  await updateLastActive(uid);
  
  // Update progress and spaced repetition
  if (task.subject && task.topic) {
    await updateProgress(uid, task.subject, task.topic, true, difficulty);
    await updateSpacedRepetition(uid, task.subject, task.topic, true);
  }
  
  // Update gamification (XP, streak, badges)
  const gamificationResult = await recordTaskCompletion(uid, task, difficulty);
  
  return { status: "done", difficulty, gamification: gamificationResult };
}

/**
 * Mark task as failed
 */
export async function markTaskFailed(uid, date, task, difficulty = null) {
  await updateTaskStatus(uid, date, task.id, "failed", difficulty);
  await logTaskUpdate(uid, task.id, "failed", difficulty, task.duration, task.subject, task.topic);
  await updateLastActive(uid);
  
  // Update progress and spaced repetition (wasCorrect = false)
  if (task.subject && task.topic) {
    await updateProgress(uid, task.subject, task.topic, false, difficulty);
    await updateSpacedRepetition(uid, task.subject, task.topic, false);
  }
  
  return { status: "failed", difficulty };
}

/**
 * Mark task as skipped
 */
export async function markTaskSkipped(uid, date, task) {
  await updateTaskStatus(uid, date, task.id, "skipped", null);
  await logTaskUpdate(uid, task.id, "skipped", null, 0, task.subject, task.topic);
  await updateLastActive(uid);
  return { status: "skipped", difficulty: null };
}


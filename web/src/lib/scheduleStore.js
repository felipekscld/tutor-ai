// web/src/lib/scheduleStore.js
import { updateTaskStatus } from "./scheduleEngine";
import { logTaskUpdate } from "./activityLog";
import { updateLastActive } from "./userActivity";

/**
 * Mark task as done
 */
export async function markTaskDone(uid, date, task, difficulty = null) {
  await updateTaskStatus(uid, date, task.id, "done", difficulty);
  await logTaskUpdate(uid, task.id, "done", difficulty, task.duration, task.subject, task.topic);
  await updateLastActive(uid);
  return { status: "done", difficulty };
}

/**
 * Mark task as failed
 */
export async function markTaskFailed(uid, date, task, difficulty = null) {
  await updateTaskStatus(uid, date, task.id, "failed", difficulty);
  await logTaskUpdate(uid, task.id, "failed", difficulty, task.duration, task.subject, task.topic);
  await updateLastActive(uid);
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


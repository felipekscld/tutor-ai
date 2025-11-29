// web/src/lib/progressStore.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from "firebase/firestore";

/**
 * Spaced repetition intervals in days
 * Level 0 = review in 1 day, Level 4 = review in 30 days
 */
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];
const MAX_REVIEW_LEVEL = REVIEW_INTERVALS.length - 1;

/**
 * Generate progress document ID from subject and topic
 */
function getProgressId(subject, topic) {
  return `${subject}_${topic}`.replace(/\s+/g, "_").toLowerCase();
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
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get progress for a specific subject/topic
 */
export async function getProgress(uid, subject, topic) {
  const progressId = getProgressId(subject, topic);
  const progressRef = doc(db, "users", uid, "progress", progressId);
  const snap = await getDoc(progressRef);
  
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }
  
  return null;
}

/**
 * Get all progress records for a user
 */
export async function getAllProgress(uid) {
  const progressRef = collection(db, "users", uid, "progress");
  const snap = await getDocs(progressRef);
  
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get topics due for review (next_review_at <= today)
 */
export async function getTopicsDueForReview(uid, date = new Date()) {
  const allProgress = await getAllProgress(uid);
  const today = formatDate(date);
  
  return allProgress.filter(p => {
    if (!p.next_review_at) return false;
    return p.next_review_at <= today;
  });
}

/**
 * Initialize or update progress after completing a task
 */
export async function updateProgress(uid, subject, topic, wasCorrect, difficulty = null) {
  const progressId = getProgressId(subject, topic);
  const progressRef = doc(db, "users", uid, "progress", progressId);
  const snap = await getDoc(progressRef);
  
  const now = new Date();
  const todayStr = formatDate(now);
  
  if (snap.exists()) {
    const current = snap.data();
    const newAttempts = (current.attempts || 0) + 1;
    const newCorrect = (current.correct || 0) + (wasCorrect ? 1 : 0);
    const lastResult = wasCorrect ? 1 : 0;
    
    await setDoc(progressRef, {
      ...current,
      attempts: newAttempts,
      correct: newCorrect,
      last_result: lastResult,
      last_seen_at: todayStr,
      last_difficulty: difficulty,
      updated_at: serverTimestamp(),
    }, { merge: true });
    
    return {
      id: progressId,
      attempts: newAttempts,
      correct: newCorrect,
      last_result: lastResult,
    };
  } else {
    // Create new progress record
    const newProgress = {
      userId: uid,
      subjectId: subject,
      topicId: topic,
      attempts: 1,
      correct: wasCorrect ? 1 : 0,
      last_result: wasCorrect ? 1 : 0,
      last_seen_at: todayStr,
      last_difficulty: difficulty,
      review_level: 0,
      next_review_at: formatDate(addDays(now, REVIEW_INTERVALS[0])),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
    
    await setDoc(progressRef, newProgress);
    
    return { id: progressId, ...newProgress };
  }
}

/**
 * Update spaced repetition schedule based on task result
 * 
 * If wasCorrect:
 *   - Increase review_level (max 4)
 *   - Schedule next review further out
 * 
 * If not correct:
 *   - Decrease review_level (min 0)
 *   - Schedule review sooner
 */
export async function updateSpacedRepetition(uid, subject, topic, wasCorrect) {
  const progressId = getProgressId(subject, topic);
  const progressRef = doc(db, "users", uid, "progress", progressId);
  const snap = await getDoc(progressRef);
  
  const now = new Date();
  
  if (!snap.exists()) {
    // Create new record with initial spaced repetition
    const initialLevel = wasCorrect ? 1 : 0;
    const nextReviewDays = REVIEW_INTERVALS[initialLevel];
    
    const newProgress = {
      userId: uid,
      subjectId: subject,
      topicId: topic,
      attempts: 1,
      correct: wasCorrect ? 1 : 0,
      last_result: wasCorrect ? 1 : 0,
      last_seen_at: formatDate(now),
      review_level: initialLevel,
      next_review_at: formatDate(addDays(now, nextReviewDays)),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
    
    await setDoc(progressRef, newProgress);
    
    return {
      id: progressId,
      review_level: initialLevel,
      next_review_at: newProgress.next_review_at,
      interval_days: nextReviewDays,
    };
  }
  
  const current = snap.data();
  const currentLevel = current.review_level || 0;
  
  // Calculate new review level
  let newLevel;
  if (wasCorrect) {
    newLevel = Math.min(currentLevel + 1, MAX_REVIEW_LEVEL);
  } else {
    newLevel = Math.max(currentLevel - 1, 0);
  }
  
  const nextReviewDays = REVIEW_INTERVALS[newLevel];
  const nextReviewAt = formatDate(addDays(now, nextReviewDays));
  
  await setDoc(progressRef, {
    ...current,
    review_level: newLevel,
    next_review_at: nextReviewAt,
    last_seen_at: formatDate(now),
    updated_at: serverTimestamp(),
  }, { merge: true });
  
  return {
    id: progressId,
    previous_level: currentLevel,
    review_level: newLevel,
    next_review_at: nextReviewAt,
    interval_days: nextReviewDays,
  };
}

/**
 * Get progress statistics for a subject
 */
export async function getSubjectStats(uid, subject) {
  const allProgress = await getAllProgress(uid);
  const subjectProgress = allProgress.filter(p => p.subjectId === subject);
  
  if (subjectProgress.length === 0) {
    return {
      total_topics: 0,
      average_success_rate: 0,
      topics_due_for_review: 0,
      weakest_topics: [],
    };
  }
  
  const today = formatDate(new Date());
  const topicsDue = subjectProgress.filter(p => p.next_review_at && p.next_review_at <= today);
  
  // Calculate success rates
  const topicsWithAttempts = subjectProgress.filter(p => p.attempts > 0);
  const successRates = topicsWithAttempts.map(p => ({
    topic: p.topicId,
    rate: p.attempts > 0 ? (p.correct / p.attempts) : 0,
    attempts: p.attempts,
  }));
  
  const avgRate = successRates.length > 0
    ? successRates.reduce((sum, t) => sum + t.rate, 0) / successRates.length
    : 0;
  
  // Find weakest topics (lowest success rate with at least 2 attempts)
  const weakest = successRates
    .filter(t => t.attempts >= 2)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3);
  
  return {
    total_topics: subjectProgress.length,
    average_success_rate: Math.round(avgRate * 100),
    topics_due_for_review: topicsDue.length,
    weakest_topics: weakest,
  };
}

/**
 * Export constants for use in other modules
 */
export const SPACED_REPETITION = {
  intervals: REVIEW_INTERVALS,
  maxLevel: MAX_REVIEW_LEVEL,
};


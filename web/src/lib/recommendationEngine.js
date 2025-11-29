// web/src/lib/recommendationEngine.js
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { getTopicsDueForReview, getSubjectStats } from "./progressStore";

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
 * Calculate days between two date strings (YYYY-MM-DD)
 */
function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get today's scheduled tasks
 */
async function getTodayTasks(uid, todayStr) {
  const scheduleRef = doc(db, "users", uid, "schedule", todayStr);
  const snap = await getDoc(scheduleRef);
  
  if (!snap.exists()) {
    return [];
  }
  
  const schedule = snap.data();
  return (schedule.tasks || []).filter(t => t.status === "pending");
}

/**
 * Get overdue tasks (scheduled before today, still pending)
 */
async function getOverdueTasks(uid, todayStr) {
  const scheduleRef = collection(db, "users", uid, "schedule");
  const snap = await getDocs(scheduleRef);
  
  const overdue = [];
  
  snap.docs.forEach(doc => {
    const schedule = doc.data();
    if (schedule.date && schedule.date < todayStr) {
      const pendingTasks = (schedule.tasks || []).filter(t => t.status === "pending");
      pendingTasks.forEach(task => {
        overdue.push({
          ...task,
          original_date: schedule.date,
          days_overdue: daysBetween(schedule.date, todayStr),
        });
      });
    }
  });
  
  return overdue;
}

/**
 * Generate reason text based on tags
 */
function generateReasonText(tags, meta = {}) {
  const reasons = [];
  
  if (tags.includes("overdue")) {
    reasons.push(`Tarefa atrasada há ${meta.days_overdue || "alguns"} dia(s)`);
  }
  
  if (tags.includes("review_due")) {
    reasons.push("Revisão espaçada programada para hoje");
  }
  
  if (tags.includes("low_success_rate")) {
    reasons.push(`Taxa de acerto baixa (${meta.success_rate || 0}%)`);
  }
  
  if (tags.includes("high_priority")) {
    reasons.push("Matéria marcada como prioridade alta");
  }
  
  if (tags.includes("scheduled_today")) {
    reasons.push("Agendada para hoje no seu plano");
  }
  
  if (tags.includes("needs_practice")) {
    reasons.push("Tópico precisa de mais prática");
  }
  
  if (reasons.length === 0) {
    reasons.push("Faz parte do seu plano de estudos");
  }
  
  return reasons.join(". ") + ".";
}

/**
 * Calculate priority score for a recommendation
 * Higher score = higher priority
 */
function calculatePriorityScore(item) {
  let score = 0;
  
  // Overdue tasks get high priority
  if (item.tags.includes("overdue")) {
    score += 100;
    score += (item.meta.days_overdue || 1) * 10; // More overdue = higher priority
  }
  
  // Review due gets medium-high priority
  if (item.tags.includes("review_due")) {
    score += 80;
  }
  
  // Low success rate increases priority
  if (item.tags.includes("low_success_rate")) {
    score += 50;
    score += (100 - (item.meta.success_rate || 50)); // Lower rate = higher priority
  }
  
  // High priority subjects
  if (item.tags.includes("high_priority")) {
    score += 30;
  }
  
  // Scheduled for today
  if (item.tags.includes("scheduled_today")) {
    score += 20;
  }
  
  // Practice tasks get slight priority over theory
  if (item.type === "practice") {
    score += 5;
  }
  
  return score;
}

/**
 * Get all recommendations for today
 * Combines: today's tasks, overdue tasks, and spaced repetition reviews
 */
export async function getRecommendationsForToday(uid, date = new Date()) {
  const todayStr = formatDate(date);
  const recommendations = [];
  
  try {
    // 1. Get today's pending tasks
    const todayTasks = await getTodayTasks(uid, todayStr);
    
    for (const task of todayTasks) {
      const tags = ["scheduled_today"];
      const meta = {};
      
      // Check if high priority (we'd need to load goals, simplify for now)
      
      recommendations.push({
        id: `today_${task.id}`,
        type: task.type || "study",
        recommendation_type: "scheduled",
        subject: task.subject,
        topic: task.topic,
        description: task.description,
        duration: task.duration,
        original_task: task,
        tags,
        meta,
        reason_text: generateReasonText(tags, meta),
        priority_score: 0, // Will be calculated
      });
    }
    
    // 2. Get overdue tasks
    const overdueTasks = await getOverdueTasks(uid, todayStr);
    
    for (const task of overdueTasks) {
      const tags = ["overdue"];
      const meta = {
        days_overdue: task.days_overdue,
        original_date: task.original_date,
      };
      
      recommendations.push({
        id: `overdue_${task.id}`,
        type: task.type || "study",
        recommendation_type: "overdue",
        subject: task.subject,
        topic: task.topic,
        description: task.description,
        duration: task.duration,
        original_task: task,
        tags,
        meta,
        reason_text: generateReasonText(tags, meta),
        priority_score: 0,
      });
    }
    
    // 3. Get topics due for spaced repetition review
    const reviewTopics = await getTopicsDueForReview(uid, date);
    
    for (const progress of reviewTopics) {
      // Check if already in recommendations (avoid duplicates)
      const alreadyRecommended = recommendations.some(
        r => r.subject === progress.subjectId && r.topic === progress.topicId
      );
      
      if (alreadyRecommended) {
        // Add review_due tag to existing recommendation
        const existing = recommendations.find(
          r => r.subject === progress.subjectId && r.topic === progress.topicId
        );
        if (existing && !existing.tags.includes("review_due")) {
          existing.tags.push("review_due");
          existing.meta.review_level = progress.review_level;
          existing.reason_text = generateReasonText(existing.tags, existing.meta);
        }
        continue;
      }
      
      // Calculate success rate
      const successRate = progress.attempts > 0
        ? Math.round((progress.correct / progress.attempts) * 100)
        : 0;
      
      const tags = ["review_due"];
      const meta = {
        review_level: progress.review_level,
        success_rate: successRate,
        last_seen: progress.last_seen_at,
      };
      
      if (successRate < 60 && progress.attempts >= 2) {
        tags.push("low_success_rate");
      }
      
      recommendations.push({
        id: `review_${progress.id}`,
        type: "review",
        recommendation_type: "review",
        subject: progress.subjectId,
        topic: progress.topicId,
        description: `Revisar ${progress.topicId}`,
        duration: 15, // Default review duration
        original_progress: progress,
        tags,
        meta,
        reason_text: generateReasonText(tags, meta),
        priority_score: 0,
      });
    }
    
    // 4. Calculate priority scores
    recommendations.forEach(rec => {
      rec.priority_score = calculatePriorityScore(rec);
    });
    
    // 5. Sort by priority (highest first)
    recommendations.sort((a, b) => b.priority_score - a.priority_score);
    
    return recommendations;
  } catch (error) {
    console.error("Error getting recommendations:", error);
    return [];
  }
}

/**
 * Get summary statistics for recommendations
 */
export async function getRecommendationStats(uid, date = new Date()) {
  const recommendations = await getRecommendationsForToday(uid, date);
  
  const stats = {
    total: recommendations.length,
    scheduled: recommendations.filter(r => r.recommendation_type === "scheduled").length,
    overdue: recommendations.filter(r => r.recommendation_type === "overdue").length,
    reviews: recommendations.filter(r => r.recommendation_type === "review").length,
    total_minutes: recommendations.reduce((sum, r) => sum + (r.duration || 0), 0),
    high_priority_count: recommendations.filter(r => r.priority_score >= 100).length,
  };
  
  return stats;
}

/**
 * Get top N recommendations
 */
export async function getTopRecommendations(uid, limit = 5, date = new Date()) {
  const all = await getRecommendationsForToday(uid, date);
  return all.slice(0, limit);
}

/**
 * Get recommendations grouped by subject
 */
export async function getRecommendationsBySubject(uid, date = new Date()) {
  const recommendations = await getRecommendationsForToday(uid, date);
  
  const grouped = {};
  
  recommendations.forEach(rec => {
    const subject = rec.subject || "Outros";
    if (!grouped[subject]) {
      grouped[subject] = [];
    }
    grouped[subject].push(rec);
  });
  
  return grouped;
}


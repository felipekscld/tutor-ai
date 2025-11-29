// web/src/lib/feedbackStore.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";

/**
 * Predefined difficulty reasons
 */
export const DIFFICULTY_REASONS = [
  { id: "theory_unclear", label: "Não entendi a teoria", icon: "📚" },
  { id: "exercises_confusing", label: "Exercícios confusos", icon: "🧩" },
  { id: "lack_of_practice", label: "Falta de prática", icon: "🔄" },
  { id: "too_complex", label: "Conteúdo muito complexo", icon: "🧠" },
  { id: "prerequisites_missing", label: "Faltam pré-requisitos", icon: "📋" },
  { id: "other", label: "Outro motivo", icon: "💭" },
];

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
 * Save difficulty feedback from user
 */
export async function saveDifficultyFeedback(uid, subject, topic, difficulty, reasons = [], notes = "") {
  const feedbackRef = collection(db, "users", uid, "difficulty_feedback");
  
  const feedback = {
    subject,
    topic,
    difficulty, // easy, medium, hard
    reasons, // Array of reason IDs
    notes, // Optional text notes
    date: formatDate(new Date()),
    timestamp: serverTimestamp(),
  };
  
  const docRef = await addDoc(feedbackRef, feedback);
  
  // Also update a summary document for quick access
  await updateDifficultySummary(uid, subject, topic, difficulty, reasons);
  
  return { id: docRef.id, ...feedback };
}

/**
 * Update difficulty summary for a topic
 */
async function updateDifficultySummary(uid, subject, topic, difficulty, reasons) {
  const summaryId = `${subject}_${topic}`.replace(/\s+/g, "_").toLowerCase();
  const summaryRef = doc(db, "users", uid, "difficulty_summary", summaryId);
  
  const snap = await getDoc(summaryRef);
  
  if (snap.exists()) {
    const current = snap.data();
    const reasonCounts = current.reason_counts || {};
    
    // Increment reason counts
    reasons.forEach(r => {
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    });
    
    await setDoc(summaryRef, {
      ...current,
      subject,
      topic,
      total_reports: (current.total_reports || 0) + 1,
      last_difficulty: difficulty,
      last_reported_at: serverTimestamp(),
      reason_counts: reasonCounts,
      difficulty_history: [...(current.difficulty_history || []).slice(-9), difficulty],
    }, { merge: true });
  } else {
    const reasonCounts = {};
    reasons.forEach(r => { reasonCounts[r] = 1; });
    
    await setDoc(summaryRef, {
      subject,
      topic,
      total_reports: 1,
      last_difficulty: difficulty,
      last_reported_at: serverTimestamp(),
      reason_counts: reasonCounts,
      difficulty_history: [difficulty],
      created_at: serverTimestamp(),
    });
  }
}

/**
 * Get difficulty history for a subject
 */
export async function getDifficultyHistory(uid, subject, maxResults = 30) {
  const feedbackRef = collection(db, "users", uid, "difficulty_feedback");
  
  const q = query(
    feedbackRef,
    where("subject", "==", subject),
    orderBy("timestamp", "desc"),
    limit(maxResults)
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error getting difficulty history:", e);
    return [];
  }
}

/**
 * Get all difficulty feedback for a user
 */
export async function getAllDifficultyFeedback(uid, maxResults = 100) {
  const feedbackRef = collection(db, "users", uid, "difficulty_feedback");
  
  const q = query(
    feedbackRef,
    orderBy("timestamp", "desc"),
    limit(maxResults)
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error getting all difficulty feedback:", e);
    return [];
  }
}

/**
 * Get topics with most difficulty reports (problematic topics)
 */
export async function getProblematicTopics(uid, minReports = 1) {
  const summaryRef = collection(db, "users", uid, "difficulty_summary");
  
  try {
    const snap = await getDocs(summaryRef);
    
    const topics = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(t => t.total_reports >= minReports)
      .sort((a, b) => b.total_reports - a.total_reports);
    
    return topics;
  } catch (e) {
    console.error("Error getting problematic topics:", e);
    return [];
  }
}

/**
 * Get difficulty summary for a specific topic
 */
export async function getTopicDifficultySummary(uid, subject, topic) {
  const summaryId = `${subject}_${topic}`.replace(/\s+/g, "_").toLowerCase();
  const summaryRef = doc(db, "users", uid, "difficulty_summary", summaryId);
  
  try {
    const snap = await getDoc(summaryRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (e) {
    console.error("Error getting topic difficulty summary:", e);
    return null;
  }
}

/**
 * Get recent difficult topics for context (last 30 days)
 */
export async function getRecentDifficultTopics(uid, daysBack = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = formatDate(cutoffDate);
  
  const feedbackRef = collection(db, "users", uid, "difficulty_feedback");
  
  const q = query(
    feedbackRef,
    where("date", ">=", cutoffStr),
    orderBy("date", "desc")
  );
  
  try {
    const snap = await getDocs(q);
    const feedback = snap.docs.map(doc => doc.data());
    
    // Group by subject/topic
    const grouped = {};
    feedback.forEach(f => {
      const key = `${f.subject}|${f.topic}`;
      if (!grouped[key]) {
        grouped[key] = {
          subject: f.subject,
          topic: f.topic,
          count: 0,
          lastDifficulty: f.difficulty,
          reasons: [],
        };
      }
      grouped[key].count++;
      if (f.reasons) {
        grouped[key].reasons.push(...f.reasons);
      }
    });
    
    // Convert to array and sort by count
    return Object.values(grouped)
      .sort((a, b) => b.count - a.count)
      .map(item => ({
        ...item,
        reasons: [...new Set(item.reasons)], // Unique reasons
      }));
  } catch (e) {
    console.error("Error getting recent difficult topics:", e);
    return [];
  }
}

/**
 * Check if topic is marked as difficult (for AI context)
 */
export async function isTopicDifficult(uid, subject, topic) {
  const summary = await getTopicDifficultySummary(uid, subject, topic);
  
  if (!summary) return false;
  
  // Consider topic difficult if:
  // - Has 2+ reports OR
  // - Last reported difficulty was "hard"
  return summary.total_reports >= 2 || summary.last_difficulty === "hard";
}

/**
 * Get formatted difficulty context for AI prompt
 */
export async function getDifficultyContextForAI(uid, subject = null) {
  const difficultTopics = await getRecentDifficultTopics(uid);
  
  // Filter by subject if provided
  const relevant = subject 
    ? difficultTopics.filter(t => t.subject === subject)
    : difficultTopics;
  
  if (relevant.length === 0) {
    return null;
  }
  
  // Build context object
  const context = {
    difficult_topics: relevant.map(t => ({
      subject: t.subject,
      topic: t.topic,
      times_reported: t.count,
      main_reasons: t.reasons.slice(0, 3).map(r => 
        DIFFICULTY_REASONS.find(dr => dr.id === r)?.label || r
      ),
    })),
    most_problematic: relevant[0] ? `${relevant[0].subject} - ${relevant[0].topic}` : null,
    total_difficult_topics: relevant.length,
  };
  
  return context;
}


// web/src/lib/gamificationEngine.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

/**
 * XP thresholds for each level
 * Level 1 = 0 XP, Level 2 = 100 XP, etc.
 */
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500, 10000];

/**
 * XP rewards
 */
const XP_REWARDS = {
  TASK_COMPLETE: 10,
  TASK_HARD_BONUS: 5,
  STREAK_BONUS: 3,
  REVIEW_COMPLETE: 8,
  PERFECT_DAY: 25, // All tasks completed
};

/**
 * Badge definitions
 */
const BADGES = {
  FIRST_SESSION: {
    id: "first_session",
    name: "Primeiro Passo",
    description: "Completou sua primeira tarefa de estudo",
    icon: "🎯",
  },
  STREAK_3: {
    id: "streak_3",
    name: "Consistente",
    description: "3 dias seguidos de estudo",
    icon: "🔥",
  },
  STREAK_7: {
    id: "streak_7",
    name: "Semana Perfeita",
    description: "7 dias seguidos de estudo",
    icon: "⚡",
  },
  STREAK_30: {
    id: "streak_30",
    name: "Mestre da Disciplina",
    description: "30 dias seguidos de estudo",
    icon: "🏆",
  },
  XP_100: {
    id: "xp_100",
    name: "Iniciante",
    description: "Acumulou 100 XP",
    icon: "⭐",
  },
  XP_500: {
    id: "xp_500",
    name: "Estudante Dedicado",
    description: "Acumulou 500 XP",
    icon: "🌟",
  },
  XP_1000: {
    id: "xp_1000",
    name: "Veterano",
    description: "Acumulou 1000 XP",
    icon: "💫",
  },
  PERFECT_WEEK: {
    id: "perfect_week",
    name: "Semana Impecável",
    description: "Completou todas as tarefas por 7 dias",
    icon: "👑",
  },
  NIGHT_OWL: {
    id: "night_owl",
    name: "Coruja Noturna",
    description: "Estudou após às 22h",
    icon: "🦉",
  },
  EARLY_BIRD: {
    id: "early_bird",
    name: "Madrugador",
    description: "Estudou antes das 7h",
    icon: "🐦",
  },
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
 * Check if two dates are consecutive days
 */
function isConsecutiveDay(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  const diffTime = d2 - d1;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays === 1;
}

/**
 * Check if date is today
 */
function isToday(dateStr) {
  return dateStr === formatDate(new Date());
}

/**
 * Get gamification stats for a user
 */
export async function getGamificationStats(uid) {
  const statsRef = doc(db, "users", uid, "gamification", "stats");
  const snap = await getDoc(statsRef);
  
  if (snap.exists()) {
    return snap.data();
  }
  
  // Initialize default stats
  const defaultStats = {
    xp: 0,
    level: 1,
    current_streak: 0,
    best_streak: 0,
    last_active_date: null,
    total_tasks_completed: 0,
    total_study_minutes: 0,
    created_at: serverTimestamp(),
  };
  
  await setDoc(statsRef, defaultStats);
  return defaultStats;
}

/**
 * Get earned badges for a user
 */
export async function getEarnedBadges(uid) {
  const badgesRef = collection(db, "users", uid, "gamification", "stats", "badges");
  const snap = await getDocs(badgesRef);
  
  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    ...BADGES[doc.id.toUpperCase()],
  }));
}

/**
 * Calculate level from XP
 */
export function calculateLevel(xp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Get XP needed for next level
 */
export function getXPToNextLevel(xp) {
  const currentLevel = calculateLevel(xp);
  if (currentLevel >= LEVEL_THRESHOLDS.length) {
    return 0; // Max level
  }
  return LEVEL_THRESHOLDS[currentLevel] - xp;
}

/**
 * Get progress to next level (0-100)
 */
export function getLevelProgress(xp) {
  const currentLevel = calculateLevel(xp);
  if (currentLevel >= LEVEL_THRESHOLDS.length) {
    return 100; // Max level
  }
  
  const currentThreshold = LEVEL_THRESHOLDS[currentLevel - 1];
  const nextThreshold = LEVEL_THRESHOLDS[currentLevel];
  const xpInCurrentLevel = xp - currentThreshold;
  const xpNeededForLevel = nextThreshold - currentThreshold;
  
  return Math.round((xpInCurrentLevel / xpNeededForLevel) * 100);
}

/**
 * Add XP to user
 * Returns { newXP, xpGained, leveledUp, newLevel }
 */
export async function addXP(uid, amount, reason = "task") {
  const statsRef = doc(db, "users", uid, "gamification", "stats");
  const stats = await getGamificationStats(uid);
  
  const oldLevel = calculateLevel(stats.xp);
  const newXP = stats.xp + amount;
  const newLevel = calculateLevel(newXP);
  const leveledUp = newLevel > oldLevel;
  
  await setDoc(statsRef, {
    ...stats,
    xp: newXP,
    level: newLevel,
    updated_at: serverTimestamp(),
  }, { merge: true });
  
  // Check for XP badges
  await checkAndAwardBadges(uid, { xp: newXP });
  
  return {
    newXP,
    xpGained: amount,
    leveledUp,
    newLevel,
    oldLevel,
  };
}

/**
 * Update streak
 * Call this when user completes an activity
 */
export async function updateStreak(uid) {
  const statsRef = doc(db, "users", uid, "gamification", "stats");
  const stats = await getGamificationStats(uid);
  
  const todayStr = formatDate(new Date());
  const lastActiveDate = stats.last_active_date;
  
  let newStreak = stats.current_streak;
  let bestStreak = stats.best_streak;
  
  if (!lastActiveDate) {
    // First activity
    newStreak = 1;
  } else if (lastActiveDate === todayStr) {
    // Already active today, no change
    return { streak: newStreak, updated: false };
  } else if (isConsecutiveDay(lastActiveDate, todayStr)) {
    // Consecutive day
    newStreak = stats.current_streak + 1;
  } else {
    // Streak broken
    newStreak = 1;
  }
  
  if (newStreak > bestStreak) {
    bestStreak = newStreak;
  }
  
  await setDoc(statsRef, {
    ...stats,
    current_streak: newStreak,
    best_streak: bestStreak,
    last_active_date: todayStr,
    updated_at: serverTimestamp(),
  }, { merge: true });
  
  // Check for streak badges
  await checkAndAwardBadges(uid, { streak: newStreak });
  
  return { streak: newStreak, bestStreak, updated: true };
}

/**
 * Record task completion and update gamification
 * Call this from scheduleStore when task is marked done
 */
export async function recordTaskCompletion(uid, task, difficulty = null) {
  const statsRef = doc(db, "users", uid, "gamification", "stats");
  const stats = await getGamificationStats(uid);
  
  // Calculate XP
  let xpGained = XP_REWARDS.TASK_COMPLETE;
  
  if (difficulty === "hard") {
    xpGained += XP_REWARDS.TASK_HARD_BONUS;
  }
  
  if (stats.current_streak >= 3) {
    xpGained += XP_REWARDS.STREAK_BONUS;
  }
  
  if (task.type === "review") {
    xpGained = XP_REWARDS.REVIEW_COMPLETE;
  }
  
  // Add XP
  const xpResult = await addXP(uid, xpGained, "task_completion");
  
  // Update streak
  const streakResult = await updateStreak(uid);
  
  // Update total tasks
  await setDoc(statsRef, {
    total_tasks_completed: (stats.total_tasks_completed || 0) + 1,
    total_study_minutes: (stats.total_study_minutes || 0) + (task.duration || 0),
    updated_at: serverTimestamp(),
  }, { merge: true });
  
  // Check for first session badge
  if (stats.total_tasks_completed === 0) {
    await awardBadge(uid, "FIRST_SESSION");
  }
  
  // Check for time-based badges
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 5) {
    await checkAndAwardBadges(uid, { timeOfDay: "night" });
  } else if (hour < 7) {
    await checkAndAwardBadges(uid, { timeOfDay: "early" });
  }
  
  return {
    xp: xpResult,
    streak: streakResult,
    totalCompleted: stats.total_tasks_completed + 1,
  };
}

/**
 * Award a badge to user
 */
export async function awardBadge(uid, badgeKey) {
  const badgeId = badgeKey.toLowerCase();
  const badgeRef = doc(db, "users", uid, "gamification", "stats", "badges", badgeId);
  
  const snap = await getDoc(badgeRef);
  if (snap.exists()) {
    return { awarded: false, alreadyHad: true };
  }
  
  const badge = BADGES[badgeKey];
  if (!badge) {
    console.warn(`Badge not found: ${badgeKey}`);
    return { awarded: false, notFound: true };
  }
  
  await setDoc(badgeRef, {
    badge_id: badge.id,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    earned_at: serverTimestamp(),
  });
  
  return { awarded: true, badge };
}

/**
 * Check conditions and award badges if earned
 */
export async function checkAndAwardBadges(uid, context = {}) {
  const awarded = [];
  
  // XP badges
  if (context.xp) {
    if (context.xp >= 100) {
      const result = await awardBadge(uid, "XP_100");
      if (result.awarded) awarded.push(result.badge);
    }
    if (context.xp >= 500) {
      const result = await awardBadge(uid, "XP_500");
      if (result.awarded) awarded.push(result.badge);
    }
    if (context.xp >= 1000) {
      const result = await awardBadge(uid, "XP_1000");
      if (result.awarded) awarded.push(result.badge);
    }
  }
  
  // Streak badges
  if (context.streak) {
    if (context.streak >= 3) {
      const result = await awardBadge(uid, "STREAK_3");
      if (result.awarded) awarded.push(result.badge);
    }
    if (context.streak >= 7) {
      const result = await awardBadge(uid, "STREAK_7");
      if (result.awarded) awarded.push(result.badge);
    }
    if (context.streak >= 30) {
      const result = await awardBadge(uid, "STREAK_30");
      if (result.awarded) awarded.push(result.badge);
    }
  }
  
  // Time of day badges
  if (context.timeOfDay === "night") {
    const result = await awardBadge(uid, "NIGHT_OWL");
    if (result.awarded) awarded.push(result.badge);
  }
  if (context.timeOfDay === "early") {
    const result = await awardBadge(uid, "EARLY_BIRD");
    if (result.awarded) awarded.push(result.badge);
  }
  
  return awarded;
}

/**
 * Get all available badges with earned status
 */
export async function getAllBadgesWithStatus(uid) {
  const earned = await getEarnedBadges(uid);
  const earnedIds = new Set(earned.map(b => b.id));
  
  return Object.entries(BADGES).map(([key, badge]) => ({
    ...badge,
    earned: earnedIds.has(badge.id),
    earnedAt: earned.find(e => e.id === badge.id)?.earned_at || null,
  }));
}

/**
 * Export constants
 */
export { BADGES, LEVEL_THRESHOLDS, XP_REWARDS };


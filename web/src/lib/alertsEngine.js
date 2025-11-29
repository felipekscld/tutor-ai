// web/src/lib/alertsEngine.js
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { getReplanStatus } from "./replanEngine";
import { getAllProgress } from "./progressStore";

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
 * Get days with activity in the last N days
 */
async function getActiveDaysCount(uid, daysBack = 7) {
  const activityRef = collection(db, "users", uid, "activity_log");
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  startDate.setHours(0, 0, 0, 0);
  
  try {
    const q = query(
      activityRef,
      where("type", "==", "task_update"),
      orderBy("timestamp", "desc")
    );
    
    const snap = await getDocs(q);
    
    // Count unique days with activity
    const activeDays = new Set();
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.date) {
        activeDays.add(data.date);
      } else if (data.timestamp) {
        const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        if (date >= startDate) {
          activeDays.add(formatDate(date));
        }
      }
    });
    
    // Filter to only days in the last N days
    const today = new Date();
    const validDays = Array.from(activeDays).filter(dateStr => {
      const date = new Date(dateStr);
      const daysDiff = Math.floor((today - date) / (1000 * 60 * 60 * 24));
      return daysDiff <= daysBack;
    });
    
    return validDays.length;
  } catch (error) {
    console.error("Error getting active days:", error);
    return 0;
  }
}

/**
 * Get topics with critical performance (low success rate, multiple attempts)
 */
async function getCriticalTopics(uid) {
  try {
    const allProgress = await getAllProgress(uid);
    
    // Filter topics with:
    // - At least 3 attempts
    // - Success rate below 50%
    const critical = allProgress.filter(p => {
      if (!p.attempts || p.attempts < 3) return false;
      const successRate = p.correct / p.attempts;
      return successRate < 0.5;
    });
    
    return critical.map(p => ({
      subject: p.subjectId,
      topic: p.topicId,
      attempts: p.attempts,
      correct: p.correct,
      successRate: Math.round((p.correct / p.attempts) * 100),
    }));
  } catch (error) {
    console.error("Error getting critical topics:", error);
    return [];
  }
}

/**
 * Alert types
 */
export const ALERT_TYPES = {
  LOW_ACTIVITY: "low_activity",
  OVERDUE_TASKS: "overdue_tasks",
  CRITICAL_TOPICS: "critical_topics",
  REVIEW_DUE: "review_due",
};

/**
 * Compute all alerts for a user
 * 
 * @param {string} uid - User ID
 * @returns {Array} List of alerts with { type, title, text, severity, cta }
 */
export async function computeAlerts(uid) {
  const alerts = [];
  
  try {
    // 1. Check for low activity (rhythm drop)
    const activeDays = await getActiveDaysCount(uid, 7);
    
    if (activeDays < 3) {
      const severity = activeDays === 0 ? "high" : "medium";
      alerts.push({
        id: "low_activity",
        type: ALERT_TYPES.LOW_ACTIVITY,
        title: "Queda de ritmo",
        text: activeDays === 0
          ? "Você não estudou nos últimos 7 dias. Voltar à rotina fica mais difícil com o tempo!"
          : `Apenas ${activeDays} dia(s) de estudo nos últimos 7 dias. Tente manter a consistência!`,
        severity,
        cta: {
          label: "Ver cronograma",
          action: "view_schedule",
        },
      });
    }
    
    // 2. Check for overdue tasks
    const replanStatus = await getReplanStatus(uid);
    
    if (replanStatus.overdueCount > 5) {
      alerts.push({
        id: "overdue_tasks",
        type: ALERT_TYPES.OVERDUE_TASKS,
        title: "Muitas tarefas atrasadas",
        text: `Você tem ${replanStatus.overdueCount} tarefa(s) pendente(s) de dias anteriores. Considere replanejar seu cronograma.`,
        severity: "high",
        cta: {
          label: "Replanejar cronograma",
          action: "replan",
        },
      });
    } else if (replanStatus.overdueCount > 0) {
      alerts.push({
        id: "overdue_tasks",
        type: ALERT_TYPES.OVERDUE_TASKS,
        title: "Tarefas atrasadas",
        text: `Você tem ${replanStatus.overdueCount} tarefa(s) atrasada(s).`,
        severity: "low",
        cta: {
          label: "Ver sugestões",
          action: "view_suggestions",
        },
      });
    }
    
    // 3. Check for critical topics (low performance)
    const criticalTopics = await getCriticalTopics(uid);
    
    if (criticalTopics.length > 0) {
      const topicNames = criticalTopics.slice(0, 3).map(t => t.topic).join(", ");
      alerts.push({
        id: "critical_topics",
        type: ALERT_TYPES.CRITICAL_TOPICS,
        title: "Conteúdos que precisam de atenção",
        text: `Os tópicos ${topicNames} têm taxa de acerto abaixo de 50%. Recomendamos revisão!`,
        severity: "medium",
        cta: {
          label: "Ver sugestões de revisão",
          action: "view_suggestions",
        },
        meta: {
          topics: criticalTopics,
        },
      });
    }
    
    // Sort by severity
    const severityOrder = { high: 0, medium: 1, low: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    return alerts;
  } catch (error) {
    console.error("Error computing alerts:", error);
    return [];
  }
}

/**
 * Get alert summary (counts by type)
 */
export async function getAlertSummary(uid) {
  const alerts = await computeAlerts(uid);
  
  return {
    total: alerts.length,
    high: alerts.filter(a => a.severity === "high").length,
    medium: alerts.filter(a => a.severity === "medium").length,
    low: alerts.filter(a => a.severity === "low").length,
    alerts,
  };
}

/**
 * Check if user has any critical alerts
 */
export async function hasCriticalAlerts(uid) {
  const alerts = await computeAlerts(uid);
  return alerts.some(a => a.severity === "high");
}


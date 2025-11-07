// web/src/lib/goalsEngine.js
import { db } from "../firebase";
import { doc, setDoc, getDoc, collection, writeBatch, serverTimestamp } from "firebase/firestore";

/**
 * Generate goals based on user profile
 * Distributes daily minutes across subjects/topics based on weight/priority
 * Creates alternation schedule for different days of the week
 */
export async function generateGoals(uid, profile) {
  const { daily_minutes, subjects } = profile;
  
  if (!daily_minutes || !subjects || subjects.length === 0) {
    throw new Error("Invalid profile data");
  }

  // Calculate total weight
  const totalWeight = subjects.reduce((sum, s) => sum + (s.weight || 1), 0);
  
  // Distribute minutes proportionally to weights
  const goals = [];
  const dailyDistribution = {};
  
  subjects.forEach((subject) => {
    const weight = subject.weight || 1;
    const allocatedMinutes = Math.round((weight / totalWeight) * daily_minutes);
    
    // For each topic in the subject
    subject.topics.forEach((topic, topicIndex) => {
      // Distribute minutes among topics (equal distribution within subject)
      const topicMinutes = Math.round(allocatedMinutes / subject.topics.length);
      
      // Create alternation pattern (rotate days based on topic index)
      // This ensures different topics are studied on different days
      const daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const startDay = topicIndex % 7;
      const studyDays = [];
      
      // Study this topic every 2-3 days depending on priority
      const frequency = weight >= 2 ? 2 : 3; // High priority = every 2 days, normal = every 3 days
      
      for (let i = 0; i < 7; i++) {
        if ((i - startDay) % frequency === 0) {
          studyDays.push(daysOfWeek[(startDay + i) % 7]);
        }
      }
      
      const goalId = `${subject.subject}_${topic}`.replace(/\s+/g, "_").toLowerCase();
      
      goals.push({
        id: goalId,
        subject: subject.subject,
        topic,
        weight,
        priority: weight >= 2 ? "high" : weight >= 1.5 ? "medium" : "normal",
        allocation_minutes: topicMinutes,
        study_days: studyDays,
      });
      
      // Build daily distribution summary
      studyDays.forEach(day => {
        if (!dailyDistribution[day]) {
          dailyDistribution[day] = [];
        }
        dailyDistribution[day].push({
          subject: subject.subject,
          topic,
          minutes: topicMinutes,
        });
      });
    });
  });

  // Save to Firestore using batch write
  const batch = writeBatch(db);
  
  // Save individual goals
  goals.forEach((goal) => {
    const goalRef = doc(db, "users", uid, "goals", goal.id);
    batch.set(goalRef, {
      ...goal,
      created_at: serverTimestamp(),
    });
  });
  
  // Save goals summary
  const summaryRef = doc(db, "users", uid, "goals_summary", "current");
  batch.set(summaryRef, {
    total_subjects: subjects.length,
    total_topics: goals.length,
    daily_minutes,
    daily_distribution: dailyDistribution,
    goals_list: goals.map(g => ({ id: g.id, subject: g.subject, topic: g.topic })),
    last_updated: serverTimestamp(),
  });
  
  await batch.commit();
  
  console.log(`✓ Generated ${goals.length} goals for ${subjects.length} subjects`);
  
  return {
    goals,
    summary: {
      total_subjects: subjects.length,
      total_topics: goals.length,
      daily_minutes,
      daily_distribution: dailyDistribution,
    },
  };
}

/**
 * Get current goals summary for a user
 */
export async function getGoalsSummary(uid) {
  const summaryRef = doc(db, "users", uid, "goals_summary", "current");
  const snap = await getDoc(summaryRef);
  
  if (snap.exists()) {
    return snap.data();
  }
  
  return null;
}


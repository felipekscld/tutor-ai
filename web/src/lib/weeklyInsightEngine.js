// web/src/lib/weeklyInsightEngine.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from "firebase/firestore";

/**
 * Get date string in YYYY-MM-DD format
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get the start of a week (Monday)
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

/**
 * Gather weekly stats for a user (comprehensive)
 */
async function gatherWeeklyStats(uid) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Get all schedules from the last 7 days
  const scheduleRef = collection(db, "users", uid, "schedule");
  const scheduleSnap = await getDocs(scheduleRef);
  
  const weeklyData = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    skippedTasks: 0,
    totalMinutesPlanned: 0,
    totalMinutesStudied: 0,
    subjectStats: {},
    dailyMinutes: {},
    difficulties: { easy: 0, medium: 0, hard: 0 },
    hardTopics: [],
    failedTopics: [],
    bestDays: [],
    worstDays: [],
  };
  
  scheduleSnap.docs.forEach(docSnap => {
    const dateStr = docSnap.id;
    if (dateStr < formatDate(weekAgo) || dateStr > formatDate(now)) return;
    
    const schedule = docSnap.data();
    const tasks = schedule.tasks || [];
    
    let dayMinutes = 0;
    let dayCompleted = 0;
    let dayTotal = 0;
    
    tasks.forEach(task => {
      weeklyData.totalTasks++;
      weeklyData.totalMinutesPlanned += task.duration || 0;
      dayTotal++;
      
      // Track subject
      if (!weeklyData.subjectStats[task.subject]) {
        weeklyData.subjectStats[task.subject] = {
          total: 0,
          completed: 0,
          failed: 0,
          topics: {},
        };
      }
      weeklyData.subjectStats[task.subject].total++;
      
      // Track topic
      if (!weeklyData.subjectStats[task.subject].topics[task.topic]) {
        weeklyData.subjectStats[task.subject].topics[task.topic] = {
          total: 0,
          completed: 0,
          failed: 0,
          difficulty: [],
        };
      }
      weeklyData.subjectStats[task.subject].topics[task.topic].total++;
      
      if (task.status === "done") {
        weeklyData.completedTasks++;
        weeklyData.subjectStats[task.subject].completed++;
        weeklyData.subjectStats[task.subject].topics[task.topic].completed++;
        weeklyData.totalMinutesStudied += task.duration || 0;
        dayMinutes += task.duration || 0;
        dayCompleted++;
        
        if (task.difficulty) {
          weeklyData.difficulties[task.difficulty]++;
          weeklyData.subjectStats[task.subject].topics[task.topic].difficulty.push(task.difficulty);
          
          // Track hard topics
          if (task.difficulty === "hard") {
            weeklyData.hardTopics.push({
              subject: task.subject,
              topic: task.topic,
            });
          }
        }
      } else if (task.status === "failed") {
        weeklyData.failedTasks++;
        weeklyData.subjectStats[task.subject].failed++;
        weeklyData.subjectStats[task.subject].topics[task.topic].failed++;
        
        // Track failed topics
        weeklyData.failedTopics.push({
          subject: task.subject,
          topic: task.topic,
        });
      } else if (task.status === "skipped") {
        weeklyData.skippedTasks++;
      }
    });
    
    weeklyData.dailyMinutes[dateStr] = dayMinutes;
    
    // Track best/worst days
    if (dayTotal > 0) {
      const dayRate = Math.round((dayCompleted / dayTotal) * 100);
      const dayName = new Date(dateStr).toLocaleDateString("pt-BR", { weekday: "long" });
      
      if (dayRate >= 80 && dayMinutes > 0) {
        weeklyData.bestDays.push({ date: dateStr, day: dayName, minutes: dayMinutes, rate: dayRate });
      }
      if (dayRate < 50 && dayTotal >= 2) {
        weeklyData.worstDays.push({ date: dateStr, day: dayName, minutes: dayMinutes, rate: dayRate });
      }
    }
  });
  
  // Get gamification stats
  const gamificationRef = doc(db, "users", uid, "gamification", "stats");
  const gamificationSnap = await getDoc(gamificationRef);
  
  if (gamificationSnap.exists()) {
    const gData = gamificationSnap.data();
    weeklyData.currentStreak = gData.current_streak || 0;
    weeklyData.totalXP = gData.total_xp || 0;
    weeklyData.level = gData.level || 1;
  }
  
  // Get recent chat sessions for context
  const chatSessionsRef = collection(db, "users", uid, "chat_sessions");
  const chatSnap = await getDocs(chatSessionsRef);
  
  weeklyData.chatTopics = [];
  weeklyData.totalChatMessages = 0;
  
  chatSnap.docs.forEach(docSnap => {
    const session = docSnap.data();
    const messages = session.messages || [];
    
    // Only count recent sessions
    const sessionDate = session.updated_at?.toDate?.() || session.created_at?.toDate?.();
    if (sessionDate && sessionDate >= weekAgo) {
      weeklyData.totalChatMessages += messages.length;
      
      if (session.subject) {
        weeklyData.chatTopics.push({
          subject: session.subject,
          topic: session.topic || "geral",
          messageCount: messages.length,
          title: session.title || session.subject,
        });
      }
    }
  });
  
  // Get progress data for spaced repetition insights
  const progressRef = collection(db, "users", uid, "progress");
  const progressSnap = await getDocs(progressRef);
  
  weeklyData.reviewsDue = [];
  weeklyData.topicsNeedingReview = [];
  
  const today = formatDate(now);
  
  progressSnap.docs.forEach(docSnap => {
    const progress = docSnap.data();
    
    if (progress.next_review_at && progress.next_review_at <= today) {
      weeklyData.reviewsDue.push({
        subject: progress.subject,
        topic: progress.topic,
        reviewLevel: progress.review_level || 1,
      });
    }
    
    // Topics that need more practice (low review level, failed recently)
    if (progress.review_level <= 2 && progress.last_failed_at) {
      weeklyData.topicsNeedingReview.push({
        subject: progress.subject,
        topic: progress.topic,
      });
    }
  });
  
  return weeklyData;
}

/**
 * Generate the insight prompt for the AI
 */
function buildInsightPrompt(stats, profile) {
  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0;
  
  const avgDailyMinutes = Object.values(stats.dailyMinutes).length > 0
    ? Math.round(Object.values(stats.dailyMinutes).reduce((a, b) => a + b, 0) / Object.values(stats.dailyMinutes).length)
    : 0;
  
  // Find strengths and weaknesses by subject
  const subjectPerformance = Object.entries(stats.subjectStats)
    .map(([subject, data]) => ({
      subject,
      rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      total: data.total,
      completed: data.completed,
      failed: data.failed,
      topics: Object.entries(data.topics).map(([topic, tData]) => ({
        topic,
        rate: tData.total > 0 ? Math.round((tData.completed / tData.total) * 100) : 0,
        total: tData.total,
        failed: tData.failed || 0,
        hardCount: (tData.difficulty || []).filter(d => d === "hard").length,
      })),
    }))
    .sort((a, b) => b.rate - a.rate);
  
  // Difficulty analysis
  const totalDifficulty = stats.difficulties.easy + stats.difficulties.medium + stats.difficulties.hard;
  const hardRate = totalDifficulty > 0 ? Math.round((stats.difficulties.hard / totalDifficulty) * 100) : 0;
  
  // Build detailed topic breakdown
  const topicBreakdown = subjectPerformance.flatMap(s => 
    s.topics.map(t => `  - ${s.subject} > ${t.topic}: ${t.rate}% (${t.total} tarefas${t.failed > 0 ? `, ${t.failed} falhadas` : ""}${t.hardCount > 0 ? `, ${t.hardCount} consideradas difíceis` : ""})`)
  ).join("\n");
  
  // Hard topics summary
  const hardTopicsSummary = stats.hardTopics.length > 0 
    ? `TÓPICOS MARCADOS COMO DIFÍCEIS:\n${[...new Set(stats.hardTopics.map(t => `- ${t.subject}: ${t.topic}`))].join("\n")}`
    : "";
  
  // Failed topics summary  
  const failedTopicsSummary = stats.failedTopics.length > 0
    ? `TÓPICOS COM TAREFAS FALHADAS:\n${[...new Set(stats.failedTopics.map(t => `- ${t.subject}: ${t.topic}`))].join("\n")}`
    : "";
  
  // Best/worst days
  const bestDaysSummary = stats.bestDays.length > 0
    ? `MELHORES DIAS:\n${stats.bestDays.map(d => `- ${d.day}: ${d.minutes} min, ${d.rate}% concluído`).join("\n")}`
    : "";
  
  const worstDaysSummary = stats.worstDays.length > 0
    ? `DIAS DIFÍCEIS:\n${stats.worstDays.map(d => `- ${d.day}: ${d.minutes} min, ${d.rate}% concluído`).join("\n")}`
    : "";
  
  // Chat interaction summary
  const chatSummary = stats.totalChatMessages > 0
    ? `INTERAÇÕES COM O TUTOR:\n- Total de mensagens: ${stats.totalChatMessages}\n${stats.chatTopics.length > 0 ? `- Tópicos discutidos: ${stats.chatTopics.map(c => `${c.subject}${c.topic !== "geral" ? ` (${c.topic})` : ""}`).join(", ")}` : ""}`
    : "";
  
  // Reviews due
  const reviewsSummary = stats.reviewsDue.length > 0
    ? `REVISÕES PENDENTES (REPETIÇÃO ESPAÇADA):\n${stats.reviewsDue.slice(0, 5).map(r => `- ${r.subject}: ${r.topic}`).join("\n")}${stats.reviewsDue.length > 5 ? `\n- ... e mais ${stats.reviewsDue.length - 5} tópicos` : ""}`
    : "";
  
  // Subjects from profile
  const profileSubjects = profile?.subjects?.map(s => `- ${s.subject}: ${s.topics.join(", ")} (peso: ${s.weight})`).join("\n") || "";
  
  const prompt = `
Você é um tutor de estudos pessoal analisando o desempenho ESPECÍFICO de um aluno na última semana. Use TODOS os dados abaixo para fazer uma análise detalhada e personalizada. Mencione tópicos, matérias e números específicos.

═══════════════════════════════════════
PERFIL DO ALUNO
═══════════════════════════════════════
Nome/objetivo: ${profile?.exam_type || "Estudante"}
Meta diária: ${profile?.daily_minutes || 60} minutos
Objetivos específicos: ${profile?.goals || "Não definido"}
Nível atual: ${stats.level || 1}
XP total: ${stats.totalXP || 0}
Streak atual: ${stats.currentStreak || 0} dias consecutivos

MATÉRIAS DO PLANO:
${profileSubjects || "Não definidas"}

═══════════════════════════════════════
ESTATÍSTICAS DA SEMANA
═══════════════════════════════════════
Tarefas planejadas: ${stats.totalTasks}
Tarefas concluídas: ${stats.completedTasks} (${completionRate}%)
Tarefas falhadas: ${stats.failedTasks}
Tarefas puladas: ${stats.skippedTasks}
Minutos estudados: ${stats.totalMinutesStudied} de ${stats.totalMinutesPlanned} planejados
Média diária real: ${avgDailyMinutes} min

DESEMPENHO POR MATÉRIA:
${subjectPerformance.map(s => `- ${s.subject}: ${s.rate}% concluído (${s.completed}/${s.total} tarefas${s.failed > 0 ? `, ${s.failed} falhadas` : ""})`).join("\n")}

DETALHAMENTO POR TÓPICO:
${topicBreakdown || "Nenhum dado de tópicos"}

DIFICULDADE REPORTADA PELO ALUNO:
- Fácil: ${stats.difficulties.easy} tarefas
- Médio: ${stats.difficulties.medium} tarefas
- Difícil: ${stats.difficulties.hard} tarefas (${hardRate}% do total)

${hardTopicsSummary}

${failedTopicsSummary}

${bestDaysSummary}

${worstDaysSummary}

${chatSummary}

${reviewsSummary}

═══════════════════════════════════════
INSTRUÇÕES
═══════════════════════════════════════
Gere um insight semanal em JSON. Seja MUITO ESPECÍFICO:
- Mencione NOMES de matérias e tópicos específicos
- Cite NÚMEROS e porcentagens
- Referencie padrões (ex: "você estudou mais na terça-feira")
- Dê recomendações acionáveis baseadas nos dados reais
- Se há tópicos difíceis ou falhados, mencione-os especificamente
- Se há revisões pendentes, alerte sobre elas

Formato JSON:
{
  "summary": "Resumo de 2-3 frases sobre a semana, citando dados específicos",
  "strengths": ["Ponto forte específico com dados", "Outro ponto forte com números"],
  "weaknesses": ["Fraqueza específica mencionando tópico/matéria", "Outra fraqueza com contexto"],
  "recommendations": [
    "Ação específica para o tópico X da matéria Y",
    "Outra ação baseada nos dados",
    "Terceira recomendação personalizada"
  ],
  "motivation": "Frase motivacional que referencia algo específico do progresso do aluno"
}

Responda APENAS com o JSON válido, sem markdown ou explicações.`;
  
  return prompt;
}

/**
 * Call the AI to generate the insight
 */
async function callAIForInsight(prompt, stats) {
  const endpoint = import.meta.env.VITE_TUTOR_ENDPOINT || "http://localhost:5001/tutor-ia-8a2fa/us-central1/tutorChat";
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        context: { type: "weekly_insight" },
      }),
    });
    
    if (!response.ok) {
      console.error("API returned error:", response.status);
      return generateFallbackInsight(stats);
    }
    
    // Handle SSE response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullResponse += parsed.text;
            }
          } catch (e) {
            // Not JSON, might be raw text
            if (data.trim()) {
              fullResponse += data;
            }
          }
        }
      }
    }
    
    // Check if we got any response
    if (!fullResponse.trim()) {
      console.warn("Empty AI response, using fallback");
      return generateFallbackInsight(stats);
    }
    
    // Parse the JSON response
    try {
      // Clean up the response (remove any markdown)
      let cleaned = fullResponse.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7);
      }
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
      }
      
      const parsed = JSON.parse(cleaned.trim());
      console.log("✓ Insight parsed successfully:", parsed);
      return parsed;
    } catch (e) {
      console.error("Failed to parse AI response:", e, fullResponse);
      return generateFallbackInsight(stats);
    }
  } catch (e) {
    console.error("Error calling AI:", e);
    return generateFallbackInsight(stats);
  }
}

/**
 * Generate a fallback insight based on actual stats
 */
function generateFallbackInsight(stats) {
  const now = new Date();
  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0;
  
  // Build subject summary
  const subjectPerformance = Object.entries(stats.subjectStats || {})
    .map(([subject, data]) => ({
      subject,
      rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate);
  
  const bestSubject = subjectPerformance[0];
  const worstSubject = subjectPerformance[subjectPerformance.length - 1];
  
  const strengths = [];
  const weaknesses = [];
  const recommendations = [];
  
  if (completionRate >= 70) {
    strengths.push(`Ótima taxa de conclusão: ${completionRate}% das tarefas completadas`);
  } else if (completionRate >= 40) {
    strengths.push(`Taxa de conclusão razoável: ${completionRate}%`);
    weaknesses.push("Tente completar mais tarefas diárias");
  } else {
    weaknesses.push(`Taxa de conclusão baixa: apenas ${completionRate}%`);
  }
  
  if (bestSubject && bestSubject.rate >= 60) {
    strengths.push(`Bom desempenho em ${bestSubject.subject} (${bestSubject.rate}%)`);
  }
  
  if (worstSubject && worstSubject.rate < 50 && worstSubject.subject !== bestSubject?.subject) {
    weaknesses.push(`${worstSubject.subject} precisa de mais atenção (${worstSubject.rate}%)`);
    recommendations.push(`Dedique mais tempo a ${worstSubject.subject}`);
  }
  
  if (stats.currentStreak > 0) {
    strengths.push(`Streak de ${stats.currentStreak} dias consecutivos!`);
  } else {
    weaknesses.push("Sem streak ativo - tente estudar diariamente");
  }
  
  if (stats.totalMinutesStudied > 0) {
    recommendations.push(`Você estudou ${stats.totalMinutesStudied} minutos esta semana - continue assim!`);
  } else {
    recommendations.push("Comece completando pelo menos uma tarefa hoje");
  }
  
  if (stats.difficulties?.hard > 0) {
    recommendations.push(`Revise os ${stats.difficulties.hard} tópicos marcados como difíceis`);
  }
  
  // Ensure we have at least some items
  if (strengths.length === 0) strengths.push("Você está usando a plataforma");
  if (weaknesses.length === 0) weaknesses.push("Continue registrando seu progresso");
  if (recommendations.length === 0) recommendations.push("Complete tarefas para análises mais detalhadas");
  
  return {
    summary: `Semana de ${now.toLocaleDateString("pt-BR")}: ${stats.completedTasks} de ${stats.totalTasks} tarefas completadas (${completionRate}%). Tempo total: ${stats.totalMinutesStudied} minutos.`,
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 2),
    recommendations: recommendations.slice(0, 3),
    _generated: "fallback",
  };
}

/**
 * Generate or get cached weekly insight
 * @param {string} uid - User ID
 * @param {boolean} forceRefresh - Skip cache and regenerate
 */
export async function generateWeeklyInsight(uid, forceRefresh = false) {
  const weekStart = formatDate(getWeekStart(new Date()));
  const cacheRef = doc(db, "users", uid, "insights", weekStart);
  
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cacheSnap = await getDoc(cacheRef);
    
    if (cacheSnap.exists()) {
      const cached = cacheSnap.data();
      const cacheAge = Date.now() - (cached.generated_at?.toDate?.()?.getTime() || 0);
      
      // Cache valid for 24 hours
      if (cacheAge < 24 * 60 * 60 * 1000) {
        return {
          ...cached.insight,
          cached: true,
          generatedAt: cached.generated_at?.toDate?.()?.toISOString(),
        };
      }
    }
  }
  
  // Gather stats and generate new insight
  const stats = await gatherWeeklyStats(uid);
  
  // Get profile for context
  const profileRef = doc(db, "users", uid, "profile", "default");
  const profileSnap = await getDoc(profileRef);
  const profile = profileSnap.exists() ? profileSnap.data() : null;
  
  // Build prompt and call AI
  const prompt = buildInsightPrompt(stats, profile);
  const insight = await callAIForInsight(prompt, stats);
  
  // Cache the result
  await setDoc(cacheRef, {
    insight,
    stats: {
      totalTasks: stats.totalTasks,
      completedTasks: stats.completedTasks,
      totalMinutesStudied: stats.totalMinutesStudied,
      completionRate: stats.totalTasks > 0 
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
        : 0,
    },
    generated_at: serverTimestamp(),
  });
  
  return {
    ...insight,
    cached: false,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get the last generated insight (without regenerating)
 */
export async function getLastInsight(uid) {
  const insightsRef = collection(db, "users", uid, "insights");
  const snap = await getDocs(insightsRef);
  
  if (snap.empty) return null;
  
  // Get the most recent one
  const sorted = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.id.localeCompare(a.id));
  
  const latest = sorted[0];
  
  return {
    ...latest.insight,
    cached: true,
    generatedAt: latest.generated_at?.toDate?.()?.toISOString(),
    weekOf: latest.id,
    stats: latest.stats,
  };
}


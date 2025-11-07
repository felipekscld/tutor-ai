// web/src/lib/tutorContext.js
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";

/**
 * Load user context for Tutor AI
 * Includes profile, goals summary, and today's schedule
 */
export async function loadUserContext(uid, date = new Date()) {
  try {
    // Format date as YYYY-MM-DD
    const dateStr = formatDate(date);
    
    // Load profile
    const profileRef = doc(db, "users", uid, "profile", "default");
    const profileSnap = await getDoc(profileRef);
    const profile = profileSnap.exists() ? profileSnap.data() : null;
    
    // Load goals summary
    const summaryRef = doc(db, "users", uid, "goals_summary", "current");
    const summarySnap = await getDoc(summaryRef);
    const goalsSummary = summarySnap.exists() ? summarySnap.data() : null;
    
    // Load today's schedule
    const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
    const scheduleSnap = await getDoc(scheduleRef);
    const schedule = scheduleSnap.exists() ? scheduleSnap.data() : null;
    
    // Build context object
    const context = {
      profile: {
        exam_type: profile?.exam_type,
        subjects: profile?.subjects,
        daily_minutes: profile?.daily_minutes,
        goals: profile?.goals,
      },
      goals_summary: {
        total_subjects: goalsSummary?.total_subjects,
        total_topics: goalsSummary?.total_topics,
        daily_minutes: goalsSummary?.daily_minutes,
      },
      today_schedule: {
        date: schedule?.date,
        total_tasks: schedule?.tasks?.length || 0,
        completed_tasks: schedule?.tasks?.filter(t => t.status === "done").length || 0,
        pending_tasks: schedule?.tasks?.filter(t => t.status === "pending").length || 0,
        tasks: schedule?.tasks || [],
      },
    };
    
    return context;
  } catch (error) {
    console.error("Error loading user context:", error);
    return null;
  }
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
 * Load context specific for a subject
 */
export async function loadSubjectContext(uid, subject, topic = null, date = new Date()) {
  try {
    const dateStr = formatDate(date);
    
    // Load profile
    const profileRef = doc(db, "users", uid, "profile", "default");
    const profileSnap = await getDoc(profileRef);
    const profile = profileSnap.exists() ? profileSnap.data() : null;
    
    // Filter subject data
    const subjectData = profile?.subjects?.find(s => s.subject === subject);
    
    // Load goals for this subject
    const goalsRef = collection(db, "users", uid, "goals");
    const goalsSnap = await getDocs(goalsRef);
    const subjectGoals = goalsSnap.docs
      .map(doc => doc.data())
      .filter(g => g.subject === subject);
    
    // Load schedule tasks for this subject
    const scheduleRef = doc(db, "users", uid, "schedule", dateStr);
    const scheduleSnap = await getDoc(scheduleRef);
    const schedule = scheduleSnap.exists() ? scheduleSnap.data() : null;
    const subjectTasks = schedule?.tasks?.filter(t => t.subject === subject) || [];
    
    // Load activity log for this subject (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const logRef = collection(db, "users", uid, "activity_log");
    const logQuery = query(
      logRef,
      where("subject", "==", subject),
      where("type", "==", "task_update"),
      orderBy("timestamp", "desc")
    );
    const logSnap = await getDocs(logQuery);
    const recentActivity = logSnap.docs.slice(0, 20).map(d => d.data());
    
    // Calculate subject-specific stats
    const failedTasks = recentActivity.filter(a => a.status === "failed");
    const doneTasks = recentActivity.filter(a => a.status === "done");
    const totalMinutes = doneTasks.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
    
    const context = {
      subject: subject,
      topic: topic,
      profile: {
        exam_type: profile?.exam_type,
        daily_minutes: profile?.daily_minutes,
        subject_config: subjectData,
      },
      goals: subjectGoals,
      today_tasks: {
        total: subjectTasks.length,
        completed: subjectTasks.filter(t => t.status === "done").length,
        pending: subjectTasks.filter(t => t.status === "pending").length,
        tasks: subjectTasks,
      },
      recent_performance: {
        total_minutes: totalMinutes,
        total_sessions: doneTasks.length,
        failed_sessions: failedTasks.length,
        success_rate: doneTasks.length > 0 ? ((doneTasks.length / (doneTasks.length + failedTasks.length)) * 100).toFixed(1) : 0,
      },
      difficult_topics: [...new Set(failedTasks.map(f => f.topic).filter(Boolean))],
    };
    
    return context;
  } catch (error) {
    console.error("Error loading subject context:", error);
    return null;
  }
}

/**
 * Build system prompt with user context
 */
export function buildTutorPrompt(context) {
  const basePrompt = `Você é um tutor de estudos especializado. Leia o JSON do usuário (perfil, metas resumidas e cronograma do dia) e:
1. Valide se a distribuição faz sentido para o objetivo
2. Proponha pequenos ajustes
3. Sugira a sequência de estudo de hoje
4. Registre 3 recomendações específicas de prática

Responda em tom motivador, conciso e prático.

INSTRUÇÕES ADICIONAIS:
- Sempre responda em português brasileiro (PT-BR)
- Seja claro, didático e encorajador
- Use exemplos práticos quando apropriado
- Divida conceitos complexos em partes simples
- Forneça explicações passo a passo
- Faça perguntas para verificar a compreensão
- Adapte seu nível de explicação ao contexto da pergunta
- Incentive o pensamento crítico e o aprendizado ativo

CONTEXTO DO USUÁRIO:
${JSON.stringify(context, null, 2)}
`;

  return basePrompt;
}

/**
 * Build specialized system prompt for a subject
 */
export function buildSubjectPrompt(context) {
  const { subject, recent_performance, difficult_topics } = context;
  
  const subjectPrompts = {
    "Matemática": `Você é um tutor especializado em Matemática. Use raciocínio lógico e explicações passo-a-passo.
Foque em: demonstrações visuais, exemplos numéricos, e identificação de padrões.`,
    "Física": `Você é um tutor especializado em Física. Use analogias do mundo real e conceitos visuais.
Foque em: fenômenos naturais, experimentos mentais, e aplicações práticas.`,
    "Química": `Você é um tutor especializado em Química. Use diagramas e reações para ilustrar.
Foque em: estruturas moleculares, reações químicas, e aplicações do dia-a-dia.`,
    "Português": `Você é um tutor especializado em Português. Use exemplos literários e análises textuais.
Foque em: interpretação, gramática contextualizada, e escrita clara.`,
    "História": `Você é um tutor especializado em História. Use narrativas e conexões temporais.
Foque em: contexto histórico, causas e consequências, e análise crítica de fontes.`,
    "Geografia": `Você é um tutor especializado em Geografia. Use mapas mentais e relações espaciais.
Foque em: fenômenos geográficos, relações humano-natureza, e análise territorial.`,
    "Biologia": `Você é um tutor especializado em Biologia. Use sistemas e processos biológicos.
Foque em: ciclos naturais, relações ecológicas, e processos fisiológicos.`,
  };
  
  const specialization = subjectPrompts[subject] || `Você é um tutor especializado em ${subject}.`;
  
  const prompt = `${specialization}

PERFORMANCE DO ESTUDANTE EM ${subject.toUpperCase()}:
- Total de minutos estudados: ${recent_performance?.total_minutes || 0} min
- Sessões realizadas: ${recent_performance?.total_sessions || 0}
- Taxa de sucesso: ${recent_performance?.success_rate || 0}%
${difficult_topics?.length > 0 ? `- Tópicos com dificuldade: ${difficult_topics.join(", ")}` : ""}

INSTRUÇÕES:
- Sempre responda em português brasileiro (PT-BR)
- Seja didático e use exemplos específicos de ${subject}
- Identifique gaps conceituais e sugira exercícios progressivos
- Adapte explicações ao nível de dificuldade demonstrado
- Foque nos tópicos com mais erros recentes
- Proponha estratégias de estudo específicas para ${subject}

CONTEXTO COMPLETO:
${JSON.stringify(context, null, 2)}
`;

  return prompt;
}


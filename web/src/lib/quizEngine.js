// web/src/lib/quizEngine.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { updateProgress, updateSpacedRepetition } from "./progressStore";
import { addXP } from "./gamificationEngine";

/**
 * Difficulty levels
 */
const DIFFICULTY_LEVELS = ["easy", "medium", "hard"];

/**
 * XP rewards for quiz
 */
const QUIZ_XP = {
  CORRECT_EASY: 5,
  CORRECT_MEDIUM: 10,
  CORRECT_HARD: 15,
  PERFECT_QUIZ: 25, // 5/5 correct
};

/**
 * Generate prompt for AI to create a quiz question
 * @param {string} subject - The subject (e.g., "Cálculo")
 * @param {string} topic - The topic (e.g., "Derivadas")
 * @param {string} difficulty - easy, medium, hard
 * @param {array} history - Previous quiz results
 * @param {string} taskType - "theory" or "practice" to differentiate question style
 * @param {number} questionNumber - Current question number in session (1-5)
 */
export function generateQuizPrompt(subject, topic, difficulty, history = [], taskType = "theory", questionNumber = 1) {
  const difficultyDescriptions = {
    easy: "facil, conceitos basicos, questao direta",
    medium: "media, requer raciocinio, pode ter pegadinhas leves",
    hard: "dificil, requer dominio do assunto, questao elaborada",
  };
  
  const difficultyDesc = difficultyDescriptions[difficulty] || difficultyDescriptions.medium;
  
  // Build context from history to avoid repetition
  let historyContext = "";
  if (history.length > 0) {
    const recentQuestions = history.slice(-10).map(h => h.question_summary).filter(Boolean);
    if (recentQuestions.length > 0) {
      historyContext = `\n\nQUESTOES JA FEITAS (NAO REPITA):
${recentQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
    }
    
    const recentErrors = history.filter(h => !h.correct).slice(-3);
    if (recentErrors.length > 0) {
      historyContext += `\n\nTOPICOS COM DIFICULDADE: ${recentErrors.map(e => e.question_summary || "conceito relacionado").join(", ")}. Foque em reforçar esses conceitos.`;
    }
  }
  
  // Different question styles based on task type
  const questionStyle = taskType === "practice" 
    ? `ESTILO: EXERCÍCIO PRÁTICO
- Crie uma questão que exija CÁLCULO ou APLICAÇÃO de conceitos
- Inclua números, fórmulas ou situações-problema
- O aluno deve resolver algo, não apenas lembrar definições
- Pode incluir contexto do mundo real`
    : `ESTILO: QUESTÃO TEÓRICA
- Foque em CONCEITOS, DEFINIÇÕES e COMPREENSÃO
- Pergunte sobre o "porquê" e o "como" funciona
- Teste se o aluno entende a teoria por trás
- Pode incluir comparações entre conceitos`;

  // Progressive difficulty within session
  const progressionHint = questionNumber <= 2 
    ? "Esta é uma questão inicial - foque em conceitos fundamentais."
    : questionNumber <= 4 
    ? "Esta é uma questão intermediária - pode aumentar a complexidade."
    : "Esta é a questão final - pode ser mais desafiadora.";
  
  return `Você é um professor especialista em ${subject}. Gere UMA questão de múltipla escolha sobre "${topic}".

MATÉRIA: ${subject}
TÓPICO: ${topic}
DIFICULDADE: ${difficulty} (${difficultyDesc})
QUESTÃO ${questionNumber} DE 5

${questionStyle}

${progressionHint}
${historyContext}

REGRAS IMPORTANTES:
1. A questão deve ter EXATAMENTE 4 alternativas (A, B, C, D)
2. Apenas UMA alternativa deve estar correta
3. As alternativas erradas devem ser plausíveis e representar erros comuns
4. NÃO repita questões anteriores - seja criativo e diversificado
5. Inclua uma explicação detalhada e didática
6. Para exercícios práticos, mostre o passo-a-passo da resolução na explicação

FORMATO DE RESPOSTA (JSON válido, sem markdown):
{
  "question": "Texto completo da pergunta aqui?",
  "alternatives": [
    {"id": "A", "text": "Primeira alternativa"},
    {"id": "B", "text": "Segunda alternativa"},
    {"id": "C", "text": "Terceira alternativa"},
    {"id": "D", "text": "Quarta alternativa"}
  ],
  "correct_answer": "B",
  "explanation": "Explicação detalhada de por que B está correta. Para exercícios, inclua: Passo 1: ... Passo 2: ... etc.",
  "topic_hint": "Conceito-chave que o aluno deve revisar se errar",
  "concept_tested": "Nome específico do conceito testado nesta questão"
}

Responda APENAS com o JSON, sem texto adicional.`;
}

/**
 * Parse AI response to extract quiz data
 */
export function parseQuizResponse(aiResponse) {
  try {
    // Clean response
    let cleaned = aiResponse.trim();
    
    // Remove markdown if present
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
    
    // Validate structure
    if (!parsed.question || !parsed.alternatives || !parsed.correct_answer) {
      throw new Error("Invalid quiz structure");
    }
    
    if (parsed.alternatives.length !== 4) {
      throw new Error("Quiz must have exactly 4 alternatives");
    }
    
    return {
      success: true,
      quiz: {
        question: parsed.question,
        alternatives: parsed.alternatives,
        correct_answer: parsed.correct_answer,
        explanation: parsed.explanation || "Sem explicação disponível.",
        topic_hint: parsed.topic_hint || null,
      },
    };
  } catch (e) {
    console.error("Failed to parse quiz response:", e, aiResponse);
    return {
      success: false,
      error: e.message,
    };
  }
}

/**
 * Save quiz result to Firestore
 */
export async function saveQuizResult(uid, subject, topic, quizData, selectedAnswer, wasCorrect, difficulty) {
  const quizRef = collection(db, "users", uid, "quiz_results");
  
  const result = {
    subject,
    topic,
    question: quizData.question,
    question_summary: quizData.question.substring(0, 100),
    correct_answer: quizData.correct_answer,
    selected_answer: selectedAnswer,
    correct: wasCorrect,
    difficulty,
    explanation: quizData.explanation,
    timestamp: serverTimestamp(),
    date: new Date().toISOString().split('T')[0],
  };
  
  await addDoc(quizRef, result);
  
  // Update progress store with spaced repetition
  await updateSpacedRepetition(uid, subject, topic, wasCorrect);
  
  // Award XP
  if (wasCorrect) {
    const xpAmount = difficulty === "easy" ? QUIZ_XP.CORRECT_EASY
      : difficulty === "hard" ? QUIZ_XP.CORRECT_HARD
      : QUIZ_XP.CORRECT_MEDIUM;
    
    await addXP(uid, xpAmount, "quiz_correct");
  }
  
  return result;
}

/**
 * Get quiz history for a topic
 */
export async function getTopicQuizHistory(uid, subject, topic, maxResults = 20) {
  const quizRef = collection(db, "users", uid, "quiz_results");
  
  const q = query(
    quizRef,
    where("subject", "==", subject),
    where("topic", "==", topic),
    orderBy("timestamp", "desc"),
    limit(maxResults)
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error getting quiz history:", e);
    return [];
  }
}

/**
 * Get all quiz history for a subject
 */
export async function getSubjectQuizHistory(uid, subject, maxResults = 50) {
  const quizRef = collection(db, "users", uid, "quiz_results");
  
  const q = query(
    quizRef,
    where("subject", "==", subject),
    orderBy("timestamp", "desc"),
    limit(maxResults)
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error getting subject quiz history:", e);
    return [];
  }
}

/**
 * Calculate next difficulty based on history
 * Algorithm:
 * - Last 3 correct → increase difficulty
 * - Last 2 incorrect → decrease difficulty
 * - Otherwise → maintain
 */
export function calculateNextDifficulty(history, currentDifficulty = "medium") {
  if (history.length === 0) {
    return "easy"; // Start easy for new topics
  }
  
  const recent = history.slice(0, 5);
  const recentCorrect = recent.filter(h => h.correct).length;
  const recentIncorrect = recent.length - recentCorrect;
  
  const currentIndex = DIFFICULTY_LEVELS.indexOf(currentDifficulty);
  
  // Check last 3 for streak
  const lastThree = history.slice(0, 3);
  const lastThreeCorrect = lastThree.filter(h => h.correct).length;
  const lastThreeIncorrect = lastThree.length - lastThreeCorrect;
  
  if (lastThreeCorrect === 3 && currentIndex < DIFFICULTY_LEVELS.length - 1) {
    // 3 correct in a row → increase difficulty
    return DIFFICULTY_LEVELS[currentIndex + 1];
  }
  
  if (lastThreeIncorrect >= 2 && currentIndex > 0) {
    // 2+ incorrect in last 3 → decrease difficulty
    return DIFFICULTY_LEVELS[currentIndex - 1];
  }
  
  // Maintain current difficulty
  return currentDifficulty;
}

/**
 * Get quiz statistics for a user
 */
export async function getQuizStats(uid, period = "all") {
  const quizRef = collection(db, "users", uid, "quiz_results");
  
  let q = query(quizRef, orderBy("timestamp", "desc"));
  
  if (period === "today") {
    const today = new Date().toISOString().split('T')[0];
    q = query(quizRef, where("date", "==", today));
  } else if (period === "week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    q = query(quizRef, where("date", ">=", weekAgoStr));
  }
  
  try {
    const snap = await getDocs(q);
    const results = snap.docs.map(doc => doc.data());
    
    const totalQuestions = results.length;
    const correctAnswers = results.filter(r => r.correct).length;
    const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    
    // Group by subject
    const bySubject = {};
    results.forEach(r => {
      if (!bySubject[r.subject]) {
        bySubject[r.subject] = { total: 0, correct: 0 };
      }
      bySubject[r.subject].total++;
      if (r.correct) bySubject[r.subject].correct++;
    });
    
    // Group by difficulty
    const byDifficulty = { easy: { total: 0, correct: 0 }, medium: { total: 0, correct: 0 }, hard: { total: 0, correct: 0 } };
    results.forEach(r => {
      const diff = r.difficulty || "medium";
      if (byDifficulty[diff]) {
        byDifficulty[diff].total++;
        if (r.correct) byDifficulty[diff].correct++;
      }
    });
    
    return {
      totalQuestions,
      correctAnswers,
      accuracy,
      bySubject,
      byDifficulty,
    };
  } catch (e) {
    console.error("Error getting quiz stats:", e);
    return {
      totalQuestions: 0,
      correctAnswers: 0,
      accuracy: 0,
      bySubject: {},
      byDifficulty: {},
    };
  }
}

/**
 * Complete a quiz session (5 questions)
 * Awards bonus XP for perfect score
 */
export async function completeQuizSession(uid, sessionResults) {
  const correctCount = sessionResults.filter(r => r.correct).length;
  const totalCount = sessionResults.length;
  
  // Award perfect quiz bonus
  if (correctCount === totalCount && totalCount >= 5) {
    await addXP(uid, QUIZ_XP.PERFECT_QUIZ, "perfect_quiz");
  }
  
  return {
    correctCount,
    totalCount,
    accuracy: Math.round((correctCount / totalCount) * 100),
    isPerfect: correctCount === totalCount,
  };
}

/**
 * Export constants
 */
export { DIFFICULTY_LEVELS, QUIZ_XP };


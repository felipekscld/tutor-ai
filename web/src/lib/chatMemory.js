// web/src/lib/chatMemory.js
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";

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
 * Generate prompt to extract key insights from a conversation
 */
export function generateSummaryPrompt(messages, subject, topic) {
  const conversationText = messages
    .map(m => `${m.role === "user" ? "Aluno" : "Tutor"}: ${m.content}`)
    .join("\n\n");
  
  return `Analise esta conversa entre um aluno e tutor sobre ${subject}${topic ? ` (tópico: ${topic})` : ""}.

CONVERSA:
${conversationText}

Extraia informações importantes em formato JSON:
{
  "key_points": ["ponto importante 1", "ponto importante 2"],
  "difficulties_mentioned": ["dificuldade 1", "dificuldade 2"],
  "concepts_explained": ["conceito 1", "conceito 2"],
  "student_preferences": ["preferencia de aprendizado 1"],
  "follow_up_suggestions": ["sugestão para próxima sessão"]
}

REGRAS:
- Seja conciso (máximo 3 itens por categoria)
- Foque no que é relevante para futuras sessões
- Se não houver nada relevante para uma categoria, use array vazio []
- Responda APENAS com o JSON, sem markdown`;
}

/**
 * Parse summary response from AI
 */
export function parseSummaryResponse(aiResponse) {
  try {
    let cleaned = aiResponse.trim();
    
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    }
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    
    return JSON.parse(cleaned.trim());
  } catch (e) {
    console.error("Failed to parse summary response:", e);
    return {
      key_points: [],
      difficulties_mentioned: [],
      concepts_explained: [],
      student_preferences: [],
      follow_up_suggestions: [],
    };
  }
}

/**
 * Save conversation summary (memory) to Firestore
 */
export async function saveConversationSummary(uid, subject, topic, summary, messageCount) {
  const memoryRef = collection(db, "users", uid, "chat_memories");
  
  const memory = {
    subject,
    topic: topic || "geral",
    key_points: summary.key_points || [],
    difficulties_mentioned: summary.difficulties_mentioned || [],
    concepts_explained: summary.concepts_explained || [],
    student_preferences: summary.student_preferences || [],
    follow_up_suggestions: summary.follow_up_suggestions || [],
    message_count: messageCount,
    date: formatDate(new Date()),
    timestamp: serverTimestamp(),
  };
  
  const docRef = await addDoc(memoryRef, memory);
  
  console.log(`✓ Saved chat memory for ${subject}/${topic}:`, memory);
  
  return { id: docRef.id, ...memory };
}

/**
 * Get relevant memories for a subject/topic
 */
export async function getRelevantMemories(uid, subject, topic = null, maxResults = 5) {
  const memoryRef = collection(db, "users", uid, "chat_memories");
  
  // Query by subject
  let q = query(
    memoryRef,
    where("subject", "==", subject),
    orderBy("timestamp", "desc"),
    limit(maxResults * 2) // Get more and filter
  );
  
  try {
    const snap = await getDocs(q);
    let memories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // If topic specified, prioritize memories with that topic
    if (topic) {
      const topicMemories = memories.filter(m => m.topic === topic);
      const otherMemories = memories.filter(m => m.topic !== topic);
      memories = [...topicMemories, ...otherMemories].slice(0, maxResults);
    } else {
      memories = memories.slice(0, maxResults);
    }
    
    return memories;
  } catch (e) {
    console.error("Error getting memories:", e);
    return [];
  }
}

/**
 * Get all memories for a user
 */
export async function getAllMemories(uid, maxResults = 50) {
  const memoryRef = collection(db, "users", uid, "chat_memories");
  
  const q = query(
    memoryRef,
    orderBy("timestamp", "desc"),
    limit(maxResults)
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("Error getting all memories:", e);
    return [];
  }
}

/**
 * Build memory context for AI prompt
 */
export function buildMemoryContext(memories) {
  if (!memories || memories.length === 0) {
    return null;
  }
  
  const context = {
    previous_sessions: memories.length,
    key_learnings: [],
    known_difficulties: [],
    explained_concepts: [],
    learning_preferences: [],
  };
  
  memories.forEach(m => {
    if (m.key_points) context.key_learnings.push(...m.key_points);
    if (m.difficulties_mentioned) context.known_difficulties.push(...m.difficulties_mentioned);
    if (m.concepts_explained) context.explained_concepts.push(...m.concepts_explained);
    if (m.student_preferences) context.learning_preferences.push(...m.student_preferences);
  });
  
  // Deduplicate
  context.key_learnings = [...new Set(context.key_learnings)].slice(0, 5);
  context.known_difficulties = [...new Set(context.known_difficulties)].slice(0, 5);
  context.explained_concepts = [...new Set(context.explained_concepts)].slice(0, 10);
  context.learning_preferences = [...new Set(context.learning_preferences)].slice(0, 3);
  
  return context;
}

/**
 * Format memory context as text for prompt
 */
export function formatMemoryContextForPrompt(memories) {
  const context = buildMemoryContext(memories);
  
  if (!context) return "";
  
  let text = "\n\nMEMÓRIA DE SESSÕES ANTERIORES:";
  
  if (context.known_difficulties.length > 0) {
    text += `\n- Dificuldades conhecidas: ${context.known_difficulties.join(", ")}`;
  }
  
  if (context.explained_concepts.length > 0) {
    text += `\n- Conceitos já explicados: ${context.explained_concepts.join(", ")}`;
  }
  
  if (context.learning_preferences.length > 0) {
    text += `\n- Preferências de aprendizado: ${context.learning_preferences.join(", ")}`;
  }
  
  if (context.key_learnings.length > 0) {
    text += `\n- Pontos importantes anteriores: ${context.key_learnings.join(", ")}`;
  }
  
  text += "\n\nUse esta memória para personalizar suas respostas. Não repita explicações de conceitos já explicados, a menos que o aluno peça revisão.";
  
  return text;
}

/**
 * Check if conversation should generate a memory (>5 messages with substance)
 */
export function shouldGenerateMemory(messages) {
  // Filter out very short messages
  const substantiveMessages = messages.filter(m => 
    m.content && m.content.length > 20
  );
  
  return substantiveMessages.length >= 5;
}

/**
 * Extract user messages only (for memory generation)
 */
export function extractUserMessages(messages) {
  return messages.filter(m => m.role === "user");
}

/**
 * Get suggested follow-up from last memory
 */
export async function getLastFollowUpSuggestion(uid, subject) {
  const memories = await getRelevantMemories(uid, subject, null, 1);
  
  if (memories.length > 0 && memories[0].follow_up_suggestions?.length > 0) {
    return memories[0].follow_up_suggestions[0];
  }
  
  return null;
}


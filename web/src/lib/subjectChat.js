// web/src/lib/subjectChat.js
import { db } from "../firebase";
import { collection, addDoc, getDocs, query, orderBy, limit, doc, updateDoc, serverTimestamp, where, deleteDoc } from "firebase/firestore";
import { updateLastActive } from "./userActivity";
import { 
  generateSummaryPrompt, 
  parseSummaryResponse, 
  saveConversationSummary, 
  shouldGenerateMemory 
} from "./chatMemory";

/**
 * Create a new subject-specific chat session
 */
export async function createSubjectSession(uid, subject, topic = null) {
  const subjectSlug = subject.toLowerCase().replace(/\s+/g, "_");
  const sessionsRef = collection(db, "users", uid, "chats", subjectSlug, "sessions");
  
  const docRef = await addDoc(sessionsRef, {
    userId: uid,
    subject,
    topic,
    messages: [],
    title: `Chat - ${subject}${topic ? ` (${topic})` : ""}`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    metadata: {
      related_tasks: [],
      difficulty_context: null,
    },
  });
  
  await updateLastActive(uid);
  
  return docRef.id;
}

/**
 * Load chat history for a specific subject
 */
export async function loadSubjectHistory(uid, subject, limitCount = 20) {
  const subjectSlug = subject.toLowerCase().replace(/\s+/g, "_");
  const sessionsRef = collection(db, "users", uid, "chats", subjectSlug, "sessions");
  
  const q = query(
    sessionsRef,
    orderBy("updatedAt", "desc"),
    limit(limitCount)
  );
  
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error(`Error loading ${subject} history:`, error);
    return [];
  }
}

/**
 * Update a subject chat session
 */
export async function updateSubjectSession(uid, subject, sessionId, messages, title = null) {
  const subjectSlug = subject.toLowerCase().replace(/\s+/g, "_");
  const sessionRef = doc(db, "users", uid, "chats", subjectSlug, "sessions", sessionId);
  
  const updateData = {
    messages,
    updatedAt: serverTimestamp(),
  };
  
  if (title) {
    updateData.title = title;
  }
  
  await updateDoc(sessionRef, updateData);
  await updateLastActive(uid);
}

/**
 * Get list of subjects that have chats
 */
export async function getSubjectsWithChats(uid) {
  const chatsRef = collection(db, "users", uid, "chats");
  
  try {
    const snap = await getDocs(chatsRef);
    return snap.docs.map(doc => doc.id);
  } catch (error) {
    console.error("Error getting subjects with chats:", error);
    return [];
  }
}

/**
 * Delete a subject chat session
 */
export async function deleteSubjectSession(uid, subject, sessionId) {
  const subjectSlug = subject.toLowerCase().replace(/\s+/g, "_");
  const sessionRef = doc(db, "users", uid, "chats", subjectSlug, "sessions", sessionId);
  
  try {
    await deleteDoc(sessionRef);
  } catch (error) {
    console.error(`Error deleting ${subject} session:`, error);
    throw error;
  }
}

/**
 * Finalize a session and save memory if substantial
 * Call this when user leaves the chat
 */
export async function finalizeSession(uid, subject, topic, messages) {
  // Check if session has enough substance to save
  if (!shouldGenerateMemory(messages)) {
    console.log("Session too short to generate memory");
    return null;
  }
  
  try {
    // Generate summary prompt
    const prompt = generateSummaryPrompt(messages, subject, topic);
    
    // Call AI to summarize
    const endpoint = import.meta.env.VITE_TUTOR_ENDPOINT || "http://localhost:5001/tutor-ia-8a2fa/us-central1/tutorChat";
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        context: { type: "memory_generation" },
      }),
    });
    
    if (!response.ok) {
      throw new Error("Failed to generate memory");
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
            if (parsed.delta) {
              fullResponse += parsed.delta;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    
    // Parse the summary
    const summary = parseSummaryResponse(fullResponse);
    
    // Save to Firestore
    const memory = await saveConversationSummary(uid, subject, topic, summary, messages.length);
    
    console.log("✓ Chat memory saved:", memory);
    return memory;
  } catch (error) {
    console.error("Error finalizing session:", error);
    return null;
  }
}


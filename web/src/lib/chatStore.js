import { db } from "../firebase";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { updateLastActive } from "./userActivity";

export async function saveTurn({ userId, messages, title }) {
  // Create a new conversation document in user-specific path
  const chatSessionsRef = collection(db, "users", userId, "chat_sessions");
  const docRef = await addDoc(chatSessionsRef, {
    userId,
    messages,
    title: title || null, // Will be generated later if not provided
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  await updateLastActive(userId);
  
  return docRef.id;
}

export async function updateTurn({ userId, conversationId, messages, title }) {
  // Update an existing conversation with new messages
  const docRef = doc(db, "users", userId, "chat_sessions", conversationId);
  const updateData = {
    messages,
    updatedAt: serverTimestamp(),
  };
  
  // Only update title if provided
  if (title !== undefined) {
    updateData.title = title;
  }
  
  await updateDoc(docRef, updateData);
  await updateLastActive(userId);
  
  return conversationId;
}

export async function updateConversationTitle({ userId, conversationId, title }) {
  // Update just the title of a conversation
  const docRef = doc(db, "users", userId, "chat_sessions", conversationId);
  await updateDoc(docRef, {
    title,
    updatedAt: serverTimestamp(),
  });
}

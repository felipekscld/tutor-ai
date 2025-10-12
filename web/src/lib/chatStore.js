import { db } from "../firebase";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";

export async function saveTurn({ userId, messages, title }) {
  // Create a new conversation document
  const docRef = await addDoc(collection(db, "conversations"), {
    userId,
    messages,
    title: title || null, // Will be generated later if not provided
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateTurn({ conversationId, messages, title }) {
  // Update an existing conversation with new messages
  const docRef = doc(db, "conversations", conversationId);
  const updateData = {
    messages,
    updatedAt: serverTimestamp(),
  };
  
  // Only update title if provided
  if (title !== undefined) {
    updateData.title = title;
  }
  
  await updateDoc(docRef, updateData);
  return conversationId;
}

export async function updateConversationTitle({ conversationId, title }) {
  // Update just the title of a conversation
  const docRef = doc(db, "conversations", conversationId);
  await updateDoc(docRef, {
    title,
    updatedAt: serverTimestamp(),
  });
}

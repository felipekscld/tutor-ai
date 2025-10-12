import { db } from "../firebase";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";

export async function saveTurn({ userId, messages }) {
  // Create a new conversation document
  const docRef = await addDoc(collection(db, "conversations"), {
    userId,
    messages,            
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateTurn({ conversationId, messages }) {
  // Update an existing conversation with new messages
  const docRef = doc(db, "conversations", conversationId);
  await updateDoc(docRef, {
    messages,
    updatedAt: serverTimestamp(),
  });
  return conversationId;
}

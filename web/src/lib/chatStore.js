import { db } from "../firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export async function saveTurn({ userId, messages }) {
  // Save the whole transcript snapshot each time an assistant reply finishes
  await addDoc(collection(db, "conversations"), {
    userId,
    messages,            
    createdAt: serverTimestamp(),
  });
}

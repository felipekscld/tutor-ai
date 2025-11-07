// web/src/lib/userActivity.js
import { db } from "../firebase";
import { doc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Update user's last_active timestamp
 * Call this on any user interaction
 */
export async function updateLastActive(uid) {
  try {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
      last_active: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error("Failed to update last_active:", error);
  }
}

/**
 * Update last_active with specific action context
 */
export async function trackActivity(uid, action, metadata = {}) {
  try {
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
      last_active: serverTimestamp(),
      last_action: action,
      last_action_metadata: metadata,
    }, { merge: true });
  } catch (error) {
    console.warn("Failed to track activity:", error);
  }
}


// web/src/lib/settingsStore.js
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

/**
 * Load user settings from Firestore
 */
export async function loadSettings(uid) {
  try {
    const settingsRef = doc(db, "users", uid, "settings", "preferences");
    const snap = await getDoc(settingsRef);
    
    if (snap.exists()) {
      return snap.data();
    }
    
    // Default settings
    return {
      theme: "light",
    };
  } catch (error) {
    console.error("Error loading settings:", error);
    return { theme: "light" };
  }
}

/**
 * Save user settings to Firestore
 */
export async function saveSettings(uid, settings) {
  try {
    const settingsRef = doc(db, "users", uid, "settings", "preferences");
    await setDoc(settingsRef, settings, { merge: true });
    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    return false;
  }
}

/**
 * Update theme only
 */
export async function updateTheme(uid, theme) {
  return saveSettings(uid, { theme });
}


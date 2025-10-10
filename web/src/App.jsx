// web/src/App.jsx
import * as React from "react";
import { db, auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

// ⬇️ Add the chat component
import TutorChat from "./components/TutorChat";

export default function App() {
  React.useEffect(() => {
    (async () => {
      const email = "demo@uni.com";
      const pass = "123456";
      try {
        await signInWithEmailAndPassword(auth, email, pass);
      } catch (e) {
        // if wrong/missing user, create then sign in
        if (e.code === "auth/user-not-found" || e.code === "auth/invalid-credential") {
          await createUserWithEmailAndPassword(auth, email, pass);
          await signInWithEmailAndPassword(auth, email, pass);
        } else {
          console.error("auth error:", e);
          return;
        }
      }
      const snap = await getDocs(collection(db, "test"));
      console.log("signed in and read Firestore:", snap.size, "docs");
    })();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Vite + React + Firebase</h1>

      {/* Chat UI */}
      <div style={{ marginTop: 16 }}>
        <TutorChat />
      </div>
    </div>
  );
}

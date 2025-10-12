// web/src/App.jsx
import * as React from "react";
import { db, auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

import TutorChat from "./components/TutorChat";
import WelcomeScreen from "./components/WelcomeScreen";

export default function App() {
  const [hasObjective, setHasObjective] = React.useState(
    () => localStorage.getItem("tutor-hasObjective") === "true"
  );

  React.useEffect(() => {
    (async () => {
      const email = "demo@uni.com";
      const pass = "123456";
      try {
        await signInWithEmailAndPassword(auth, email, pass);
      } catch (e) {
        
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

  // Demo reset shortcut (Ctrl+Shift+R)
  React.useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        localStorage.removeItem("tutor-objective");
        localStorage.removeItem("tutor-timeframe");
        localStorage.removeItem("tutor-hasObjective");
        setHasObjective(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleOnboardingComplete = ({ objective, timeframe }) => {
    localStorage.setItem("tutor-objective", objective);
    localStorage.setItem("tutor-timeframe", timeframe);
    localStorage.setItem("tutor-hasObjective", "true");
    setHasObjective(true);
  };

  return hasObjective ? (
    <TutorChat />
  ) : (
    <WelcomeScreen onComplete={handleOnboardingComplete} />
  );
}

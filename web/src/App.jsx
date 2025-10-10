import * as React from "react";
import { db, auth } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

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
      console.log("✅ signed in and read Firestore:", snap.size, "docs");
    })();
  }, []);
  return <h1 style={{padding:24}}>Vite + React + Firebase</h1>;
}

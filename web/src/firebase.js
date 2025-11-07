import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBPbuuHd9MPwt-qCt0tnhdoXF65Ly9H5TI",
  authDomain: "tutor-ia-8a2fa.firebaseapp.com",
  projectId: "tutor-ia-8a2fa",
  storageBucket: "tutor-ia-8a2fa.firebasestorage.app",
  messagingSenderId: "217724530819",
  appId: "1:217724530819:web:a4ccce4af2ad87a67b6bb6"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
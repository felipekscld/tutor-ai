// web/src/App.jsx
import * as React from "react";
import { db, auth, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { generateGoals } from "./lib/goalsEngine";

import LoginScreen from "./components/LoginScreen";
import WelcomeScreen from "./components/WelcomeScreen";
import Hub from "./components/Hub";
import TutorChat from "./components/TutorChat";
import SubjectChatSelector from "./components/SubjectChatSelector";
import SubjectChat from "./components/SubjectChat";

export default function App() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [hasProfile, setHasProfile] = React.useState(false);
  const [showTutorAI, setShowTutorAI] = React.useState(false);
  const [showSubjectChats, setShowSubjectChats] = React.useState(false);
  const [selectedSubject, setSelectedSubject] = React.useState(null);

  // Monitor auth state
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Create user document if doesn't exist
        const userDocRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        
        if (!userSnap.exists()) {
          await setDoc(userDocRef, {
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            createdAt: serverTimestamp(),
            last_active: serverTimestamp(),
          });
          console.log("✓ Created user document:", currentUser.uid);
        } else {
          // Update last_active on every login
          await setDoc(userDocRef, {
            last_active: serverTimestamp(),
          }, { merge: true });
          console.log("✓ Updated last_active:", currentUser.uid);
        }
        
        // Check if profile exists
        const profileRef = doc(db, "users", currentUser.uid, "profile", "default");
        const profileSnap = await getDoc(profileRef);
        setHasProfile(profileSnap.exists());
      } else {
        setHasProfile(false);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Google login
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
      alert("Erro ao fazer login. Tente novamente.");
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Onboarding complete
  const handleOnboardingComplete = async (profileData) => {
    if (!user) return;
    
    try {
      const profileRef = doc(db, "users", user.uid, "profile", "default");
      await setDoc(profileRef, {
        ...profileData,
        createdAt: serverTimestamp(),
      });
      console.log("✓ Profile created");
      
      // Generate goals based on profile
      await generateGoals(user.uid, profileData);
      console.log("✓ Goals generated");
      
      setHasProfile(true);
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Erro ao salvar perfil. Tente novamente.");
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#18181b",
        color: "#f4f4f5",
        fontFamily: "Inter, sans-serif",
      }}>
        Carregando...
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // No profile yet
  if (!hasProfile) {
    return <WelcomeScreen onComplete={handleOnboardingComplete} user={user} onLogout={handleLogout} />;
  }

  // Authenticated with profile - Navigation logic
  
  // Subject-specific chat
  if (selectedSubject) {
    return (
      <SubjectChat
        user={user}
        subject={selectedSubject}
        onBack={() => {
          setSelectedSubject(null);
          setShowSubjectChats(true);
        }}
        onLogout={handleLogout}
      />
    );
  }
  
  // Subject chat selector
  if (showSubjectChats) {
    return (
      <SubjectChatSelector
        user={user}
        onSelectSubject={(subject) => {
          setSelectedSubject(subject);
          setShowSubjectChats(false);
        }}
        onBack={() => setShowSubjectChats(false)}
        onLogout={handleLogout}
      />
    );
  }
  
  // General tutor AI
  if (showTutorAI) {
    return (
      <TutorChat 
        user={user} 
        onLogout={handleLogout}
        onBackToHub={() => setShowTutorAI(false)}
      />
    );
  }
  
  // Main Hub
  return (
    <Hub 
      user={user} 
      onLogout={handleLogout}
      onOpenTutorAI={() => setShowTutorAI(true)}
      onOpenSubjectChats={() => setShowSubjectChats(true)}
    />
  );
}

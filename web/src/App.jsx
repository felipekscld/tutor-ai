// web/src/App.jsx
import * as React from "react";
import { db, auth, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { generateGoals } from "./lib/goalsEngine";
import { checkInactivityAndReplan } from "./lib/replanEngine";

import LoginScreen from "./components/LoginScreen";
import WelcomeScreen from "./components/WelcomeScreen";
import Hub from "./components/Hub";
import TutorChat from "./components/TutorChat";
import SubjectChatSelector from "./components/SubjectChatSelector";
import SubjectChat from "./components/SubjectChat";
import FixedCommitments from "./components/FixedCommitments";
import ScheduleView from "./components/ScheduleView";
import EditPlan from "./components/EditPlan";
import QuizMode from "./components/QuizMode";

export default function App() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [hasProfile, setHasProfile] = React.useState(false);
  const [showTutorAI, setShowTutorAI] = React.useState(false);
  const [showSubjectChats, setShowSubjectChats] = React.useState(false);
  const [selectedSubject, setSelectedSubject] = React.useState(null);
  const [showCommitments, setShowCommitments] = React.useState(false);
  const [showSchedule, setShowSchedule] = React.useState(false);
  const [showEditPlan, setShowEditPlan] = React.useState(false);
  const [showQuiz, setShowQuiz] = React.useState(false);
  const [quizSubject, setQuizSubject] = React.useState(null);
  const [quizTopic, setQuizTopic] = React.useState(null);
  const [quizTaskType, setQuizTaskType] = React.useState("theory");
  const [replanMessage, setReplanMessage] = React.useState(null);
  const [initialChatContext, setInitialChatContext] = React.useState(null);

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
        const profileExists = profileSnap.exists();
        setHasProfile(profileExists);
        
        // Check for inactivity and replan if needed
        if (profileExists) {
          try {
            const replanResult = await checkInactivityAndReplan(currentUser.uid);
            if (replanResult.needsReplan && replanResult.message) {
              setReplanMessage(replanResult.message);
            }
          } catch (error) {
            console.error("Error checking inactivity:", error);
          }
        }
      } else {
        setHasProfile(false);
        setReplanMessage(null);
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
  
  // Quiz Mode
  if (showQuiz && quizSubject && quizTopic) {
    return (
      <QuizMode
        user={user}
        subject={quizSubject}
        topic={quizTopic}
        taskType={quizTaskType}
        onBack={() => {
          setShowQuiz(false);
          setQuizSubject(null);
          setQuizTopic(null);
          setQuizTaskType("theory");
        }}
        onComplete={(summary) => {
          console.log("Quiz complete:", summary);
        }}
      />
    );
  }
  
  // Subject-specific chat
  if (selectedSubject) {
    return (
      <SubjectChat
        user={user}
        subject={selectedSubject}
        initialContext={initialChatContext}
        onBack={() => {
          setSelectedSubject(null);
          setInitialChatContext(null);
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
  
  // Edit Plan
  if (showEditPlan) {
    return (
      <EditPlan
        user={user}
        onBack={() => setShowEditPlan(false)}
        onSave={() => {
          setShowEditPlan(false);
          window.location.reload();
        }}
      />
    );
  }
  
  // Schedule View
  if (showSchedule) {
    return (
      <ScheduleView
        user={user}
        onBack={() => setShowSchedule(false)}
      />
    );
  }
  
  // Fixed Commitments
  if (showCommitments) {
    return (
      <FixedCommitments
        user={user}
        onBack={() => setShowCommitments(false)}
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
      onOpenCommitments={() => setShowCommitments(true)}
      onOpenSchedule={() => setShowSchedule(true)}
      onOpenEditPlan={() => setShowEditPlan(true)}
      onStartTask={(subject, topic) => {
        setInitialChatContext({ topic, action: "questions" });
        setSelectedSubject(subject);
      }}
      onOpenQuiz={(subject, topic, taskType = "theory") => {
        setQuizSubject(subject);
        setQuizTopic(topic);
        setQuizTaskType(taskType);
        setShowQuiz(true);
      }}
      replanMessage={replanMessage}
      onDismissReplanMessage={() => setReplanMessage(null)}
    />
  );
}

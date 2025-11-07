// web/src/components/SubjectChatSelector.jsx
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { loadSettings, updateTheme } from "../lib/settingsStore";
import { ArrowLeft, Sun, Moon, LogOut } from "lucide-react";

const SUBJECT_ICONS = {
  "Matemática": "🔢",
  "Física": "⚛️",
  "Química": "🧪",
  "Português": "📖",
  "História": "🏛️",
  "Geografia": "🌍",
  "Biologia": "🧬",
  "Inglês": "🇬🇧",
  "Redação": "✍️",
};

export default function SubjectChatSelector({ user, onSelectSubject, onBack, onLogout }) {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // Theme colors
  const C_LIGHT = {
    bg: "#f8fafc",
    panel: "#ffffff",
    panel2: "#f1f5f9",
    border: "#d1d5db",
    text: "#111827",
    accent: "#2563eb",
    textSecondary: "#64748b",
  };
  const C_DARK = {
    bg: "#18181b",
    panel: "#27272a",
    panel2: "#1f2125",
    border: "#3f3f46",
    text: "#f4f4f5",
    accent: "#3b82f6",
    textSecondary: "#a1a1aa",
  };

  const C = darkMode ? C_DARK : C_LIGHT;

  // Load settings
  useEffect(() => {
    if (!user) return;
    
    loadSettings(user.uid).then((settings) => {
      setDarkMode(settings.theme === "dark");
    });
  }, [user]);

  useEffect(() => {
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
  }, [darkMode]); // eslint-disable-line

  // Load user subjects
  useEffect(() => {
    const loadSubjects = async () => {
      if (!user) return;
      
      try {
        const profileRef = doc(db, "users", user.uid, "profile", "default");
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          const profile = profileSnap.data();
          setSubjects(profile.subjects || []);
        }
      } catch (error) {
        console.error("Error loading subjects:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadSubjects();
  }, [user]);

  const handleToggleTheme = () => {
    const newTheme = !darkMode;
    setDarkMode(newTheme);
    if (user) {
      updateTheme(user.uid, newTheme ? "dark" : "light");
    }
  };

  if (loading) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        color: C.text,
        fontFamily: "Inter, sans-serif",
      }}>
        Carregando matérias...
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: C.bg,
      color: C.text,
      fontFamily: "Inter, sans-serif",
      overflowY: "auto",
      padding: 24,
    }}>
      {/* Header */}
      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        marginBottom: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, color: C.accent }}>
            💬 Chats por Matéria
          </h1>
          <p style={{ fontSize: 16, color: C.textSecondary }}>
            Converse com o tutor especializado em cada matéria
          </p>
        </div>
        
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleToggleTheme}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel,
              color: C.text,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={onBack}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel,
              color: C.text,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ArrowLeft size={16} />
            Voltar ao Hub
          </button>
          <button
            onClick={onLogout}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel,
              color: C.text,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </div>

      {/* Subjects Grid */}
      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 20,
      }}>
        {subjects.map((subjectData, index) => {
          const subject = subjectData.subject;
          const icon = SUBJECT_ICONS[subject] || "📚";
          
          return (
            <button
              key={index}
              onClick={() => onSelectSubject(subject)}
              style={{
                padding: 24,
                borderRadius: 16,
                border: `2px solid ${C.border}`,
                background: C.panel,
                color: C.text,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = C.accent;
                e.target.style.transform = "translateY(-4px)";
                e.target.style.boxShadow = darkMode 
                  ? "0 8px 24px rgba(0,0,0,0.3)"
                  : "0 8px 24px rgba(37, 99, 235, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = C.border;
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "none";
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                {subject}
              </div>
              <div style={{ fontSize: 14, color: C.textSecondary, marginBottom: 12 }}>
                {subjectData.topics?.join(", ") || "Sem tópicos"}
              </div>
              <div style={{ 
                fontSize: 12, 
                color: C.textSecondary,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>Prioridade:</span>
                <div style={{
                  display: "inline-flex",
                  gap: 2,
                }}>
                  {Array.from({ length: Math.round(subjectData.weight || 1) }).map((_, i) => (
                    <span key={i} style={{ color: C.accent }}>●</span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {subjects.length === 0 && (
        <div style={{
          maxWidth: 600,
          margin: "0 auto",
          textAlign: "center",
          padding: 60,
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
            Nenhuma matéria encontrada
          </div>
          <div style={{ fontSize: 16, color: C.textSecondary, marginBottom: 24 }}>
            Complete o onboarding para adicionar matérias e começar a estudar
          </div>
          <button
            onClick={onBack}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: C.accent,
              color: "white",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Voltar ao Hub
          </button>
        </div>
      )}
    </div>
  );
}


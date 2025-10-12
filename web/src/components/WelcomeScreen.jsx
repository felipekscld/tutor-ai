// web/src/components/WelcomeScreen.jsx
import { useEffect, useRef, useState } from "react";

export default function WelcomeScreen({ onComplete }) {
  const [objective, setObjective] = useState("");
  const [timeframe, setTimeframe] = useState("");
  
  // Theme state
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

  const [darkMode, setDarkMode] = useState(() => {
    const v = localStorage.getItem("tutor-darkmode");
    return v ? v === "1" : false;
  });
  const C = darkMode ? C_DARK : C_LIGHT;

  useEffect(() => {
    localStorage.setItem("tutor-darkmode", darkMode ? "1" : "0");
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
  }, [darkMode]); // eslint-disable-line

  // Auto-resize textarea
  const objectiveRef = useRef(null);
  useEffect(() => {
    const ta = objectiveRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(120, ta.scrollHeight) + "px";
  }, [objective]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedObjective = objective.trim();
    const trimmedTimeframe = timeframe.trim();
    
    if (trimmedObjective && trimmedTimeframe) {
      onComplete({ objective: trimmedObjective, timeframe: trimmedTimeframe });
    }
  };

  const isValid = objective.trim() && timeframe.trim();

  // Styles
  const layout = {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: C.bg,
    color: C.text,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    padding: 24,
  };

  const titleStyle = {
    fontSize: 36,
    fontWeight: 700,
    color: C.accent,
    marginBottom: 8,
    textAlign: "center",
  };

  const subtitleStyle = {
    fontSize: 18,
    color: C.textSecondary,
    marginBottom: 40,
    marginTop: 4,
    textAlign: "center",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 450,
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: 32,
    boxShadow: darkMode 
      ? "0 10px 40px rgba(0,0,0,0.3)" 
      : "0 10px 40px rgba(0,0,0,0.1)",
  };

  const labelStyle = {
    display: "block",
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 8,
    color: C.text,
  };

  const textareaStyle = {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.panel2,
    color: C.text,
    fontSize: 15,
    lineHeight: 1.5,
    resize: "none",
    outline: "none",
    fontFamily: "inherit",
    marginBottom: 20,
  };

  const inputStyle = {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.panel2,
    color: C.text,
    fontSize: 15,
    outline: "none",
    fontFamily: "inherit",
    marginBottom: 24,
  };

  const buttonStyle = {
    width: "100%",
    padding: "14px 20px",
    borderRadius: 10,
    border: "none",
    background: isValid ? C.accent : (darkMode ? "#3f3f46" : "#e5e7eb"),
    color: isValid ? "white" : (darkMode ? "#a1a1aa" : "#9ca3af"),
    fontSize: 16,
    fontWeight: 600,
    cursor: isValid ? "pointer" : "not-allowed",
    transition: "all 0.2s ease",
  };

  const themeToggleStyle = {
    position: "fixed",
    bottom: 24,
    right: 24,
    padding: "10px 16px",
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.text,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  };

  return (
    <div style={layout}>
      <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        <h1 style={titleStyle}>Tutor</h1>
      </div>
      <p style={subtitleStyle}>Seu hub de estudos inteligente</p>

      <form onSubmit={handleSubmit} style={cardStyle}>
        <label style={labelStyle}>
          Defina seu objetivo de estudo
        </label>
        <textarea
          ref={objectiveRef}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Ex: Aprender Cálculo 1"
          rows={1}
          style={textareaStyle}
        />

        <label style={labelStyle}>
          Prazo desejado
        </label>
        <input
          type="text"
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          placeholder="Ex: 3 meses"
          style={inputStyle}
        />

        <button
          type="submit"
          disabled={!isValid}
          style={buttonStyle}
          onMouseEnter={(e) => {
            if (isValid) {
              e.target.style.transform = "translateY(-1px)";
              e.target.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "none";
          }}
        >
          Começar
        </button>
      </form>

      <button
        onClick={() => setDarkMode((v) => !v)}
        style={themeToggleStyle}
        title={darkMode ? "Modo claro" : "Modo escuro"}
      >
        {darkMode ? "Claro" : "Escuro"}
      </button>
    </div>
  );
}


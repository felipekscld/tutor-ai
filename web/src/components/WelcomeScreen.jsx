// web/src/components/WelcomeScreen.jsx
import { useEffect, useRef, useState } from "react";

export default function WelcomeScreen({ onComplete, user, onLogout }) {
  // Form state
  const [examType, setExamType] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [dailyMinutes, setDailyMinutes] = useState("");
  const [goals, setGoals] = useState("");
  
  // Subject input state
  const [currentSubject, setCurrentSubject] = useState("");
  const [currentTopics, setCurrentTopics] = useState("");
  const [currentWeight, setCurrentWeight] = useState("1");
  
  // Theme state
  const C_LIGHT = {
    bg: "#f8fafc",
    panel: "#ffffff",
    panel2: "#f1f5f9",
    border: "#d1d5db",
    text: "#111827",
    accent: "#2563eb",
    textSecondary: "#64748b",
    success: "#10b981",
    remove: "#ef4444",
  };
  const C_DARK = {
    bg: "#18181b",
    panel: "#27272a",
    panel2: "#1f2125",
    border: "#3f3f46",
    text: "#f4f4f5",
    accent: "#3b82f6",
    textSecondary: "#a1a1aa",
    success: "#34d399",
    remove: "#f87171",
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

  const goalsRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = goalsRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(120, ta.scrollHeight) + "px";
  }, [goals]);

  // Add subject
  const handleAddSubject = () => {
    const subjectName = currentSubject.trim();
    const topicsStr = currentTopics.trim();
    
    if (!subjectName) {
      alert("Digite o nome da matéria");
      return;
    }
    
    if (!topicsStr) {
      alert("Digite pelo menos um tópico (ex: Trigonometria, Cálculo)");
      return;
    }
    
    const topics = topicsStr.split(",").map(t => t.trim()).filter(Boolean);
    const weight = parseFloat(currentWeight) || 1;
    
    setSubjects([...subjects, {
      subject: subjectName,
      topics,
      weight: Math.max(0.5, Math.min(3, weight)), // Clamp between 0.5 and 3
    }]);
    
    setCurrentSubject("");
    setCurrentTopics("");
    setCurrentWeight("1");
  };

  // Remove subject
  const handleRemoveSubject = (index) => {
    setSubjects(subjects.filter((_, i) => i !== index));
  };

  // Submit form
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!examType) {
      alert("Selecione o tipo de prova/objetivo");
      return;
    }
    
    if (subjects.length === 0) {
      alert("Adicione pelo menos uma matéria com tópicos");
      return;
    }
    
    const minutes = parseInt(dailyMinutes, 10);
    if (!minutes || minutes < 15 || minutes > 600) {
      alert("Digite minutos diários válidos (entre 15 e 600)");
      return;
    }
    
    onComplete({
      exam_type: examType,
      subjects,
      daily_minutes: minutes,
      goals: goals.trim() || "",
    });
  };

  const isValid = examType && subjects.length > 0 && dailyMinutes && parseInt(dailyMinutes, 10) >= 15;

  // Styles
  const layout = {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    background: C.bg,
    color: C.text,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    padding: 24,
    overflowY: "auto",
  };

  const titleStyle = {
    fontSize: 36,
    fontWeight: 700,
    color: C.accent,
    marginBottom: 8,
    marginTop: 24,
    textAlign: "center",
  };

  const subtitleStyle = {
    fontSize: 18,
    color: C.textSecondary,
    marginBottom: 32,
    textAlign: "center",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 600,
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: 32,
    marginBottom: 24,
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
    marginBottom: 20,
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
  };

  const textareaStyle = {
    ...inputStyle,
    resize: "none",
    lineHeight: 1.5,
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

  const addButtonStyle = {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: "#059669",
    color: "white",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 12,
  };

  const subjectChipStyle = (index) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    background: C.panel2,
    border: `1px solid ${C.border}`,
    marginRight: 8,
    marginBottom: 8,
    fontSize: 14,
  });

  const removeButtonStyle = {
    padding: "4px 8px",
    borderRadius: 6,
    border: "none",
    background: C.remove,
    color: "white",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div style={layout}>
      {user && (
        <button
          onClick={onLogout}
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            padding: "10px 16px",
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.panel,
            color: C.text,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
          title="Sair"
        >
          Sair
        </button>
      )}
      
      <h1 style={titleStyle}>Configure seu Plano de Estudos</h1>
      <p style={subtitleStyle}>Vamos personalizar seu aprendizado</p>

      <form onSubmit={handleSubmit} style={cardStyle}>
        {/* Exam Type */}
        <label style={labelStyle}>
          1. Tipo de Prova / Objetivo
        </label>
        <select
          value={examType}
          onChange={(e) => setExamType(e.target.value)}
          style={selectStyle}
        >
          <option value="">Selecione...</option>
          <option value="ENEM">ENEM</option>
          <option value="Vestibular">Vestibular (específico)</option>
          <option value="Concurso">Concurso Público</option>
          <option value="Faculdade">Matérias da Faculdade</option>
          <option value="Certificação">Certificação Profissional</option>
          <option value="Outro">Outro</option>
        </select>

        {/* Subjects */}
        <label style={labelStyle}>
          2. Matérias e Tópicos
        </label>
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={currentSubject}
            onChange={(e) => setCurrentSubject(e.target.value)}
            placeholder="Nome da matéria (ex: Matemática)"
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <input
            type="text"
            value={currentTopics}
            onChange={(e) => setCurrentTopics(e.target.value)}
            placeholder="Tópicos separados por vírgula (ex: Trigonometria, Cálculo)"
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0, flex: 1 }}>
              Prioridade (0.5 = baixa, 1 = normal, 2-3 = alta):
            </label>
            <input
              type="number"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              min="0.5"
              max="3"
              step="0.5"
              style={{ ...inputStyle, marginBottom: 0, width: 80 }}
            />
          </div>
          <button type="button" onClick={handleAddSubject} style={addButtonStyle}>
            Adicionar Matéria
          </button>
        </div>

        {subjects.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 8 }}>
              Matérias adicionadas:
            </div>
            {subjects.map((s, i) => (
              <div key={i} style={subjectChipStyle(i)}>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.subject}</div>
                  <div style={{ fontSize: 12, color: C.textSecondary }}>
                    {s.topics.join(", ")} (prioridade: {s.weight})
                  </div>
                </div>
                <button type="button" onClick={() => handleRemoveSubject(i)} style={removeButtonStyle}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Daily Minutes */}
        <label style={labelStyle}>
          3. Minutos Disponíveis por Dia
        </label>
        <input
          type="number"
          value={dailyMinutes}
          onChange={(e) => setDailyMinutes(e.target.value)}
          placeholder="Ex: 120"
          min="15"
          max="600"
          style={inputStyle}
        />

        {/* Goals (optional) */}
        <label style={labelStyle}>
          4. Objetivos Específicos (opcional)
        </label>
        <textarea
          ref={goalsRef}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          placeholder="Ex: Quero focar em questões de nível difícil e melhorar minha velocidade de resolução"
          rows={1}
          style={textareaStyle}
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
          Criar Meu Plano
        </button>
      </form>

      <button
        onClick={() => setDarkMode((v) => !v)}
        style={{
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
        }}
        title={darkMode ? "Modo claro" : "Modo escuro"}
      >
        {darkMode ? "Claro" : "Escuro"}
      </button>
    </div>
  );
}

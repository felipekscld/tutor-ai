// web/src/components/EditPlan.jsx
import { useEffect, useRef, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, serverTimestamp } from "firebase/firestore";
import { generateGoals } from "../lib/goalsEngine";
import { generateWeekSchedule } from "../lib/scheduleEngine";
import { loadSettings } from "../lib/settingsStore";
import { ArrowLeft, Plus, Trash2, Save, AlertTriangle } from "lucide-react";

export default function EditPlan({ user, onBack, onSave }) {
  // Form state
  const [examType, setExamType] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [dailyMinutes, setDailyMinutes] = useState("");
  const [goals, setGoals] = useState("");
  const [availableHours, setAvailableHours] = useState({
    sunday: { start: "09:00", end: "18:00" },
    monday: { start: "08:00", end: "22:00" },
    tuesday: { start: "08:00", end: "22:00" },
    wednesday: { start: "08:00", end: "22:00" },
    thursday: { start: "08:00", end: "22:00" },
    friday: { start: "08:00", end: "22:00" },
    saturday: { start: "09:00", end: "18:00" },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const DAYS_LABELS = {
    sunday: "Domingo",
    monday: "Segunda",
    tuesday: "Terça",
    wednesday: "Quarta",
    thursday: "Quinta",
    friday: "Sexta",
    saturday: "Sábado",
  };
  
  // Subject input state
  const [currentSubject, setCurrentSubject] = useState("");
  const [currentTopics, setCurrentTopics] = useState("");
  const [currentWeight, setCurrentWeight] = useState("1");
  
  // Theme state
  const [darkMode, setDarkMode] = useState(false);
  
  const C_LIGHT = {
    bg: "#f8fafc",
    panel: "#ffffff",
    panel2: "#f1f5f9",
    border: "#d1d5db",
    text: "#111827",
    accent: "#2563eb",
    textSecondary: "#64748b",
    success: "#10b981",
    danger: "#ef4444",
    warning: "#f59e0b",
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
    danger: "#f87171",
    warning: "#fbbf24",
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

  // Load existing profile
  useEffect(() => {
    if (!user) return;
    
    const loadProfile = async () => {
      try {
        const profileRef = doc(db, "users", user.uid, "profile", "default");
        const snap = await getDoc(profileRef);
        
        if (snap.exists()) {
          const data = snap.data();
          setExamType(data.exam_type || "");
          setSubjects(data.subjects || []);
          setDailyMinutes(String(data.daily_minutes || ""));
          setGoals(data.goals || "");
          if (data.available_hours) {
            setAvailableHours(data.available_hours);
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadProfile();
  }, [user]);

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
      alert("Digite pelo menos um tópico");
      return;
    }
    
    const topics = topicsStr.split(",").map(t => t.trim()).filter(Boolean);
    const weight = parseFloat(currentWeight) || 1;
    
    setSubjects([...subjects, {
      subject: subjectName,
      topics,
      weight: Math.max(0.5, Math.min(3, weight)),
    }]);
    
    setCurrentSubject("");
    setCurrentTopics("");
    setCurrentWeight("1");
  };

  // Remove subject
  const handleRemoveSubject = (index) => {
    setSubjects(subjects.filter((_, i) => i !== index));
  };

  // Save changes
  const handleSave = async () => {
    if (!examType) {
      alert("Selecione o tipo de prova/objetivo");
      return;
    }
    
    if (subjects.length === 0) {
      alert("Adicione pelo menos uma matéria");
      return;
    }
    
    const minutes = parseInt(dailyMinutes, 10);
    if (!minutes || minutes < 15 || minutes > 600) {
      alert("Digite minutos diários válidos (entre 15 e 600)");
      return;
    }
    
    const confirmed = confirm(
      "⚠️ Ao salvar, seu cronograma será regenerado.\n\n" +
      "Tarefas futuras serão recriadas com base no novo plano.\n" +
      "Seu progresso (XP, badges, histórico) será mantido.\n\n" +
      "Continuar?"
    );
    
    if (!confirmed) return;
    
    setSaving(true);
    
    try {
      const profileData = {
        exam_type: examType,
        subjects,
        daily_minutes: minutes,
        goals: goals.trim() || "",
        available_hours: availableHours,
        updatedAt: serverTimestamp(),
      };
      
      // Update profile
      const profileRef = doc(db, "users", user.uid, "profile", "default");
      await setDoc(profileRef, profileData, { merge: true });
      
      // Delete old goals
      const goalsCollection = collection(db, "users", user.uid, "goals");
      const goalsSnap = await getDocs(goalsCollection);
      await Promise.all(goalsSnap.docs.map(d => deleteDoc(d.ref)));
      
      // Delete today's schedule and future schedules (so they get regenerated)
      const today = new Date().toISOString().split('T')[0];
      const schedCollection = collection(db, "users", user.uid, "schedule");
      const schedSnap = await getDocs(schedCollection);
      await Promise.all(
        schedSnap.docs
          .filter(d => d.id >= today) // Changed from > to >= to include today
          .map(d => deleteDoc(d.ref))
      );
      
      // Regenerate goals
      await generateGoals(user.uid, profileData);
      
      // Generate schedule for the entire week
      await generateWeekSchedule(user.uid, new Date());
      
      alert("Plano atualizado com sucesso! O cronograma da semana foi gerado.");
      onSave?.();
    } catch (error) {
      console.error("Error saving:", error);
      alert("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const isValid = examType && subjects.length > 0 && dailyMinutes && parseInt(dailyMinutes, 10) >= 15;

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
        Carregando plano...
      </div>
    );
  }

  // Styles
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
    marginBottom: 16,
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: C.bg,
      color: C.text,
      fontFamily: "Inter, sans-serif",
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{
        position: "sticky",
        top: 0,
        background: C.panel,
        borderBottom: `1px solid ${C.border}`,
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={onBack}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel2,
              color: C.text,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Editar Plano de Estudos</div>
            <div style={{ fontSize: 13, color: C.textSecondary }}>
              Ajuste suas matérias, tópicos e tempo disponível
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: isValid && !saving ? C.success : C.border,
            color: isValid && !saving ? "white" : C.textSecondary,
            cursor: isValid && !saving ? "pointer" : "not-allowed",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Save size={16} />
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
        {/* Warning */}
        <div style={{
          background: C.warning + "20",
          border: `1px solid ${C.warning}`,
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}>
          <AlertTriangle size={20} color={C.warning} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Atenção</div>
            <div style={{ fontSize: 13, color: C.textSecondary }}>
              Ao salvar alterações, seu cronograma futuro será regenerado. Tarefas já concluídas e seu progresso (XP, badges) serão mantidos.
            </div>
          </div>
        </div>

        {/* Form */}
        <div style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
        }}>
          {/* Exam Type */}
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Tipo de Prova / Objetivo
          </label>
          <select
            value={examType}
            onChange={(e) => setExamType(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
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
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Matérias e Tópicos
          </label>
          
          {/* Existing subjects */}
          {subjects.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {subjects.map((s, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 8,
                  background: C.panel2,
                  border: `1px solid ${C.border}`,
                  marginBottom: 8,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{s.subject}</div>
                    <div style={{ fontSize: 12, color: C.textSecondary }}>
                      {s.topics.join(", ")} • Prioridade: {s.weight}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveSubject(i)}
                    style={{
                      padding: 8,
                      borderRadius: 6,
                      border: `1px solid ${C.danger}`,
                      background: "transparent",
                      color: C.danger,
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Add new subject */}
          <div style={{
            padding: 16,
            borderRadius: 10,
            border: `1px dashed ${C.border}`,
            background: C.panel2,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: C.textSecondary }}>
              Adicionar Matéria
            </div>
            <input
              type="text"
              value={currentSubject}
              onChange={(e) => setCurrentSubject(e.target.value)}
              placeholder="Nome da matéria (ex: Matemática)"
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <input
              type="text"
              value={currentTopics}
              onChange={(e) => setCurrentTopics(e.target.value)}
              placeholder="Tópicos separados por vírgula"
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.textSecondary }}>Prioridade (0.5-3)</label>
                <input
                  type="number"
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(e.target.value)}
                  min="0.5"
                  max="3"
                  step="0.5"
                  style={{ ...inputStyle, marginBottom: 0, marginTop: 4 }}
                />
              </div>
              <button
                onClick={handleAddSubject}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: C.accent,
                  color: "white",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 16,
                }}
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
          </div>

          {/* Daily Minutes */}
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Minutos Disponíveis por Dia
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

          {/* Available Hours by Day */}
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Horários Disponíveis por Dia
          </label>
          <div style={{
            padding: 16,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.panel2,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 12 }}>
              Configure os horários em que você pode estudar em cada dia da semana.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(DAYS_LABELS).map(([dayKey, dayLabel]) => (
                <div key={dayKey} style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr 20px 1fr",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{dayLabel}</span>
                  <input
                    type="time"
                    value={availableHours[dayKey]?.start || "08:00"}
                    onChange={(e) => setAvailableHours(prev => ({
                      ...prev,
                      [dayKey]: { ...prev[dayKey], start: e.target.value }
                    }))}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: C.panel,
                      color: C.text,
                      fontSize: 13,
                    }}
                  />
                  <span style={{ textAlign: "center", color: C.textSecondary }}>-</span>
                  <input
                    type="time"
                    value={availableHours[dayKey]?.end || "22:00"}
                    onChange={(e) => setAvailableHours(prev => ({
                      ...prev,
                      [dayKey]: { ...prev[dayKey], end: e.target.value }
                    }))}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: C.panel,
                      color: C.text,
                      fontSize: 13,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Goals */}
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Objetivos Específicos (opcional)
          </label>
          <textarea
            ref={goalsRef}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="Ex: Focar em questões difíceis, melhorar velocidade..."
            rows={1}
            style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
          />
        </div>
      </div>
    </div>
  );
}


// web/src/components/FixedCommitments.jsx
import { useEffect, useState } from "react";
import { loadSettings } from "../lib/settingsStore";
import {
  getFixedCommitments,
  addFixedCommitment,
  deleteFixedCommitment,
  DAYS_LABELS,
} from "../lib/commitmentsStore";
import { adaptScheduleForCommitment } from "../lib/scheduleEngine";
import { ArrowLeft, Plus, Trash2, Calendar, Clock } from "lucide-react";

export default function FixedCommitments({ user, onBack }) {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  
  // Form state
  const [formDay, setFormDay] = useState("monday");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [formDescription, setFormDescription] = useState("");
  const [formError, setFormError] = useState("");
  
  // Theme colors
  const C_LIGHT = {
    bg: "#f8fafc",
    panel: "#ffffff",
    panel2: "#f1f5f9",
    border: "#d1d5db",
    text: "#111827",
    accent: "#2563eb",
    textSecondary: "#64748b",
    success: "#059669",
    danger: "#ef4444",
  };
  const C_DARK = {
    bg: "#18181b",
    panel: "#27272a",
    panel2: "#1f2125",
    border: "#3f3f46",
    text: "#f4f4f5",
    accent: "#3b82f6",
    textSecondary: "#a1a1aa",
    success: "#059669",
    danger: "#f87171",
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

  // Adapt existing schedules for the new commitment
  const adaptSchedulesForNewCommitment = async (commitment) => {
    if (!user) return;
    
    try {
      const result = await adaptScheduleForCommitment(user.uid, commitment);
      console.log(`✓ Adapted ${result.schedulesUpdated} schedule(s) for new commitment`);
    } catch (error) {
      console.error("Error adapting schedules:", error);
    }
  };

  // Load commitments
  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const data = await getFixedCommitments(user.uid);
      // Sort by day of week, then by start time
      const dayOrder = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      data.sort((a, b) => {
        if (dayOrder[a.day_of_week] !== dayOrder[b.day_of_week]) {
          return dayOrder[a.day_of_week] - dayOrder[b.day_of_week];
        }
        return a.start_time.localeCompare(b.start_time);
      });
      setCommitments(data);
    } catch (error) {
      console.error("Error loading commitments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]); // eslint-disable-line

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    
    // Validate times
    if (formStartTime >= formEndTime) {
      setFormError("O horário de término deve ser depois do início.");
      return;
    }
    
    if (!formDescription.trim()) {
      setFormError("Digite uma descrição.");
      return;
    }
    
    try {
      const newCommitment = {
        day_of_week: formDay,
        start_time: formStartTime,
        end_time: formEndTime,
        description: formDescription.trim(),
      };
      
      await addFixedCommitment(user.uid, newCommitment);
      
      // Adapt existing schedules to accommodate the new commitment
      await adaptSchedulesForNewCommitment(newCommitment);
      
      // Reset form
      setFormDay("monday");
      setFormStartTime("09:00");
      setFormEndTime("10:00");
      setFormDescription("");
      setShowForm(false);
      
      // Reload
      await loadData();
      
      alert("Compromisso adicionado! As tarefas conflitantes foram reagendadas.");
    } catch (error) {
      console.error("Error adding commitment:", error);
      setFormError("Erro ao adicionar. Tente novamente.");
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    if (!confirm("Remover este compromisso?")) return;
    
    try {
      // Find the commitment to get its details
      const commitment = commitments.find(c => c.id === id);
      
      await deleteFixedCommitment(user.uid, id);
      
      // Adapt schedules - with the commitment removed, tasks can use that time slot
      if (commitment) {
        // We need to re-adapt all schedules for this day
        // Create a "fake" commitment with the same day to trigger adaptation
        await adaptSchedulesForNewCommitment({
          day_of_week: commitment.day_of_week,
          start_time: "00:00",
          end_time: "00:01", // Minimal commitment just to trigger re-calculation
        });
      }
      
      await loadData();
      
      alert("Compromisso removido! O cronograma foi atualizado.");
    } catch (error) {
      console.error("Error deleting commitment:", error);
      alert("Erro ao remover. Tente novamente.");
    }
  };

  // Group commitments by day
  const groupedByDay = {};
  for (const c of commitments) {
    if (!groupedByDay[c.day_of_week]) {
      groupedByDay[c.day_of_week] = [];
    }
    groupedByDay[c.day_of_week].push(c);
  }

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
        Carregando...
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
            <div style={{ fontWeight: 700, fontSize: 18 }}>Compromissos Fixos</div>
            <div style={{ fontSize: 13, color: C.textSecondary }}>
              Bloqueie horários que não estão disponíveis para estudo
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
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
          }}
        >
          <Plus size={16} />
          Adicionar
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
        {/* Add Form */}
        {showForm && (
          <div style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              Novo Compromisso
            </h3>
            
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                {/* Day */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Dia da Semana
                  </label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: C.panel2,
                      color: C.text,
                      fontSize: 14,
                    }}
                  >
                    {Object.entries(DAYS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                
                {/* Start Time */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Início
                  </label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: C.panel2,
                      color: C.text,
                      fontSize: 14,
                    }}
                  />
                </div>
                
                {/* End Time */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Término
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: C.panel2,
                      color: C.text,
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>
              
              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Descrição
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ex: Aula de inglês, Trabalho, Academia..."
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: C.panel2,
                    color: C.text,
                    fontSize: 14,
                  }}
                />
              </div>
              
              {formError && (
                <div style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: C.danger + "20",
                  color: C.danger,
                  fontSize: 13,
                  marginBottom: 16,
                }}>
                  {formError}
                </div>
              )}
              
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="submit"
                  style={{
                    padding: "10px 20px",
                    borderRadius: 8,
                    border: "none",
                    background: C.success,
                    color: "white",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: C.panel2,
                    color: C.text,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Commitments List */}
        {commitments.length === 0 ? (
          <div style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
          }}>
            <Calendar size={48} color={C.textSecondary} style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Nenhum compromisso fixo
            </div>
            <div style={{ fontSize: 14, color: C.textSecondary }}>
              Adicione compromissos recorrentes como trabalho, aulas ou atividades fixas
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {Object.entries(DAYS_LABELS).map(([dayKey, dayLabel]) => {
              const dayCommitments = groupedByDay[dayKey];
              if (!dayCommitments || dayCommitments.length === 0) return null;
              
              return (
                <div key={dayKey}>
                  <h3 style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.textSecondary,
                    marginBottom: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>
                    {dayLabel}
                  </h3>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dayCommitments.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          background: C.panel,
                          border: `1px solid ${C.border}`,
                          borderRadius: 10,
                          padding: 16,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            background: C.accent + "20",
                            color: C.accent,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                            <Clock size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>
                              {c.description}
                            </div>
                            <div style={{ fontSize: 13, color: C.textSecondary }}>
                              {c.start_time} - {c.end_time}
                            </div>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => handleDelete(c.id)}
                          style={{
                            padding: 8,
                            borderRadius: 6,
                            border: `1px solid ${C.border}`,
                            background: C.panel2,
                            color: C.danger,
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


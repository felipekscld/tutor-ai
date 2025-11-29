// web/src/components/ScheduleView.jsx
import { useEffect, useState } from "react";
import { loadSettings } from "../lib/settingsStore";
import { db } from "../firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { getFixedCommitments } from "../lib/commitmentsStore";
import { ArrowLeft, Calendar, Clock, Check, X, AlertTriangle, ChevronLeft, ChevronRight, Ban } from "lucide-react";

const DAYS_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAYS_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekDates(baseDate = new Date()) {
  const dates = [];
  const startOfWeek = new Date(baseDate);
  startOfWeek.setDate(baseDate.getDate() - baseDate.getDay());
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

const DAYS_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export default function ScheduleView({ user, onBack }) {
  const [schedules, setSchedules] = useState({});
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  
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
    success: "#059669",
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

  // Get current week dates
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + weekOffset * 7);
  const weekDates = getWeekDates(baseDate);
  const todayStr = formatDate(new Date());

  // Load schedules and commitments
  const loadSchedules = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Load schedules
      const scheduleRef = collection(db, "users", user.uid, "schedule");
      const snap = await getDocs(scheduleRef);
      
      const scheduleMap = {};
      snap.docs.forEach(doc => {
        scheduleMap[doc.id] = doc.data();
      });
      
      setSchedules(scheduleMap);
      
      // Load fixed commitments
      const commitmentsData = await getFixedCommitments(user.uid);
      setCommitments(commitmentsData);
    } catch (error) {
      console.error("Error loading schedules:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Get commitments for a specific day of week
  const getCommitmentsForDay = (dayOfWeek) => {
    return commitments.filter(c => c.day_of_week === dayOfWeek);
  };

  useEffect(() => {
    loadSchedules();
  }, [user]); // eslint-disable-line

  // Get status counts for a day
  const getDayCounts = (dateStr) => {
    const schedule = schedules[dateStr];
    if (!schedule || !schedule.tasks) {
      return { total: 0, done: 0, failed: 0, pending: 0 };
    }
    
    const tasks = schedule.tasks;
    return {
      total: tasks.length,
      done: tasks.filter(t => t.status === "done").length,
      failed: tasks.filter(t => t.status === "failed").length,
      pending: tasks.filter(t => t.status === "pending").length,
      skipped: tasks.filter(t => t.status === "skipped").length,
    };
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
        Carregando cronograma...
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
            <div style={{ fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar size={20} />
              Cronograma
            </div>
            <div style={{ fontSize: 13, color: C.textSecondary }}>
              Visualize suas tarefas por semana
            </div>
          </div>
        </div>

        {/* Week Navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            style={{
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel2,
              color: C.text,
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={18} />
          </button>
          
          <button
            onClick={() => setWeekOffset(0)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: weekOffset === 0 ? C.accent : C.panel2,
              color: weekOffset === 0 ? "white" : C.text,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Hoje
          </button>
          
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            style={{
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel2,
              color: C.text,
              cursor: "pointer",
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {/* Week Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}>
          {weekDates.map((date, idx) => {
            const dateStr = formatDate(date);
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;
            const counts = getDayCounts(dateStr);
            
            return (
              <div
                key={dateStr}
                style={{
                  background: isToday ? C.accent + "15" : C.panel,
                  border: `2px solid ${isToday ? C.accent : C.border}`,
                  borderRadius: 12,
                  padding: 16,
                  minHeight: 120,
                }}
              >
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: isToday ? C.accent : C.textSecondary,
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}>
                  {DAYS_LABELS[idx]}
                </div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: isToday ? C.accent : C.text,
                  marginBottom: 12,
                }}>
                  {date.getDate()}
                </div>
                
                {counts.total > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {counts.done > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                        <Check size={12} color={C.success} />
                        <span style={{ color: C.success }}>{counts.done} feita(s)</span>
                      </div>
                    )}
                    {counts.pending > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                        <Clock size={12} color={isPast ? C.danger : C.textSecondary} />
                        <span style={{ color: isPast ? C.danger : C.textSecondary }}>
                          {counts.pending} pendente(s)
                        </span>
                      </div>
                    )}
                    {counts.failed > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                        <X size={12} color={C.warning} />
                        <span style={{ color: C.warning }}>{counts.failed} com erro(s)</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.textSecondary }}>
                    Sem tarefas
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Day Details */}
        <div style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Detalhes das Tarefas
          </h3>
          
          {weekDates.map((date, idx) => {
            const dateStr = formatDate(date);
            const schedule = schedules[dateStr];
            const isToday = dateStr === todayStr;
            
            if (!schedule || !schedule.tasks || schedule.tasks.length === 0) return null;
            
            return (
              <div key={dateStr} style={{ marginBottom: 24 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: isToday ? C.accent : C.textSecondary,
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  {isToday && <span style={{ 
                    background: C.accent, 
                    color: "white", 
                    padding: "2px 8px", 
                    borderRadius: 4, 
                    fontSize: 10,
                    fontWeight: 700,
                  }}>HOJE</span>}
                  {DAYS_FULL[idx]} - {date.getDate()}/{date.getMonth() + 1}
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Fixed commitments for this day */}
                  {getCommitmentsForDay(DAYS_KEYS[idx]).map((commitment) => (
                    <div
                      key={commitment.id}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${C.danger}40`,
                        background: C.danger + "10",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <Ban size={16} color={C.danger} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: C.danger }}>
                          {commitment.description}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSecondary }}>
                          Bloqueado: {commitment.start_time} - {commitment.end_time}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Tasks */}
                  {schedule.tasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        background: C.panel2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {task.subject} - {task.topic}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSecondary, display: "flex", alignItems: "center", gap: 8 }}>
                          {task.start_time && task.end_time && (
                            <span style={{ 
                              background: C.accent + "20", 
                              color: C.accent, 
                              padding: "2px 6px", 
                              borderRadius: 4,
                              fontWeight: 600,
                            }}>
                              {task.start_time} - {task.end_time}
                            </span>
                          )}
                          <span>{task.description} • {task.duration} min</span>
                        </div>
                      </div>
                      
                      <div style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: task.status === "done" ? C.success + "20" :
                                   task.status === "failed" ? C.warning + "20" :
                                   task.status === "skipped" ? C.textSecondary + "20" :
                                   C.accent + "20",
                        color: task.status === "done" ? C.success :
                               task.status === "failed" ? C.warning :
                               task.status === "skipped" ? C.textSecondary :
                               C.accent,
                      }}>
                        {task.status === "done" ? "Feito" :
                         task.status === "failed" ? "Com Erros" :
                         task.status === "skipped" ? "Pulado" :
                         "Pendente"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


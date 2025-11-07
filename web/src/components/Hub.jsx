// web/src/components/Hub.jsx
import { useEffect, useState } from "react";
import { loadSettings, updateTheme } from "../lib/settingsStore";
import { getSchedule } from "../lib/scheduleEngine";
import { markTaskDone, markTaskFailed, markTaskSkipped } from "../lib/scheduleStore";
import { calculateProgress } from "../lib/progressCalc";
import { logSessionStart, logSessionEnd } from "../lib/activityLog";
import { MessageSquare, BookOpen, Play, Square, Check, X, SkipForward, Sun, Moon, LogOut, RefreshCw, Trash2 } from "lucide-react";

export default function Hub({ user, onLogout, onOpenTutorAI, onOpenSubjectChats }) {
  const [schedule, setSchedule] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  
  // Session tracking
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  
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
    successText: "#ffffff",
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
    successText: "#ffffff",
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

  // Toggle theme
  const handleToggleTheme = () => {
    const newTheme = !darkMode;
    setDarkMode(newTheme);
    if (user) {
      updateTheme(user.uid, newTheme ? "dark" : "light");
    }
  };

  // Load schedule and progress
  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const [scheduleData, progressData] = await Promise.all([
        getSchedule(user.uid),
        calculateProgress(user.uid),
      ]);
      setSchedule(scheduleData);
      setProgress(progressData);
    } catch (error) {
      console.error("Error loading data:", error);
      alert("Erro ao carregar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]); // eslint-disable-line

  // Session timer (updates every second)
  useEffect(() => {
    if (!sessionActive) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const start = new Date(sessionStartTime);
      const totalSeconds = Math.floor((now - start) / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      // Store as decimal for display (e.g., 2.5 = 2min 30sec)
      setElapsedMinutes(minutes + seconds / 100);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [sessionActive, sessionStartTime]);

  // Start session
  const handleStartSession = async () => {
    if (!user) return;
    
    try {
      const startTime = new Date().toISOString();
      const sid = await logSessionStart(user.uid);
      setSessionStartTime(startTime);
      setSessionId(sid);
      setSessionActive(true);
      setElapsedMinutes(0);
    } catch (error) {
      console.error("Error starting session:", error);
    }
  };

  // End session
  const handleEndSession = async () => {
    if (!user || !sessionStartTime) return;
    
    try {
      await logSessionEnd(user.uid, sessionId, sessionStartTime);
      setSessionActive(false);
      setSessionStartTime(null);
      setSessionId(null);
      setElapsedMinutes(0);
      
      // Reload progress
      loadData();
    } catch (error) {
      console.error("Error ending session:", error);
    }
  };

  // Mark task status
  const handleMarkTask = async (task, status, difficulty = null) => {
    if (!user) return;
    
    try {
      if (status === "done") {
        await markTaskDone(user.uid, schedule.date, task, difficulty);
      } else if (status === "failed") {
        await markTaskFailed(user.uid, schedule.date, task, difficulty);
      } else if (status === "skipped") {
        await markTaskSkipped(user.uid, schedule.date, task);
      }
      
      // Reload data
      await loadData();
    } catch (error) {
      console.error("Error updating task:", error);
      alert("Erro ao atualizar tarefa. Tente novamente.");
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
        Carregando seu plano...
      </div>
    );
  }

  const tasks = schedule?.tasks || [];
  const failedTasks = tasks.filter(t => t.status === "failed");

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
          <div style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: C.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontSize: 20,
          }}>
            T
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Tutor-IA</div>
            <div style={{ fontSize: 13, color: C.textSecondary }}>
              {user?.displayName || user?.email}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleToggleTheme}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel2,
              color: C.text,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            {darkMode ? "Claro" : "Escuro"}
          </button>
          <button
            onClick={onLogout}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.panel2,
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

      {/* Main Content */}
      <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {/* KPIs */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}>
          <div style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 4 }}>
              Progresso Hoje
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: C.accent }}>
              {progress?.today?.completion_percentage || 0}%
            </div>
            <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>
              {(progress?.today?.done || 0) + (progress?.today?.failed || 0) + (progress?.today?.skipped || 0)} de {progress?.today?.total_tasks || 0} tarefas
            </div>
          </div>

          <div style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 4 }}>
              Minutos Hoje
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: C.success }}>
              {progress?.today.minutes_studied || 0}
            </div>
            <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>
              de {progress?.today.target_minutes || 0} min planejados
            </div>
          </div>

          <div style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
          }}>
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 4 }}>
              Total Acumulado
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: C.text }}>
              {progress?.all_time.hours_studied || 0}h
            </div>
            <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>
              {progress?.all_time.minutes_studied || 0} minutos
            </div>
          </div>
        </div>

        {/* Session Timer */}
        <div style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Sessão de Estudo
            </div>
            {sessionActive && (
              <div style={{ fontSize: 32, fontWeight: 700, color: C.accent, fontFamily: "monospace" }}>
                {(() => {
                  const minutes = Math.floor(elapsedMinutes);
                  const seconds = Math.round((elapsedMinutes - minutes) * 100);
                  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                })()}
              </div>
            )}
            {!sessionActive && (
              <div style={{ fontSize: 14, color: C.textSecondary, marginTop: 4 }}>
                Pronto para começar
              </div>
            )}
          </div>
          {!sessionActive ? (
            <button
              onClick={handleStartSession}
              style={{
                padding: "12px 24px",
                borderRadius: 8,
                border: "none",
                background: C.success,
                color: C.successText,
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Play size={18} />
              Iniciar Sessão
            </button>
          ) : (
            <button
              onClick={handleEndSession}
              style={{
                padding: "12px 24px",
                borderRadius: 8,
                border: "none",
                background: C.danger,
                color: "white",
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Square size={18} />
              Finalizar Sessão
            </button>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
          <button
            onClick={onOpenTutorAI}
            style={{
              padding: "16px 24px",
              borderRadius: 12,
              border: "none",
              background: C.accent,
              color: "white",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <MessageSquare size={18} />
            Tutor Geral
          </button>
          
          <button
            onClick={onOpenSubjectChats}
            style={{
              padding: "16px 24px",
              borderRadius: 12,
              border: `2px solid ${C.accent}`,
              background: C.panel,
              color: C.accent,
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <BookOpen size={18} />
            Chats por Matéria
          </button>
          
          {failedTasks.length > 0 && (
            <button
              style={{
                padding: "16px 24px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.panel2,
                color: C.text,
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              📝 Revisar Erros ({failedTasks.length})
            </button>
          )}
        </div>

        {/* Dev Tools (Testing) */}
        <div style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          background: C.panel2,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: C.textSecondary }}>
            Ferramentas de Teste
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                if (!user) return;
                try {
                  const { doc, deleteDoc } = await import("firebase/firestore");
                  const { db } = await import("../firebase");
                  const today = new Date().toISOString().split('T')[0];
                  await deleteDoc(doc(db, "users", user.uid, "schedule", today));
                  alert("Schedule de hoje deletado! Recarregando...");
                  window.location.reload();
                } catch (error) {
                  console.error(error);
                  alert("Erro ao regenerar: " + error.message);
                }
              }}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.panel,
                color: C.text,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              <RefreshCw size={14} style={{ marginRight: 4 }} />
              Regenerar Hoje
            </button>
            
            <button
              onClick={async () => {
                if (!user) return;
                if (confirm("Isso vai DELETAR TUDO (perfil, metas, schedules, logs) e voltar ao onboarding. Continuar?")) {
                  try {
                    const { doc, collection, getDocs, deleteDoc, writeBatch } = await import("firebase/firestore");
                    const { db } = await import("../firebase");
                    
                    // Delete profile
                    await deleteDoc(doc(db, "users", user.uid, "profile", "default"));
                    
                    // Delete goals summary
                    try {
                      await deleteDoc(doc(db, "users", user.uid, "goals_summary", "current"));
                    } catch (e) {}
                    
                    // Delete all goals
                    const goalsSnap = await getDocs(collection(db, "users", user.uid, "goals"));
                    await Promise.all(goalsSnap.docs.map(d => deleteDoc(d.ref)));
                    
                    // Delete all schedules
                    const schedSnap = await getDocs(collection(db, "users", user.uid, "schedule"));
                    await Promise.all(schedSnap.docs.map(d => deleteDoc(d.ref)));
                    
                    // Delete all activity logs
                    const logsSnap = await getDocs(collection(db, "users", user.uid, "activity_log"));
                    await Promise.all(logsSnap.docs.map(d => deleteDoc(d.ref)));
                    
                    alert("TUDO deletado! Redirecionando para onboarding...");
                    window.location.reload();
                  } catch (error) {
                    console.error(error);
                    alert("Erro ao resetar: " + error.message);
                  }
                }
              }}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: `1px solid ${C.danger}`,
                background: C.panel,
                color: C.danger,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              <Trash2 size={14} style={{ marginRight: 4 }} />
              Reset Completo
            </button>

            <button
              onClick={() => {
                window.location.reload();
              }}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: `1px solid ${C.success}`,
                background: C.panel,
                color: C.success,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Recarregar
            </button>
          </div>
        </div>

        {/* Tasks List */}
        <div style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
            Tarefas de Hoje
          </h2>

          {tasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: C.textSecondary }}>
              Nenhuma tarefa agendada para hoje. Aproveite para descansar! 🎉
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onMarkTask={handleMarkTask}
                  colors={C}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Task Item Component
function TaskItem({ task, onMarkTask, colors: C }) {
  const [showDifficulty, setShowDifficulty] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);

  const getStatusColor = (status) => {
    if (status === "done") return C.success;
    if (status === "failed") return C.danger;
    if (status === "skipped") return C.textSecondary;
    return C.border;
  };

  const getTypeIcon = (type, C) => {
    if (type === "theory") {
      return <BookOpen size={16} color="white" />;
    }
    if (type === "practice") {
      return <Check size={16} color="white" />;
    }
    return <span>•</span>;
  };

  const handleMark = (status) => {
    if (status === "done" || status === "failed") {
      setPendingStatus(status);
      setShowDifficulty(true);
    } else {
      onMarkTask(task, status);
    }
  };

  const handleMarkWithDifficulty = (difficulty) => {
    setSelectedDifficulty(difficulty);
    onMarkTask(task, pendingStatus, difficulty);
    setShowDifficulty(false);
    setPendingStatus(null);
  };

  return (
    <div style={{
      padding: 16,
      borderRadius: 10,
      border: `2px solid ${getStatusColor(task.status)}`,
      background: task.status === "pending" ? C.panel2 : C.panel,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: task.type === "theory" ? C.accent : C.success,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          {getTypeIcon(task.type, C)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
            {task.subject} - {task.topic}
          </div>
          <div style={{ fontSize: 14, color: C.textSecondary, marginBottom: 8 }}>
            {task.description} • {task.duration} minutos
          </div>
          
          {task.status === "pending" && !showDifficulty && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => handleMark("done")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: C.success,
                  color: "white",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Check size={16} />
                Feito
              </button>
              <button
                onClick={() => handleMark("failed")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: C.danger,
                  color: "white",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <X size={16} />
                Errei
              </button>
              <button
                onClick={() => handleMark("skipped")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  background: C.panel2,
                  color: C.text,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <SkipForward size={16} />
                Não Fiz
              </button>
            </div>
          )}

          {showDifficulty && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Como foi a dificuldade?
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleMarkWithDifficulty("easy")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    background: C.success,
                    color: "white",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Fácil
                </button>
                <button
                  onClick={() => handleMarkWithDifficulty("medium")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    background: C.warning,
                    color: "white",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Médio
                </button>
                <button
                  onClick={() => handleMarkWithDifficulty("hard")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    background: C.danger,
                    color: "white",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Difícil
                </button>
              </div>
            </div>
          )}

          {task.status !== "pending" && (
            <div style={{
              marginTop: 8,
              padding: "8px 12px",
              borderRadius: 6,
              background: C.panel2,
              fontSize: 13,
              fontWeight: 600,
            }}>
              Status: {task.status === "done" ? "Concluído" : task.status === "failed" ? "Com Erros" : "Pulado"}
              {task.difficulty && ` • Dificuldade: ${task.difficulty === "easy" ? "Fácil" : task.difficulty === "medium" ? "Médio" : "Difícil"}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


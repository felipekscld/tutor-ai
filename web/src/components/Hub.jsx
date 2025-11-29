// web/src/components/Hub.jsx
import { useEffect, useState } from "react";
import { loadSettings, updateTheme } from "../lib/settingsStore";
import { getSchedule } from "../lib/scheduleEngine";
import { markTaskDone, markTaskFailed, markTaskSkipped } from "../lib/scheduleStore";
import { calculateProgress } from "../lib/progressCalc";
import { logSessionStart, logSessionEnd } from "../lib/activityLog";
import { getRecommendationsForToday } from "../lib/recommendationEngine";
import { replanScheduleForUser } from "../lib/replanEngine";
import { computeAlerts } from "../lib/alertsEngine";
import { getGamificationStats, getEarnedBadges, calculateLevel, getLevelProgress, getXPToNextLevel } from "../lib/gamificationEngine";
import WeeklyInsight from "./WeeklyInsight";
import ActivityHeatmap from "./ActivityHeatmap";
import PomodoroTimer from "./PomodoroTimer";
import { MessageSquare, BookOpen, Play, Square, Check, X, SkipForward, Sun, Moon, LogOut, Trash2, Info, Clock, AlertTriangle, RotateCcw, Zap, Calendar, AlertCircle, CheckCircle2, ChevronRight, Flame, Award, Star, TrendingUp, Settings, Brain, HelpCircle } from "lucide-react";

export default function Hub({ user, onLogout, onOpenTutorAI, onOpenSubjectChats, onOpenCommitments, onOpenSchedule, onOpenEditPlan, onStartTask, onOpenQuiz, replanMessage, onDismissReplanMessage }) {
  const [schedule, setSchedule] = useState(null);
  const [progress, setProgress] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [gamification, setGamification] = useState(null);
  const [badges, setBadges] = useState([]);
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
      const [scheduleData, progressData, recommendationsData, alertsData, gamificationData, badgesData] = await Promise.all([
        getSchedule(user.uid),
        calculateProgress(user.uid),
        getRecommendationsForToday(user.uid),
        computeAlerts(user.uid),
        getGamificationStats(user.uid),
        getEarnedBadges(user.uid),
      ]);
      setSchedule(scheduleData);
      setProgress(progressData);
      setRecommendations(recommendationsData);
      setAlerts(alertsData);
      setGamification(gamificationData);
      setBadges(badgesData);
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
        {/* Replan Banner */}
        {replanMessage && (
          <div style={{
            background: C.warning + "20",
            border: `1px solid ${C.warning}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AlertTriangle size={24} color={C.warning} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Cronograma Atualizado</div>
                <div style={{ fontSize: 13, color: C.textSecondary }}>{replanMessage}</div>
              </div>
            </div>
            <button
              onClick={onDismissReplanMessage}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.panel,
                color: C.text,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Entendi
            </button>
          </div>
        )}

        {/* Alerts Panel */}
        <div style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={18} color={alerts.length > 0 ? C.warning : C.success} />
              Status do Plano
            </h3>
          </div>
          
          {alerts.length === 0 ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 16,
              borderRadius: 10,
              background: C.success + "15",
              border: `1px solid ${C.success}30`,
            }}>
              <CheckCircle2 size={24} color={C.success} />
              <div>
                <div style={{ fontWeight: 600, color: C.success }}>Você está em dia com seu plano!</div>
                <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 2 }}>
                  Continue assim para alcançar seus objetivos.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {alerts.map((alertItem) => (
                <AlertCard 
                  key={alertItem.id} 
                  alert={alertItem} 
                  colors={C}
                  onAction={async (action) => {
                    if (action === "replan") {
                      try {
                        const result = await replanScheduleForUser(user.uid);
                        window.alert(result.message || "Replanejamento concluído!");
                        window.location.reload();
                      } catch (error) {
                        console.error(error);
                      }
                    } else if (action === "view_schedule") {
                      onOpenSchedule();
                    } else if (action === "view_suggestions") {
                      // Scroll to suggestions section
                      const suggestionsEl = document.getElementById("suggestions-section");
                      if (suggestionsEl) {
                        suggestionsEl.scrollIntoView({ behavior: "smooth" });
                      }
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

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

        {/* Gamification Section */}
        {gamification && (
          <div style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={18} color={C.accent} />
                Seu Progresso
              </h3>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 24, alignItems: "center" }}>
              {/* XP Bar */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Star size={18} color={C.warning} fill={C.warning} />
                    <span style={{ fontWeight: 600 }}>Nível {calculateLevel(gamification.xp)}</span>
                  </div>
                  <span style={{ fontSize: 13, color: C.textSecondary }}>
                    {gamification.xp} XP
                  </span>
                </div>
                <div style={{
                  height: 8,
                  background: C.panel2,
                  borderRadius: 4,
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${getLevelProgress(gamification.xp)}%`,
                    background: `linear-gradient(90deg, ${C.accent}, ${C.success})`,
                    borderRadius: 4,
                    transition: "width 0.3s ease",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4 }}>
                  {getXPToNextLevel(gamification.xp)} XP para o próximo nível
                </div>
              </div>
              
              {/* Streak */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 16px",
                borderRadius: 10,
                background: gamification.current_streak > 0 ? C.warning + "20" : C.panel2,
                border: `1px solid ${gamification.current_streak > 0 ? C.warning + "40" : C.border}`,
              }}>
                <Flame 
                  size={24} 
                  color={gamification.current_streak > 0 ? C.warning : C.textSecondary}
                  fill={gamification.current_streak > 0 ? C.warning : "none"}
                />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: gamification.current_streak > 0 ? C.warning : C.textSecondary }}>
                    {gamification.current_streak}
                  </div>
                  <div style={{ fontSize: 11, color: C.textSecondary }}>
                    dias seguidos
                  </div>
                </div>
              </div>
              
              {/* Badges Count */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 16px",
                borderRadius: 10,
                background: C.panel2,
                border: `1px solid ${C.border}`,
              }}>
                <Award size={24} color={C.accent} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {badges.length}
                  </div>
                  <div style={{ fontSize: 11, color: C.textSecondary }}>
                    conquistas
                  </div>
                </div>
              </div>
            </div>
            
            {/* Badges Grid */}
            {badges.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.textSecondary }}>
                  Conquistas Desbloqueadas
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {badges.map((badge) => (
                    <div
                      key={badge.id}
                      title={`${badge.name}: ${badge.description}`}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: C.panel2,
                        border: `1px solid ${C.border}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{badge.icon}</span>
                      <span>{badge.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Weekly Insight */}
        <WeeklyInsight user={user} />
        
        {/* Activity Heatmap */}
        <ActivityHeatmap user={user} />

        {/* Pomodoro Timer */}
        <PomodoroTimer 
          user={user}
          currentTask={null}
          onComplete={(summary) => {
            console.log("Pomodoro session complete:", summary);
            loadData();
          }}
          colors={C}
        />

        {/* Quick Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
          <button
            onClick={onOpenTutorAI}
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              border: "none",
              background: C.accent,
              color: "white",
              cursor: "pointer",
              fontSize: 15,
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
              padding: "16px 20px",
              borderRadius: 12,
              border: `2px solid ${C.accent}`,
              background: C.panel,
              color: C.accent,
              cursor: "pointer",
              fontSize: 15,
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
          
          <button
            onClick={onOpenSchedule}
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              border: `2px solid ${C.success}`,
              background: C.panel,
              color: C.success,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Calendar size={18} />
            Ver Cronograma
          </button>
          
          <button
            onClick={onOpenCommitments}
            style={{
              padding: "16px 20px",
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              background: C.panel2,
              color: C.text,
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Clock size={18} />
            Compromissos
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

        {/* Suggestions Section */}
        {recommendations.length > 0 && (
          <div 
            id="suggestions-section"
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Zap size={20} color={C.warning} />
                Sugestões do Dia
              </h2>
              <div style={{ fontSize: 13, color: C.textSecondary }}>
                {recommendations.length} {recommendations.length === 1 ? "item" : "itens"}
              </div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {recommendations.slice(0, 5).map((rec) => (
                <RecommendationCard 
                  key={rec.id} 
                  recommendation={rec} 
                  colors={C}
                  onStart={() => onStartTask(rec.subject, rec.topic)}
                  onQuiz={() => onOpenQuiz(rec.subject, rec.topic, rec.type || "theory")}
                />
              ))}
            </div>
            
            {recommendations.length > 5 && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <span style={{ fontSize: 13, color: C.textSecondary }}>
                  + {recommendations.length - 5} mais sugestões
                </span>
              </div>
            )}
          </div>
        )}

        {/* Plan Management */}
        <div style={{
          marginBottom: 24,
          padding: 20,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          background: C.panel,
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Gerenciar Plano
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={onOpenEditPlan}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                background: C.accent,
                color: "white",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Settings size={16} />
              Editar Plano de Estudos
            </button>
            
            <button
              onClick={async () => {
                if (!user) return;
                if (confirm("⚠️ ATENÇÃO: Isso vai DELETAR TODO seu progresso (perfil, metas, cronograma, histórico, XP, badges) e voltar ao início.\n\nTem certeza que deseja recomeçar do zero?")) {
                  try {
                    const { doc, collection, getDocs, deleteDoc } = await import("firebase/firestore");
                    const { db } = await import("../firebase");
                    
                    // Delete profile
                    await deleteDoc(doc(db, "users", user.uid, "profile", "default"));
                    
                    // Delete goals summary
                    try { await deleteDoc(doc(db, "users", user.uid, "goals_summary", "current")); } catch (e) {}
                    
                    // Delete gamification
                    try { await deleteDoc(doc(db, "users", user.uid, "gamification", "stats")); } catch (e) {}
                    
                    // Delete all subcollections
                    const collections = ["goals", "schedule", "activity_log", "progress", "fixed_commitments"];
                    for (const colName of collections) {
                      const snap = await getDocs(collection(db, "users", user.uid, colName));
                      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
                    }
                    
                    alert("Tudo resetado! Redirecionando para configuração inicial...");
                    window.location.reload();
                  } catch (error) {
                    console.error(error);
                    alert("Erro ao resetar: " + error.message);
                  }
                }
              }}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: `1px solid ${C.danger}`,
                background: "transparent",
                color: C.danger,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Trash2 size={16} />
              Resetar Tudo
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
          <div style={{ fontSize: 14, color: C.textSecondary, marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {task.start_time && task.end_time ? (
              <span style={{ 
                background: C.accent + "20", 
                color: C.accent, 
                padding: "2px 8px", 
                borderRadius: 4, 
                fontSize: 12, 
                fontWeight: 600 
              }}>
                {task.start_time} - {task.end_time}
              </span>
            ) : (
              <span style={{ 
                background: C.textSecondary + "20", 
                color: C.textSecondary, 
                padding: "2px 8px", 
                borderRadius: 4, 
                fontSize: 12 
              }}>
                Horário flexível
              </span>
            )}
            <span>{task.description} • {task.duration} min</span>
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

// Alert Card Component
function AlertCard({ alert, colors: C, onAction }) {
  const getSeverityColor = () => {
    if (alert.severity === "high") return C.danger;
    if (alert.severity === "medium") return C.warning;
    return C.textSecondary;
  };
  
  const getSeverityIcon = () => {
    if (alert.severity === "high") return <AlertTriangle size={18} />;
    if (alert.severity === "medium") return <AlertCircle size={18} />;
    return <Info size={18} />;
  };
  
  const severityColor = getSeverityColor();
  
  return (
    <div style={{
      padding: 14,
      borderRadius: 10,
      border: `1px solid ${severityColor}40`,
      background: severityColor + "10",
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
    }}>
      <div style={{ color: severityColor, flexShrink: 0, marginTop: 2 }}>
        {getSeverityIcon()}
      </div>
      
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: C.text }}>
          {alert.title}
        </div>
        <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>
          {alert.text}
        </div>
      </div>
      
      {alert.cta && (
        <button
          onClick={() => onAction(alert.cta.action)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.panel,
            color: C.accent,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {alert.cta.label}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

// Recommendation Card Component
function RecommendationCard({ recommendation, colors: C, onStart, onQuiz }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  const getTypeLabel = () => {
    if (recommendation.recommendation_type === "overdue") {
      return { text: "Atrasada", color: C.danger, icon: <AlertTriangle size={12} /> };
    }
    if (recommendation.recommendation_type === "review") {
      return { text: "Revisão", color: C.warning, icon: <RotateCcw size={12} /> };
    }
    return { text: "Nova", color: C.accent, icon: <Clock size={12} /> };
  };
  
  const typeInfo = getTypeLabel();
  
  const getTypeIcon = () => {
    if (recommendation.type === "theory") return <BookOpen size={14} />;
    if (recommendation.type === "practice") return <Check size={14} />;
    if (recommendation.type === "review") return <RotateCcw size={14} />;
    return <Clock size={14} />;
  };
  
  return (
    <div style={{
      padding: 14,
      borderRadius: 10,
      border: `1px solid ${C.border}`,
      background: C.panel2,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      {/* Type Icon */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: typeInfo.color,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        {getTypeIcon()}
      </div>
      
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
          {recommendation.subject} - {recommendation.topic}
        </div>
        <div style={{ fontSize: 12, color: C.textSecondary }}>
          {recommendation.description} • {recommendation.duration} min
        </div>
      </div>
      
      {/* Quiz Button */}
      <button
        onClick={onQuiz}
        style={{
          padding: "8px 14px",
          borderRadius: 6,
          border: `1px solid ${C.warning}`,
          background: C.warning + "15",
          color: C.warning,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <HelpCircle size={12} />
        Quiz
      </button>
      
      {/* Start Button */}
      <button
        onClick={onStart}
        style={{
          padding: "8px 14px",
          borderRadius: 6,
          border: "none",
          background: C.accent,
          color: "white",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <Play size={12} />
        Iniciar
      </button>
      
      {/* Badge */}
      <div style={{
        padding: "4px 8px",
        borderRadius: 6,
        background: typeInfo.color + "20",
        color: typeInfo.color,
        fontSize: 11,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
      }}>
        {typeInfo.icon}
        {typeInfo.text}
      </div>
      
      {/* Info Button with Tooltip */}
      <div style={{ position: "relative" }}>
        <button
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => setShowTooltip(!showTooltip)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.panel,
            color: C.textSecondary,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Info size={14} />
        </button>
        
        {/* Tooltip */}
        {showTooltip && (
          <div style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 8,
            background: C.panel,
            border: `1px solid ${C.border}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 100,
            width: 220,
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>
              Por que esta sugestão?
            </div>
            <div style={{ color: C.textSecondary }}>
              {recommendation.reason_text}
            </div>
            {recommendation.meta?.days_overdue && (
              <div style={{ marginTop: 6, color: C.danger, fontSize: 11 }}>
                Atrasada há {recommendation.meta.days_overdue} dia(s)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


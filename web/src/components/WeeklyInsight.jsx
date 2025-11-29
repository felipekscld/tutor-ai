// web/src/components/WeeklyInsight.jsx
import { useState, useEffect } from "react";
import { generateWeeklyInsight, getLastInsight } from "../lib/weeklyInsightEngine";
import { loadSettings } from "../lib/settingsStore";
import { Sparkles, TrendingUp, TrendingDown, Lightbulb, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from "lucide-react";

export default function WeeklyInsight({ user }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(null);
  
  // Theme
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
    purple: "#8b5cf6",
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
    purple: "#a78bfa",
  };

  const C = darkMode ? C_DARK : C_LIGHT;

  // Load settings
  useEffect(() => {
    if (!user) return;
    loadSettings(user.uid).then((settings) => {
      setDarkMode(settings.theme === "dark");
    });
  }, [user]);

  // Load last insight
  useEffect(() => {
    if (!user) return;
    
    const load = async () => {
      try {
        const lastInsight = await getLastInsight(user.uid);
        setInsight(lastInsight);
      } catch (e) {
        console.error("Error loading insight:", e);
      } finally {
        setLoading(false);
      }
    };
    
    load();
  }, [user]);

  const handleGenerate = async () => {
    if (!user || generating) return;
    
    setGenerating(true);
    setError(null);
    setInsight(null); // Clear old insight while loading
    
    try {
      console.log("🔄 Generating new insight...");
      // Always force refresh to get new insight with updated prompt
      const newInsight = await generateWeeklyInsight(user.uid, true);
      console.log("✓ New insight received:", newInsight);
      
      // Force state update with new object reference
      setInsight({ ...newInsight, _timestamp: Date.now() });
      setExpanded(true);
    } catch (e) {
      console.error("Error generating insight:", e);
      setError("Não foi possível gerar o insight. Verifique se o Firebase está rodando.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return null; // Don't show anything while loading
  }

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.purple}15 0%, ${C.accent}15 100%)`,
      border: `1px solid ${C.purple}40`,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 24,
    }}>
      {/* Header - Always visible */}
      <div 
        onClick={() => insight && setExpanded(!expanded)}
        style={{
          padding: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: insight ? "pointer" : "default",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${C.purple} 0%, ${C.accent} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Sparkles size={20} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              Insight Semanal
            </div>
            {insight && (
              <div style={{ fontSize: 12, color: C.textSecondary }}>
                {new Date(insight.generatedAt).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
              </div>
            )}
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!insight ? (
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: C.purple,
                color: "white",
                cursor: generating ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? (
                <>
                  <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Gerar Insight
                </>
              )}
            </button>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerate();
                }}
                disabled={generating}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  color: C.textSecondary,
                  cursor: generating ? "not-allowed" : "pointer",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <RefreshCw size={12} style={generating ? { animation: "spin 1s linear infinite" } : {}} />
                {generating ? "Gerando..." : "Atualizar"}
              </button>
              {expanded ? <ChevronUp size={20} color={C.textSecondary} /> : <ChevronDown size={20} color={C.textSecondary} />}
            </>
          )}
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <div style={{
          padding: "12px 20px",
          background: C.danger + "20",
          borderTop: `1px solid ${C.danger}40`,
          color: C.danger,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      
      {/* Content - Expanded */}
      {insight && expanded && (
        <div style={{
          padding: "0 20px 20px 20px",
          borderTop: `1px solid ${C.border}`,
        }}>
          {/* Summary */}
          <div style={{
            padding: 16,
            background: C.panel,
            borderRadius: 12,
            marginTop: 16,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 15, lineHeight: 1.6 }}>
              {insight.summary}
            </div>
          </div>
          
          {/* Grid: Strengths & Weaknesses */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}>
            {/* Strengths */}
            <div style={{
              padding: 16,
              background: C.success + "15",
              border: `1px solid ${C.success}40`,
              borderRadius: 12,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                fontWeight: 600,
                color: C.success,
              }}>
                <TrendingUp size={16} />
                Pontos Fortes
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                {(insight.strengths || []).map((s, i) => (
                  <li key={i} style={{ fontSize: 13 }}>{s}</li>
                ))}
              </ul>
            </div>
            
            {/* Weaknesses */}
            <div style={{
              padding: 16,
              background: C.warning + "15",
              border: `1px solid ${C.warning}40`,
              borderRadius: 12,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                fontWeight: 600,
                color: C.warning,
              }}>
                <TrendingDown size={16} />
                A Melhorar
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                {(insight.weaknesses || []).map((w, i) => (
                  <li key={i} style={{ fontSize: 13 }}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
          
          {/* Recommendations */}
          <div style={{
            padding: 16,
            background: C.accent + "15",
            border: `1px solid ${C.accent}40`,
            borderRadius: 12,
            marginBottom: 16,
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              fontWeight: 600,
              color: C.accent,
            }}>
              <Lightbulb size={16} />
              Recomendações
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(insight.recommendations || []).map((r, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 13,
                }}>
                  <CheckCircle2 size={16} color={C.accent} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
          
        </div>
      )}
      
      {/* Collapsed preview */}
      {insight && !expanded && (
        <div style={{
          padding: "0 20px 16px 20px",
        }}>
          <div style={{
            fontSize: 13,
            color: C.textSecondary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {insight.summary}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}


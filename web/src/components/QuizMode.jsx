// web/src/components/QuizMode.jsx
import { useState, useEffect } from "react";
import { loadSettings } from "../lib/settingsStore";
import { 
  generateQuizPrompt, 
  parseQuizResponse, 
  saveQuizResult, 
  getTopicQuizHistory,
  calculateNextDifficulty,
  completeQuizSession,
} from "../lib/quizEngine";
import { ArrowLeft, CheckCircle2, XCircle, Lightbulb, ChevronRight, Trophy, Target, Zap, RefreshCw } from "lucide-react";

const QUESTIONS_PER_SESSION = 5;

export default function QuizMode({ user, subject, topic, taskType = "theory", onBack, onComplete }) {
  // Quiz state
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [sessionResults, setSessionResults] = useState([]);
  const [quizComplete, setQuizComplete] = useState(false);
  const [sessionSummary, setSessionSummary] = useState(null);
  
  // Loading state
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  
  // Difficulty
  const [currentDifficulty, setCurrentDifficulty] = useState("easy");
  const [history, setHistory] = useState([]);
  
  // Theme
  const [darkMode, setDarkMode] = useState(false);
  
  const C_LIGHT = {
    bg: "#f8fafc",
    panel: "#ffffff",
    panel2: "#f1f5f9",
    border: "#d1d5db",
    text: "#111827",
    textSecondary: "#64748b",
    accent: "#2563eb",
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
    textSecondary: "#a1a1aa",
    accent: "#3b82f6",
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

  // Load history and generate first question
  useEffect(() => {
    if (!user || !subject || !topic) return;
    
    const init = async () => {
      try {
        const quizHistory = await getTopicQuizHistory(user.uid, subject, topic);
        setHistory(quizHistory);
        
        const initialDifficulty = calculateNextDifficulty(quizHistory, "easy");
        setCurrentDifficulty(initialDifficulty);
        
        await generateNextQuestion(initialDifficulty, quizHistory);
      } catch (e) {
        console.error("Error initializing quiz:", e);
        setError("Erro ao iniciar quiz. Tente novamente.");
      } finally {
        setLoading(false);
      }
    };
    
    init();
  }, [user, subject, topic]);

  // Generate next question using AI
  const generateNextQuestion = async (difficulty, historyData = history, qNumber = questionNumber, sessionQuestionsData = sessionResults) => {
    setGenerating(true);
    setError(null);
    
    try {
      // Combine history with current session questions to avoid repetition
      const sessionQuestionsSummaries = sessionQuestionsData.map(r => ({
        correct: r.correct,
        question_summary: r.question?.substring(0, 100) || r.question_summary || ""
      }));
      const combinedHistory = [...sessionQuestionsSummaries, ...historyData];
      
      const prompt = generateQuizPrompt(subject, topic, difficulty, combinedHistory, taskType, qNumber);
      const endpoint = import.meta.env.VITE_TUTOR_ENDPOINT || "http://localhost:5001/tutor-ia-8a2fa/us-central1/tutorChat";
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          context: { type: "quiz_generation" },
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate question");
      }
      
      // Handle SSE response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.delta) {
                fullResponse += parsed.delta;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
      
      const result = parseQuizResponse(fullResponse);
      
      if (result.success) {
        setCurrentQuestion(result.quiz);
      } else {
        throw new Error(result.error || "Failed to parse quiz");
      }
    } catch (e) {
      console.error("Error generating question:", e);
      setError("Erro ao gerar questão. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  // Handle answer selection
  const handleSelectAnswer = (answerId) => {
    if (showResult) return;
    setSelectedAnswer(answerId);
  };

  // Handle answer confirmation
  const handleConfirmAnswer = async () => {
    if (!selectedAnswer || !currentQuestion) return;
    
    const isCorrect = selectedAnswer === currentQuestion.correct_answer;
    setShowResult(true);
    
    // Save result
    const result = await saveQuizResult(
      user.uid,
      subject,
      topic,
      currentQuestion,
      selectedAnswer,
      isCorrect,
      currentDifficulty
    );
    
    // Update session results
    const newResults = [...sessionResults, { ...result, correct: isCorrect }];
    setSessionResults(newResults);
    
    // Update history for next difficulty calculation
    setHistory([{ correct: isCorrect, question_summary: currentQuestion.question.substring(0, 100) }, ...history]);
  };

  // Handle next question or finish
  const handleNext = async () => {
    if (questionNumber >= QUESTIONS_PER_SESSION) {
      // Quiz complete
      const summary = await completeQuizSession(user.uid, sessionResults);
      setSessionSummary(summary);
      setQuizComplete(true);
      onComplete?.(summary);
    } else {
      // Next question
      const lastResult = sessionResults[sessionResults.length - 1];
      const newDifficulty = calculateNextDifficulty(
        [{ correct: lastResult?.correct }, ...history],
        currentDifficulty
      );
      
      const nextQuestionNumber = questionNumber + 1;
      setCurrentDifficulty(newDifficulty);
      setQuestionNumber(nextQuestionNumber);
      setSelectedAnswer(null);
      setShowResult(false);
      setShowExplanation(false);
      setCurrentQuestion(null);
      
      await generateNextQuestion(newDifficulty, history, nextQuestionNumber, sessionResults);
    }
  };

  // Restart quiz
  const handleRestart = () => {
    setQuestionNumber(1);
    setSessionResults([]);
    setQuizComplete(false);
    setSessionSummary(null);
    setSelectedAnswer(null);
    setShowResult(false);
    setShowExplanation(false);
    setCurrentDifficulty("easy");
    generateNextQuestion("easy");
  };

  // Get difficulty badge color
  const getDifficultyColor = (diff) => {
    if (diff === "easy") return C.success;
    if (diff === "hard") return C.danger;
    return C.warning;
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
        background: C.bg,
        color: C.text,
        fontFamily: "Inter, sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <RefreshCw size={32} style={{ animation: "spin 1s linear infinite", marginBottom: 16 }} />
          <div>Preparando quiz...</div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Quiz complete screen
  if (quizComplete && sessionSummary) {
    return (
      <div style={{
        position: "fixed",
        inset: 0,
        background: C.bg,
        color: C.text,
        fontFamily: "Inter, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}>
        <div style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: 40,
          maxWidth: 500,
          width: "100%",
          textAlign: "center",
        }}>
          {/* Trophy icon */}
          <div style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: sessionSummary.isPerfect 
              ? `linear-gradient(135deg, ${C.warning} 0%, #f59e0b 100%)`
              : `linear-gradient(135deg, ${C.accent} 0%, #3b82f6 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}>
            <Trophy size={40} color="white" />
          </div>
          
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Quiz Concluído!
          </h2>
          
          <p style={{ fontSize: 16, color: C.textSecondary, marginBottom: 32 }}>
            {subject} - {topic}
          </p>
          
          {/* Score */}
          <div style={{
            fontSize: 64,
            fontWeight: 800,
            color: sessionSummary.accuracy >= 80 ? C.success : sessionSummary.accuracy >= 50 ? C.warning : C.danger,
            marginBottom: 8,
          }}>
            {sessionSummary.accuracy}%
          </div>
          
          <div style={{ fontSize: 16, color: C.textSecondary, marginBottom: 32 }}>
            {sessionSummary.correctCount} de {sessionSummary.totalCount} questões corretas
          </div>
          
          {/* Perfect badge */}
          {sessionSummary.isPerfect && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              borderRadius: 12,
              background: C.warning + "20",
              color: C.warning,
              fontWeight: 600,
              marginBottom: 32,
            }}>
              <Zap size={20} />
              Perfeito! +25 XP bônus
            </div>
          )}
          
          {/* Actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={onBack}
              style={{
                padding: "14px 28px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.panel2,
                color: C.text,
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Voltar
            </button>
            
            <button
              onClick={handleRestart}
              style={{
                padding: "14px 28px",
                borderRadius: 10,
                border: "none",
                background: C.accent,
                color: "white",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <RefreshCw size={18} />
              Novo Quiz
            </button>
          </div>
        </div>
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
            Sair
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{subject}</div>
            <div style={{ fontSize: 13, color: C.textSecondary }}>{topic}</div>
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Difficulty badge */}
          <div style={{
            padding: "6px 12px",
            borderRadius: 6,
            background: getDifficultyColor(currentDifficulty) + "20",
            color: getDifficultyColor(currentDifficulty),
            fontSize: 12,
            fontWeight: 600,
            textTransform: "capitalize",
          }}>
            {currentDifficulty === "easy" ? "Fácil" : currentDifficulty === "hard" ? "Difícil" : "Médio"}
          </div>
          
          {/* Progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Target size={18} color={C.textSecondary} />
            <span style={{ fontWeight: 600 }}>
              {questionNumber}/{QUESTIONS_PER_SESSION}
            </span>
          </div>
        </div>
      </div>
      
      {/* Progress bar */}
      <div style={{
        height: 4,
        background: C.border,
      }}>
        <div style={{
          height: "100%",
          width: `${(questionNumber / QUESTIONS_PER_SESSION) * 100}%`,
          background: C.accent,
          transition: "width 0.3s ease",
        }} />
      </div>
      
      {/* Content */}
      <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
        {error && (
          <div style={{
            padding: 16,
            background: C.danger + "20",
            border: `1px solid ${C.danger}`,
            borderRadius: 12,
            color: C.danger,
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span>{error}</span>
            <button
              onClick={() => generateNextQuestion(currentDifficulty)}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: C.danger,
                color: "white",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}
        
        {generating ? (
          <div style={{
            textAlign: "center",
            padding: 60,
          }}>
            <RefreshCw size={32} color={C.accent} style={{ animation: "spin 1s linear infinite", marginBottom: 16 }} />
            <div style={{ fontSize: 16, color: C.textSecondary }}>
              Gerando questão...
            </div>
          </div>
        ) : currentQuestion ? (
          <>
            {/* Question */}
            <div style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 12 }}>
                Questão {questionNumber}
              </div>
              <div style={{ fontSize: 18, lineHeight: 1.6 }}>
                {currentQuestion.question}
              </div>
            </div>
            
            {/* Alternatives */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              {currentQuestion.alternatives.map((alt) => {
                const isSelected = selectedAnswer === alt.id;
                const isCorrect = alt.id === currentQuestion.correct_answer;
                const showCorrect = showResult && isCorrect;
                const showIncorrect = showResult && isSelected && !isCorrect;
                
                let bgColor = C.panel;
                let borderColor = C.border;
                
                if (isSelected && !showResult) {
                  bgColor = C.accent + "15";
                  borderColor = C.accent;
                }
                if (showCorrect) {
                  bgColor = C.success + "15";
                  borderColor = C.success;
                }
                if (showIncorrect) {
                  bgColor = C.danger + "15";
                  borderColor = C.danger;
                }
                
                return (
                  <button
                    key={alt.id}
                    onClick={() => handleSelectAnswer(alt.id)}
                    disabled={showResult}
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      border: `2px solid ${borderColor}`,
                      background: bgColor,
                      color: C.text,
                      cursor: showResult ? "default" : "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: showCorrect ? C.success : showIncorrect ? C.danger : isSelected ? C.accent : C.panel2,
                      color: showCorrect || showIncorrect || isSelected ? "white" : C.text,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {showCorrect ? <CheckCircle2 size={18} /> : showIncorrect ? <XCircle size={18} /> : alt.id}
                    </div>
                    <div style={{ fontSize: 15, lineHeight: 1.5, paddingTop: 4 }}>
                      {alt.text}
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Result feedback */}
            {showResult && (
              <div style={{
                background: selectedAnswer === currentQuestion.correct_answer ? C.success + "15" : C.danger + "15",
                border: `1px solid ${selectedAnswer === currentQuestion.correct_answer ? C.success : C.danger}`,
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: showExplanation ? 16 : 0,
                }}>
                  {selectedAnswer === currentQuestion.correct_answer ? (
                    <>
                      <CheckCircle2 size={24} color={C.success} />
                      <span style={{ fontWeight: 600, color: C.success, fontSize: 16 }}>
                        Correto! +{currentDifficulty === "easy" ? 5 : currentDifficulty === "hard" ? 15 : 10} XP
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle size={24} color={C.danger} />
                      <span style={{ fontWeight: 600, color: C.danger, fontSize: 16 }}>
                        Incorreto
                      </span>
                    </>
                  )}
                  
                  {!showExplanation && (
                    <button
                      onClick={() => setShowExplanation(true)}
                      style={{
                        marginLeft: "auto",
                        padding: "8px 14px",
                        borderRadius: 6,
                        border: "none",
                        background: C.panel,
                        color: C.text,
                        cursor: "pointer",
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Lightbulb size={14} />
                      Ver explicação
                    </button>
                  )}
                </div>
                
                {showExplanation && (
                  <div style={{
                    padding: 16,
                    background: C.panel,
                    borderRadius: 8,
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                      <Lightbulb size={16} color={C.warning} />
                      Explicação
                    </div>
                    {currentQuestion.explanation}
                  </div>
                )}
              </div>
            )}
            
            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              {!showResult ? (
                <button
                  onClick={handleConfirmAnswer}
                  disabled={!selectedAnswer}
                  style={{
                    padding: "14px 28px",
                    borderRadius: 10,
                    border: "none",
                    background: selectedAnswer ? C.accent : C.border,
                    color: selectedAnswer ? "white" : C.textSecondary,
                    cursor: selectedAnswer ? "pointer" : "not-allowed",
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  Confirmar Resposta
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  style={{
                    padding: "14px 28px",
                    borderRadius: 10,
                    border: "none",
                    background: C.accent,
                    color: "white",
                    cursor: "pointer",
                    fontSize: 15,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {questionNumber >= QUESTIONS_PER_SESSION ? "Ver Resultado" : "Próxima Questão"}
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
      
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


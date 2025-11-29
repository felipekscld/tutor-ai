// web/src/components/PomodoroTimer.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { loadSettings } from "../lib/settingsStore";
import { savePomodoroSession, getPomodoroStats, POMODORO_MODES, TIMER_STATES } from "../lib/pomodoroStore";
import { Play, Pause, SkipForward, RotateCcw, Coffee, Brain, Settings, Volume2, VolumeX, Check } from "lucide-react";

export default function PomodoroTimer({ user, currentTask, onComplete, colors: C }) {
  // Timer state
  const [mode, setMode] = useState("CLASSIC");
  const [timerState, setTimerState] = useState(TIMER_STATES.IDLE);
  const [timeLeft, setTimeLeft] = useState(POMODORO_MODES.CLASSIC.focus * 60);
  const [currentCycle, setCurrentCycle] = useState(0);
  const [completedCycles, setCompletedCycles] = useState(0);
  const [totalFocusMinutes, setTotalFocusMinutes] = useState(0);
  const [interruptions, setInterruptions] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  
  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [todayStats, setTodayStats] = useState(null);
  
  // Refs
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  
  const modeConfig = POMODORO_MODES[mode];
  
  // Load today's stats
  useEffect(() => {
    if (!user) return;
    
    getPomodoroStats(user.uid, "today").then(setTodayStats);
  }, [user, completedCycles]);
  
  // Timer logic
  useEffect(() => {
    if (timerState === TIMER_STATES.FOCUS || 
        timerState === TIMER_STATES.SHORT_BREAK || 
        timerState === TIMER_STATES.LONG_BREAK) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timerState]);
  
  // Play notification sound
  const playSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [soundEnabled]);
  
  // Handle timer completion
  const handleTimerComplete = useCallback(() => {
    clearInterval(timerRef.current);
    playSound();
    
    if (timerState === TIMER_STATES.FOCUS) {
      // Focus session complete
      const newCompletedCycles = completedCycles + 1;
      setCompletedCycles(newCompletedCycles);
      setTotalFocusMinutes(prev => prev + modeConfig.focus);
      setCurrentCycle(prev => prev + 1);
      
      // Determine next break type
      if (newCompletedCycles % modeConfig.cyclesForLong === 0) {
        setTimerState(TIMER_STATES.LONG_BREAK);
        setTimeLeft(modeConfig.longBreak * 60);
      } else {
        setTimerState(TIMER_STATES.SHORT_BREAK);
        setTimeLeft(modeConfig.shortBreak * 60);
      }
    } else {
      // Break complete, start new focus
      setTimerState(TIMER_STATES.IDLE);
      setTimeLeft(modeConfig.focus * 60);
    }
  }, [timerState, completedCycles, modeConfig, playSound]);
  
  // Start timer
  const handleStart = () => {
    if (timerState === TIMER_STATES.IDLE) {
      setSessionStartedAt(new Date().toISOString());
    }
    setTimerState(TIMER_STATES.FOCUS);
  };
  
  // Pause timer
  const handlePause = () => {
    if (timerState === TIMER_STATES.FOCUS) {
      setInterruptions(prev => prev + 1);
    }
    setTimerState(TIMER_STATES.PAUSED);
  };
  
  // Resume timer
  const handleResume = () => {
    // Resume to whatever state was before pause
    if (timeLeft > 0) {
      // Determine state based on time left and cycle
      if (currentCycle === completedCycles) {
        setTimerState(TIMER_STATES.FOCUS);
      } else {
        // We were in a break
        const isLongBreak = completedCycles % modeConfig.cyclesForLong === 0;
        setTimerState(isLongBreak ? TIMER_STATES.LONG_BREAK : TIMER_STATES.SHORT_BREAK);
      }
    }
  };
  
  // Skip current phase
  const handleSkip = () => {
    handleTimerComplete();
  };
  
  // Reset everything
  const handleReset = async () => {
    clearInterval(timerRef.current);
    
    // Save session if there was any progress
    if (completedCycles > 0 && user) {
      await savePomodoroSession(user.uid, {
        mode,
        focusDuration: modeConfig.focus,
        completedCycles,
        totalFocusMinutes,
        interruptions,
        taskSubject: currentTask?.subject,
        taskTopic: currentTask?.topic,
        startedAt: sessionStartedAt,
      });
      
      onComplete?.({
        completedCycles,
        totalFocusMinutes,
      });
    }
    
    setTimerState(TIMER_STATES.IDLE);
    setTimeLeft(modeConfig.focus * 60);
    setCurrentCycle(0);
    setCompletedCycles(0);
    setTotalFocusMinutes(0);
    setInterruptions(0);
    setSessionStartedAt(null);
  };
  
  // Change mode
  const handleModeChange = (newMode) => {
    if (timerState !== TIMER_STATES.IDLE) return;
    setMode(newMode);
    setTimeLeft(POMODORO_MODES[newMode].focus * 60);
  };
  
  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };
  
  // Calculate progress
  const getProgress = () => {
    let totalSeconds;
    if (timerState === TIMER_STATES.FOCUS || timerState === TIMER_STATES.IDLE || timerState === TIMER_STATES.PAUSED) {
      totalSeconds = modeConfig.focus * 60;
    } else if (timerState === TIMER_STATES.LONG_BREAK) {
      totalSeconds = modeConfig.longBreak * 60;
    } else {
      totalSeconds = modeConfig.shortBreak * 60;
    }
    return ((totalSeconds - timeLeft) / totalSeconds) * 100;
  };
  
  // Get state color
  const getStateColor = () => {
    if (timerState === TIMER_STATES.FOCUS) return C.danger;
    if (timerState === TIMER_STATES.SHORT_BREAK || timerState === TIMER_STATES.LONG_BREAK) return C.success;
    return C.accent;
  };
  
  // Get state label
  const getStateLabel = () => {
    switch (timerState) {
      case TIMER_STATES.FOCUS: return "Foco";
      case TIMER_STATES.SHORT_BREAK: return "Pausa Curta";
      case TIMER_STATES.LONG_BREAK: return "Pausa Longa";
      case TIMER_STATES.PAUSED: return "Pausado";
      default: return "Pronto";
    }
  };
  
  const isRunning = timerState === TIMER_STATES.FOCUS || 
                    timerState === TIMER_STATES.SHORT_BREAK || 
                    timerState === TIMER_STATES.LONG_BREAK;
  
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Brain size={20} color={C.accent} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>Pomodoro Timer</span>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              padding: 8,
              borderRadius: 6,
              border: "none",
              background: C.panel2,
              color: C.textSecondary,
              cursor: "pointer",
            }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: 8,
              borderRadius: 6,
              border: "none",
              background: C.panel2,
              color: C.textSecondary,
              cursor: "pointer",
            }}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
      
      {/* Mode selector */}
      {showSettings && timerState === TIMER_STATES.IDLE && (
        <div style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          padding: 12,
          background: C.panel2,
          borderRadius: 10,
        }}>
          {Object.entries(POMODORO_MODES).map(([key, config]) => (
            <button
              key={key}
              onClick={() => handleModeChange(key)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 8,
                border: mode === key ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                background: mode === key ? C.accent + "15" : C.panel,
                color: C.text,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {key === "CLASSIC" ? "Clássico" : key === "DEEP_WORK" ? "Deep Work" : "Curto"}
              </div>
              <div style={{ color: C.textSecondary, marginTop: 4 }}>
                {config.focus}/{config.shortBreak} min
              </div>
            </button>
          ))}
        </div>
      )}
      
      {/* Current task */}
      {currentTask && (
        <div style={{
          padding: "10px 14px",
          background: C.panel2,
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 13,
        }}>
          <span style={{ color: C.textSecondary }}>Estudando: </span>
          <span style={{ fontWeight: 600 }}>{currentTask.subject} - {currentTask.topic}</span>
        </div>
      )}
      
      {/* Timer display */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        {/* Circular progress */}
        <div style={{
          position: "relative",
          width: 200,
          height: 200,
          margin: "0 auto 16px",
        }}>
          <svg width="200" height="200" style={{ transform: "rotate(-90deg)" }}>
            {/* Background circle */}
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke={C.border}
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke={getStateColor()}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={565.48}
              strokeDashoffset={565.48 * (1 - getProgress() / 100)}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          
          {/* Timer text */}
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              fontSize: 48,
              fontWeight: 700,
              fontFamily: "monospace",
              color: C.text,
            }}>
              {formatTime(timeLeft)}
            </div>
            <div style={{
              fontSize: 14,
              color: getStateColor(),
              fontWeight: 600,
              marginTop: 4,
            }}>
              {getStateLabel()}
            </div>
          </div>
        </div>
        
        {/* Cycle indicators */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          marginBottom: 20,
        }}>
          {Array.from({ length: modeConfig.cyclesForLong }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: i < completedCycles % modeConfig.cyclesForLong || 
                           (completedCycles > 0 && completedCycles % modeConfig.cyclesForLong === 0 && i === 0)
                  ? C.success 
                  : C.border,
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>
        
        {/* Controls */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
        }}>
          {!isRunning && timerState !== TIMER_STATES.PAUSED && (
            <button
              onClick={handleStart}
              style={{
                padding: "14px 32px",
                borderRadius: 12,
                border: "none",
                background: C.accent,
                color: "white",
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Play size={20} />
              Iniciar
            </button>
          )}
          
          {isRunning && (
            <button
              onClick={handlePause}
              style={{
                padding: "14px 24px",
                borderRadius: 12,
                border: "none",
                background: C.warning,
                color: "white",
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Pause size={20} />
              Pausar
            </button>
          )}
          
          {timerState === TIMER_STATES.PAUSED && (
            <button
              onClick={handleResume}
              style={{
                padding: "14px 24px",
                borderRadius: 12,
                border: "none",
                background: C.success,
                color: "white",
                cursor: "pointer",
                fontSize: 16,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Play size={20} />
              Continuar
            </button>
          )}
          
          {(isRunning || timerState === TIMER_STATES.PAUSED) && (
            <>
              <button
                onClick={handleSkip}
                style={{
                  padding: "14px 20px",
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: C.panel2,
                  color: C.text,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <SkipForward size={18} />
                Pular
              </button>
              
              <button
                onClick={handleReset}
                style={{
                  padding: "14px 20px",
                  borderRadius: 12,
                  border: `1px solid ${C.danger}`,
                  background: "transparent",
                  color: C.danger,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RotateCcw size={18} />
                Encerrar
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Session stats */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
        padding: 16,
        background: C.panel2,
        borderRadius: 12,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.accent }}>
            {completedCycles}
          </div>
          <div style={{ fontSize: 12, color: C.textSecondary }}>Ciclos</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.success }}>
            {totalFocusMinutes}
          </div>
          <div style={{ fontSize: 12, color: C.textSecondary }}>Min. Foco</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.warning }}>
            {todayStats?.total_cycles || 0}
          </div>
          <div style={{ fontSize: 12, color: C.textSecondary }}>Hoje</div>
        </div>
      </div>
      
      {/* Break message */}
      {(timerState === TIMER_STATES.SHORT_BREAK || timerState === TIMER_STATES.LONG_BREAK) && (
        <div style={{
          marginTop: 16,
          padding: 16,
          background: C.success + "15",
          borderRadius: 12,
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}>
          <Coffee size={20} color={C.success} />
          <span style={{ color: C.success, fontWeight: 600 }}>
            {timerState === TIMER_STATES.LONG_BREAK 
              ? "Pausa longa! Levante, alongue, hidrate-se." 
              : "Pausa rápida! Respire fundo."}
          </span>
        </div>
      )}
      
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleV0oDYFtmsLs2a9rLhuEeafM7e+yeTMig3++0vX1zZNIJIN3zOD59+CmTyOEeevl+PXpw2UzhG36+Pf278p6QG57//347fPRgkt5d//9+e/34Ipad3P//fnv+OKGVIBz//358/rojlyIc//9+fX47Ypaj3X//fn1+O6OXpJ2//359fjwkWKVeP/9+fb58JZkmHn//fn3+fOaZpx7//35+Pn1nGqefP/9+vj59p9soH7//fr5+viibaKA//76+vr7pXCkg//++/r7+6dypob//vv7+/upda" type="audio/wav" />
      </audio>
    </div>
  );
}


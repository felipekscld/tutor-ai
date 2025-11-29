// web/src/components/ActivityHeatmap.jsx
import { useState, useEffect, useMemo } from "react";
import { getActivityHeatmapData } from "../lib/activityLog";
import { loadSettings } from "../lib/settingsStore";
import { Calendar, Clock } from "lucide-react";

export default function ActivityHeatmap({ user }) {
  const [activityData, setActivityData] = useState({});
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Theme
  const [darkMode, setDarkMode] = useState(false);
  
  const C_LIGHT = {
    bg: "#f8fafc",
    panel: "#ffffff",
    panel2: "#f1f5f9",
    border: "#d1d5db",
    text: "#111827",
    textSecondary: "#64748b",
    level0: "#ebedf0",
    level1: "#9be9a8",
    level2: "#40c463",
    level3: "#30a14e",
    level4: "#216e39",
    future: "#f3f4f6",
  };
  
  const C_DARK = {
    bg: "#18181b",
    panel: "#27272a",
    panel2: "#1f2125",
    border: "#3f3f46",
    text: "#f4f4f5",
    textSecondary: "#a1a1aa",
    level0: "#2d333b",
    level1: "#0e4429",
    level2: "#006d32",
    level3: "#26a641",
    level4: "#39d353",
    future: "#1f1f23",
  };

  const C = darkMode ? C_DARK : C_LIGHT;

  // Load settings
  useEffect(() => {
    if (!user) return;
    loadSettings(user.uid).then((settings) => {
      setDarkMode(settings.theme === "dark");
    });
  }, [user]);

  // Load activity data
  useEffect(() => {
    if (!user) return;
    
    const load = async () => {
      try {
        const data = await getActivityHeatmapData(user.uid);
        setActivityData(data);
      } catch (e) {
        console.error("Error loading heatmap data:", e);
      } finally {
        setLoading(false);
      }
    };
    
    load();
  }, [user]);

  // Generate fixed calendar for the current year
  const { weeks, monthLabels, totalMinutes, totalDays } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const today = now.toISOString().split('T')[0];
    
    // Start from January 1st of current year
    const startDate = new Date(currentYear, 0, 1);
    // End on December 31st
    const endDate = new Date(currentYear, 11, 31);
    
    const weeks = [];
    const monthLabels = [];
    let currentWeek = [];
    let totalMinutes = 0;
    let totalDays = 0;
    let lastMonth = -1;
    
    // Pad first week with empty days before Jan 1
    const firstDayOfWeek = startDate.getDay();
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null);
    }
    
    // Iterate through every day of the year
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const month = currentDate.getMonth();
      const dayOfWeek = currentDate.getDay();
      const isFuture = dateStr > today;
      
      const dayData = activityData[dateStr] || { minutes: 0, tasks: 0 };
      
      // Track month labels (at start of each month's first week)
      if (month !== lastMonth && dayOfWeek === 0) {
        monthLabels.push({
          weekIndex: weeks.length,
          label: currentDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        });
        lastMonth = month;
      } else if (month !== lastMonth && weeks.length === 0 && currentWeek.length === firstDayOfWeek) {
        // First month of year
        monthLabels.push({
          weekIndex: 0,
          label: currentDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        });
        lastMonth = month;
      }
      
      currentWeek.push({
        date: dateStr,
        dayOfWeek,
        month,
        minutes: dayData.minutes,
        tasks: dayData.tasks,
        isFuture,
        isToday: dateStr === today,
        display: currentDate.toLocaleDateString("pt-BR", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
      });
      
      if (!isFuture && dayData.minutes > 0) {
        totalMinutes += dayData.minutes;
        totalDays++;
      }
      
      // New week on Saturday
      if (dayOfWeek === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Push remaining days
    if (currentWeek.length > 0) {
      // Pad end of last week
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }
    
    return { weeks, monthLabels, totalMinutes, totalDays };
  }, [activityData]);

  // Get color based on minutes studied
  const getColor = (day) => {
    if (!day) return "transparent";
    if (day.isFuture) return C.future;
    if (day.minutes === 0) return C.level0;
    if (day.minutes <= 30) return C.level1;
    if (day.minutes <= 60) return C.level2;
    if (day.minutes <= 120) return C.level3;
    return C.level4;
  };

  const handleMouseEnter = (day, event) => {
    if (!day || day.isFuture) return;
    const rect = event.target.getBoundingClientRect();
    setHoveredDay(day);
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
  };

  if (loading) {
    return null;
  }

  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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
          <Calendar size={20} color={C.text} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>Sua Atividade {new Date().getFullYear()}</span>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: C.textSecondary }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={14} />
            <span>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}min estudados</span>
          </div>
          <span>•</span>
          <span>{totalDays} dias ativos</span>
        </div>
      </div>
      
      {/* Heatmap Grid */}
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        {/* Month labels */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(12, 1fr)`,
          marginLeft: 36,
          marginBottom: 8,
        }}>
          {MONTHS.map((month, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: C.textSecondary,
              }}
            >
              {month}
            </div>
          ))}
        </div>
        
        <div style={{ display: "flex", gap: 3 }}>
          {/* Day of week labels */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            marginRight: 8,
            fontSize: 10,
            color: C.textSecondary,
          }}>
            <div style={{ height: 11 }}>Dom</div>
            <div style={{ height: 11 }}>Seg</div>
            <div style={{ height: 11 }}>Ter</div>
            <div style={{ height: 11 }}>Qua</div>
            <div style={{ height: 11 }}>Qui</div>
            <div style={{ height: 11 }}>Sex</div>
            <div style={{ height: 11 }}>Sáb</div>
          </div>
          
          {/* Weeks grid */}
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  onMouseEnter={(e) => handleMouseEnter(day, e)}
                  onMouseLeave={() => setHoveredDay(null)}
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 2,
                    background: getColor(day),
                    cursor: day && !day.isFuture ? "pointer" : "default",
                    border: day?.isToday ? `2px solid ${C.text}` : "none",
                    boxSizing: "border-box",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        marginTop: 16,
        fontSize: 11,
        color: C.textSecondary,
      }}>
        <span>Menos</span>
        <div style={{ display: "flex", gap: 3 }}>
          {[C.level0, C.level1, C.level2, C.level3, C.level4].map((color, i) => (
            <div
              key={i}
              style={{
                width: 11,
                height: 11,
                borderRadius: 2,
                background: color,
              }}
            />
          ))}
        </div>
        <span>Mais</span>
      </div>
      
      {/* Tooltip */}
      {hoveredDay && (
        <div
          style={{
            position: "fixed",
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            transform: "translate(-50%, -100%)",
            background: darkMode ? "#000" : C.text,
            color: darkMode ? C.text : "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12,
            zIndex: 1000,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {hoveredDay.display}
          </div>
          <div>
            {hoveredDay.minutes > 0 ? (
              <>
                {hoveredDay.minutes} min • {hoveredDay.tasks} {hoveredDay.tasks === 1 ? "tarefa" : "tarefas"}
              </>
            ) : (
              "Nenhum estudo"
            )}
          </div>
        </div>
      )}
    </div>
  );
}

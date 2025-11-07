// web/src/components/SubjectChat.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useTutorStream } from "../hooks/useTutorStream";
import { marked } from "marked";
import { loadSettings, updateTheme } from "../lib/settingsStore";
import { loadSubjectContext, buildSubjectPrompt } from "../lib/tutorContext";
import { createSubjectSession, loadSubjectHistory, updateSubjectSession } from "../lib/subjectChat";
import { db } from "../firebase";
import {
  collection, getDocs, orderBy, query, limit, deleteDoc, doc,
} from "firebase/firestore";
import { ArrowLeft, Plus, Sun, Moon, Clock, LogOut } from "lucide-react";

export default function SubjectChat({ user, subject, onBack, onLogout }) {
  const { send, cancel, loading, error } = useTutorStream();

  // ========= chat state =========
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [streamBuf, setStreamBuf] = useState("");

  // ========= sidebar =========
  const [showSidebar, setShowSidebar] = useState(true);
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [search, setSearch] = useState("");

  // ========= theme =========
  const C_LIGHT = {
    bg: "#f8fafc",
    panel: "#ffffff",
    panel2: "#f1f5f9",
    border: "#d1d5db",
    user: "#e0f2fe",
    bot: "#f9fafb",
    text: "#111827",
    accent: "#2563eb",
    highlight: "#bfdbfe",
  };
  const C_DARK = {
    bg: "#18181b",
    panel: "#27272a",
    panel2: "#1f2125",
    border: "#3f3f46",
    user: "#2a2d35",
    bot: "#18181b",
    text: "#f4f4f5",
    accent: "#3b82f6",
    highlight: "#3f3f46",
  };

  const [darkMode, setDarkMode] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const C = darkMode ? C_DARK : C_LIGHT;

  // Load settings from Firestore
  useEffect(() => {
    if (!user) return;
    
    loadSettings(user.uid).then((settings) => {
      setDarkMode(settings.theme === "dark");
      setSettingsLoaded(true);
    });
  }, [user]);

  useEffect(() => {
    if (!settingsLoaded) return;
    
    if (user) {
      updateTheme(user.uid, darkMode ? "dark" : "light");
    }
    
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
  }, [darkMode, settingsLoaded]); // eslint-disable-line

  const userId = user?.uid;

  // ========= user context =========
  const [userContext, setUserContext] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState("");

  // Load subject-specific context
  useEffect(() => {
    if (!user || !subject) return;
    
    loadSubjectContext(user.uid, subject).then((context) => {
      setUserContext(context);
      if (context) {
        setSystemPrompt(buildSubjectPrompt(context));
        console.log(`🎯 Loaded context for ${subject}:`, context);
      }
    });
  }, [user, subject]);

  // ========= refs =========
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // ========= auto-scroll =========
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, streamBuf, loading]);

  // ========= auto-resize textarea =========
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(220, ta.scrollHeight) + "px";
  }, [input]);

  // ========= load history =========
  async function loadHistory() {
    if (!userId || !subject) return;
    
    try {
      setLoadingHistory(true);
      const sessions = await loadSubjectHistory(userId, subject);
      setHistory(sessions);
    } catch (err) {
      console.error("Falha ao carregar histórico:", err);
    } finally {
      setLoadingHistory(false);
    }
  }
  
  useEffect(() => { 
    if (userId && subject) loadHistory(); 
  }, [userId, subject]); // eslint-disable-line

  // ========= helpers =========
  function titleFromConversation(conversation) {
    if (conversation.title) {
      return conversation.title;
    }
    
    const msgs = conversation.messages;
    if (!Array.isArray(msgs) || !msgs.length) return "Nova Conversa";
    const firstUser = msgs.find((m) => m.role === "user");
    const base = firstUser?.content || msgs[0]?.content || "Conversa";
    return base.length > 38 ? base.slice(0, 38) + "…" : base;
  }

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => {
      const title = titleFromConversation(h).toLowerCase();
      const body = Array.isArray(h.messages)
        ? h.messages.map((m) => (m.content || "").toLowerCase()).join(" ")
        : "";
      return title.includes(q) || body.includes(q);
    });
  }, [history, search]);

  // ========= send =========
  async function handleSend(e) {
    e?.preventDefault?.();
    const prompt = input.trim();
    if (!prompt || loading) return;

    const userMsg = { role: "user", content: prompt };
    const historyMsgs = [...messages, userMsg];

    setMessages(historyMsgs);
    setInput("");
    setStreamBuf("");

    let acc = "";
    let streamError = null;
    
    try {
      await send({
        systemPrompt,
        messages: historyMsgs,
        onDelta: (t) => {
          acc += t;
          setStreamBuf((s) => s + t);
        },
      });
    } catch (err) {
      console.error("Erro enviando para o tutor:", err);
      streamError = err;
      
      const errorMsg = {
        role: "assistant",
        content: `❌ **Erro ao conectar com o tutor**\n\nNão foi possível obter uma resposta no momento. Por favor, tente novamente.\n\n_Detalhes: ${err.message || "Erro desconhecido"}_`,
      };
      setMessages((prev) => [...prev, errorMsg]);
      setStreamBuf("");
      return;
    }

    if (!acc || acc.trim() === "") {
      const errorMsg = {
        role: "assistant",
        content: `⚠️ **Resposta vazia**\n\nO tutor não retornou uma resposta. Isso pode acontecer devido a filtros de segurança ou problemas temporários.\n\nPor favor, tente reformular sua pergunta.`,
      };
      setMessages((prev) => [...prev, errorMsg]);
      setStreamBuf("");
      return;
    }

    const finalMessages = [...historyMsgs, { role: "assistant", content: acc }];

    try {
      let conversationId;
      
      if (activeId) {
        await updateSubjectSession(userId, subject, activeId, finalMessages);
        conversationId = activeId;
      } else {
        conversationId = await createSubjectSession(userId, subject);
        await updateSubjectSession(userId, subject, conversationId, finalMessages);
        setActiveId(conversationId);
      }
      
      loadHistory();
    } catch (err) {
      console.error("Falha ao salvar conversa no Firestore:", err);
    }

    setMessages((prev) => [...prev, { role: "assistant", content: acc }]);
    setStreamBuf("");
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  // ========= new chat =========
  function handleNewChat() {
    setActiveId(null);
    setMessages([]);
    setStreamBuf("");
    setInput("");
  }

  // ========= delete conversation =========
  async function handleDeleteConversation(id) {
    if (!userId) return;
    
    try {
      const subjectSlug = subject.toLowerCase().replace(/\s+/g, "_");
      await deleteDoc(doc(db, "users", userId, "chats", subjectSlug, "sessions", id));
      setHistory((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
        setStreamBuf("");
      }
    } catch (err) {
      console.error("Erro ao deletar conversa:", err);
      alert("Não foi possível deletar a conversa.");
    }
  }

  // ========= layout =========
  const layout = {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100vh",
    boxSizing: "border-box",
    background: C.bg,
    color: C.text,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    display: "grid",
    gridTemplateColumns: showSidebar ? "320px 1fr" : "1fr",
    gap: 16,
    padding: 12,
  };

  const sidebarStyle = {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 12,
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto auto 1fr",
    gap: 10,
    minWidth: 0,
  };

  const chatColumn = {
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: 12,
    minWidth: 0,
    minHeight: 0,
  };

  const header = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderRadius: 12,
    background: C.panel,
    border: `1px solid ${C.border}`,
  };

  const board = {
    overflowY: "auto",
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 0,
  };

  const row = (isUser) => ({
    display: "flex",
    width: "100%",
    justifyContent: isUser ? "flex-end" : "flex-start",
  });

  const bubble = (isUser) => ({
    maxWidth: "70%",
    background: isUser ? C.user : C.bot,
    border: `1px solid ${C.border}`,
    color: C.text,
    padding: "12px 14px",
    borderRadius: 18,
    lineHeight: 1.5,
    boxShadow: "0 4px 14px rgba(0,0,0,.08)",
    textAlign: "left",
  });

  const disabledSendBg = darkMode ? "#3f3f46" : "#e5e7eb";
  const disabledSendText = darkMode ? "#a1a1aa" : "#9ca3af";
  const deleteStyles = darkMode
    ? { bg: "#3c1f1f", border: C.border, text: "#fca5a5" }
    : { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" };

  const inputBar = {
    display: "flex",
    gap: 10,
    alignItems: "flex-end",
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    background: C.panel,
    padding: 10,
  };

  return (
    <div style={layout}>
      {/* ======== Sidebar ======== */}
      {showSidebar && (
        <aside style={sidebarStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700 }}>Histórico</div>
            <button
              onClick={loadHistory}
              disabled={loadingHistory}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.panel2,
                color: C.text,
                cursor: "pointer",
              }}
            >
              {loadingHistory ? "Atualizando…" : "Atualizar"}
            </button>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no histórico…"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: C.panel2,
              color: C.text,
              outline: "none",
            }}
          />

          <div style={{
            overflowY: "auto",
            display: "grid",
            gap: 8,
            paddingRight: 4,
            gridAutoRows: "max-content",
            alignContent: "start",
          }}>
            {filteredHistory.length ? (
              filteredHistory.map((h) => {
                const title = titleFromConversation(h);
                const isActive = h.id === activeId;
                const when =
                  h.createdAt && h.createdAt.toDate
                    ? h.createdAt.toDate().toLocaleString()
                    : "—";
                return (
                  <div
                    key={h.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: 8,
                      background: isActive ? C.highlight : C.panel2,
                      border: `1px solid ${isActive ? C.accent : C.border}`,
                      borderRadius: 10,
                    }}
                  >
                    <button
                      onClick={() => {
                        setActiveId(h.id);
                        setMessages(Array.isArray(h.messages) ? h.messages : []);
                        setStreamBuf("");
                      }}
                      style={{
                        textAlign: "left",
                        width: "100%",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        color: C.text,
                        cursor: "pointer",
                      }}
                      title={when}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{when}</div>
                    </button>

                    <button
                      onClick={() => handleDeleteConversation(h.id)}
                      title="Excluir conversa"
                      style={{
                        marginRight: 8,
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: `1px solid ${deleteStyles.border}`,
                        background: deleteStyles.bg,
                        color: deleteStyles.text,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            ) : (
              <div style={{ opacity: 0.7, fontSize: 14 }}>
                {search ? "Nenhum resultado." : "Nenhuma conversa ainda."}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ======== Chat column ======== */}
      <section style={chatColumn}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: C.accent,
              display: "grid",
              placeItems: "center",
              color: "white",
              fontWeight: 700,
              fontSize: 18,
            }}>
              {subject[0]}
            </div>
            <div>
              <div style={{ fontWeight: 700 }}>{subject}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Tutor especializado
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {onBack && (
              <button
                onClick={onBack}
                title="Voltar"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  background: C.accent,
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            )}
            
            <button
              onClick={handleNewChat}
              title="Iniciar nova conversa"
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.accent,
                color: "white",
                cursor: "pointer",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Plus size={16} />
              Nova
            </button>

            <button
              onClick={() => setDarkMode((v) => !v)}
              title={darkMode ? "Modo claro" : "Modo escuro"}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.panel2,
                color: C.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <button
              onClick={() => setShowSidebar((v) => !v)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.panel2,
                color: C.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Clock size={16} />
            </button>

            <button
              onClick={onLogout}
              title="Sair"
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.panel2,
                color: C.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div ref={listRef} style={board}>
          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div key={i} style={row(isUser)}>
                <div style={bubble(isUser)}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6, userSelect: "none" }}>
                    {isUser ? "Você" : `Tutor de ${subject}`}
                  </div>
                  {m.role === "assistant" ? (
                    <div dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={row(false)}>
              <div style={bubble(false)}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6, userSelect: "none" }}>
                  Tutor está digitando…
                </div>
                <div dangerouslySetInnerHTML={{ __html: marked.parse(streamBuf || "…") }} />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} style={inputBar}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte algo… (Enter para enviar)"
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              overflow: "hidden",
              padding: 12,
              borderRadius: 10,
              border: "1px solid " + C.border,
              background: C.panel2,
              color: C.text,
              lineHeight: 1.45,
            }}
          />
          {loading && (
            <button
              type="button"
              onClick={cancel}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.panel2,
                color: C.text,
                cursor: "pointer",
              }}
            >
              Parar
            </button>
          )}
          <button
            disabled={loading || !input.trim()}
            type="submit"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: input.trim() ? C.accent : disabledSendBg,
              color: input.trim() ? "white" : disabledSendText,
              cursor: input.trim() ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
            title="Enviar (Enter)"
          >
            Enviar
          </button>
        </form>

        {error && (
          <pre style={{
            color: darkMode ? "#fca5a5" : "crimson",
            whiteSpace: "pre-wrap",
            background: C.panel2,
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${C.border}`,
          }}>
            {error}
          </pre>
        )}
      </section>
    </div>
  );
}


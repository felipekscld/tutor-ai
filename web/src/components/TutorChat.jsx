// web/src/components/TutorChat.jsx
import { useState } from "react";
import { useTutorStream } from "../hooks/useTutorStream";
import { marked } from "marked";

export default function TutorChat() {
  const { send, cancel, loading, error } = useTutorStream();
  const [input, setInput] = useState("Planeje 25 minutos de estudo de matemática hoje.");
  const [messages, setMessages] = useState([]); 
  const [streamBuf, setStreamBuf] = useState("");

  async function handleSend(e) {
    e?.preventDefault?.();
    const prompt = input.trim();
    if (!prompt) return;

    const userMsg = { role: "user", content: prompt };
    const history = [...messages, userMsg];

    setMessages(history);  
    setInput("");           
    setStreamBuf("");       

    const systemPrompt = "You are Tutor-AI. Responda em PT-BR, curto e prático.";

    
    let acc = "";

    await send({
      systemPrompt,
      messages: history, 
      onDelta: (t) => {
        acc += t;                   
        setStreamBuf((s) => s + t); 
      },
    });

    
    setMessages((prev) => [...prev, { role: "assistant", content: acc }]);
    setStreamBuf("");
  }

  return (
    <div style={{ maxWidth: 720, margin: "24px auto", fontFamily: "system-ui, sans-serif" }}>
      <h2>Tutor-AI (Local)</h2>

      {/* Input */}
      <form onSubmit={handleSend} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte algo…"
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #444",
            background: "#222",
            color: "#fff",
          }}
        />
        <button disabled={loading} type="submit" style={{ padding: "10px 14px" }}>
          {loading ? "Sending…" : "Send"}
        </button>
        {loading && (
          <button type="button" onClick={cancel} style={{ padding: "10px 14px" }}>
            Stop
          </button>
        )}
      </form>

      {error && (
        <pre style={{ color: "crimson", whiteSpace: "pre-wrap", marginTop: 12 }}>
          {error}
        </pre>
      )}

      {/* Transcript */}
      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "end" : "start",
              background: m.role === "user" ? "#10243e" : "#0b1220",
              color: "white",
              padding: "10px 12px",
              borderRadius: 10,
              maxWidth: "80%",
            }}
          >
            <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>
              {m.role === "user" ? "You" : "Assistant"}
            </div>

            {m.role === "assistant" ? (
              <div
                style={{ whiteSpace: "normal" }}
                
                dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }}
              />
            ) : (
              <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
            )}
          </div>
        ))}

        {/* Live streaming bubble */}
        {loading && (
          <div
            style={{
              alignSelf: "start",
              background: "#0b1220",
              color: "white",
              padding: "10px 12px",
              borderRadius: 10,
              maxWidth: "80%",
            }}
          >
            <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>Assistant</div>
            <div
              
              dangerouslySetInnerHTML={{ __html: marked.parse(streamBuf || "…") }}
            />
          </div>
        )}
      </div>
    </div>
  );
}


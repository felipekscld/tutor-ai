// web/src/lib/tutorSSE.js
export async function* streamTutor({ endpoint, body, signal }) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text || "No body"}`);
  }

  const ct = res.headers.get("content-type") || "";

  if (ct.includes("text/event-stream")) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trimEnd();
        buffer = buffer.slice(nl + 1);
        if (!line || !line.startsWith("data:")) continue;

        const dataStr = line.slice(5).trim();
        if (!dataStr) continue;
        if (dataStr === "[DONE]") return;

        try {
          const obj = JSON.parse(dataStr);
          if (obj.error) {
            throw new Error(typeof obj.error === "string" ? obj.error : JSON.stringify(obj.error));
          }
          const token = obj.delta ?? obj.text ?? obj.content ?? obj.output ?? "";
          if (token) yield token;
          
        } catch {
          
        }
      }
    }
    return;
  }

  
  const txt = await res.text();
  try {
    const obj = JSON.parse(txt);
    if (obj.error) throw new Error(typeof obj.error === "string" ? obj.error : JSON.stringify(obj.error));
    const token = obj.delta ?? obj.text ?? obj.content ?? obj.output ?? "";
    if (token) { yield token; return; }
    throw new Error("Non-SSE response without text");
  } catch {
    throw new Error(`Non-JSON response: ${txt.slice(0, 200)}`);
  }
}

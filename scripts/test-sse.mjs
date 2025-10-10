//   node scripts/test-sse.mjs

const endpoint =
  process.env.TUTOR_ENDPOINT ||
  process.argv[2] ||
  "http://127.0.0.1:5001/tutor-ia-8a2fa/us-central1/tutorChat";

// === Customize your prompt here if you want ===
const payload = {
  systemPrompt: "You are Tutor-AI. Responda em PT-BR, curto e prático.",
  messages: [{ role: "user", content: "Planeje 25 minutos de estudo de matemática hoje." }],
};

async function main() {
  console.log("POST ->", endpoint);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("HTTP error:", res.status, res.statusText);
    if (text) console.error(text);
    process.exit(1);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream")) {
    // Some proxies still stream with a generic content-type; don't hard fail,
    // but warn so you know what's happening.
    console.warn("Warning: content-type is not text/event-stream ->", ct);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let receivedAnyToken = false;

  console.log("🔌 Connected. Streaming tokens...\n");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Normalize CRLF to LF to simplify parsing
    buffer = buffer.replace(/\r\n/g, "\n");

    // Read line-by-line; keep remainder for next chunk
    let nlIdx;
    while ((nlIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nlIdx).trimEnd();
      buffer = buffer.slice(nlIdx + 1);

      if (!line) continue; // skip blank/keep-alive lines

      if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        if (!dataStr) continue;

        if (dataStr === "[DONE]") {
          console.log("\n\n✅ Done.");
          return;
        }

        try {
          const obj = JSON.parse(dataStr);

          // Your Cloud Function emits { delta: "..." } for token chunks.
          // Fall back to common fields if needed.
          const token =
            obj.delta ??
            obj.text ??
            obj.content ??
            obj.output ??
            "";

          if (typeof token === "string" && token.length > 0) {
            receivedAnyToken = true;
            // Write tokens as they arrive (no newline)
            process.stdout.write(token);
          } else {
            // Rare non-text payloads; print for debugging without breaking the stream
            if (obj.error) {
              console.error("\n[error]", obj.error);
            } else {
              console.log("\n[raw]", obj);
            }
          }
        } catch {
          // Partial JSON or heartbeat—ignore silently
        }
      }
      // Ignore other SSE fields like "event:"—your server doesn't send them.
    }
  }

  if (!receivedAnyToken) {
    console.warn("\nℹ️ Stream ended without tokens. Check server logs and API key.");
  } else {
    console.log("\n\nℹ️ Stream closed by server.");
  }
}

main().catch((err) => {
  console.error("Client error:", err?.stack || err?.message || err);
  process.exit(1);
});

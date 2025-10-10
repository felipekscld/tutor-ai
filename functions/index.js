// functions/index.js

// ------------------------------
// 1) Load environment variables (prefer functions/.env.local)
// ------------------------------
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const localEnvPath = path.resolve(__dirname, ".env.local");
const envPath = fs.existsSync(localEnvPath)
  ? localEnvPath
  : path.resolve(__dirname, ".env");

dotenv.config({ path: envPath });

// ------------------------------
// 2) Imports
// ------------------------------
const functions = require("firebase-functions");
const cors = require("cors");
// Node 18+ includes global fetch

const corsHandler = cors({ origin: true });

// ------------------------------
// 3) Config
// ------------------------------
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent`;
const API_KEY = process.env.GEMINI_API_KEY;

const DEFAULT_SYSTEM_PROMPT =
  process.env.DEFAULT_SYSTEM_PROMPT ||
  "You are Tutor-AI. Responda em PT-BR, de forma clara, curta e prática. Use passos numerados quando ajudar.";

const GEN_TEMPERATURE = Number(process.env.GEN_TEMPERATURE ?? 0.4);
const GEN_TOP_P = Number(process.env.GEN_TOP_P ?? 0.9);
const GEN_TOP_K = Number(process.env.GEN_TOP_K ?? 40);
const GEN_MAX_TOKENS = Number(process.env.GEN_MAX_TOKENS ?? 512);

// ------------------------------
// Helpers
// ------------------------------
function extractTextFromCandidate(candidate) {
  let out = "";
  const parts = candidate?.content?.parts;
  if (Array.isArray(parts)) {
    for (const p of parts) if (p?.text) out += p.text;
  }
  return out;
}

function streamDelta(res, text) {
  if (text) res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
}

function endStream(res, hb) {
  try {
    res.write("data: [DONE]\n\n");
  } catch {}
  clearInterval(hb);
  res.end();
}

// ------------------------------
// 4) HTTPS Function
// ------------------------------
exports.tutorChat = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    if (!API_KEY) {
      res.status(500).json({ error: "Missing GEMINI_API_KEY in functions/.env.local" });
      return;
    }

    const { messages, systemPrompt } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "messages[] required" });
      return;
    }

    // Build contents
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content ?? "") }],
    }));

    const effectiveSystemPrompt =
      (systemPrompt && String(systemPrompt).trim()) || DEFAULT_SYSTEM_PROMPT;

    const body = {
      contents,
      systemInstruction: {
        role: "system",
        parts: [{ text: effectiveSystemPrompt }],
      },
      generationConfig: {
        temperature: GEN_TEMPERATURE,
        topP: GEN_TOP_P,
        topK: GEN_TOP_K,
        maxOutputTokens: GEN_MAX_TOKENS,
      },
    };

    // Downstream SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const heartbeat = setInterval(() => {
      try {
        res.write(":\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    try {
      const upstream = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream", // nudge streaming
          "x-goog-api-key": API_KEY,
        },
        body: JSON.stringify(body),
      });

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => "");
        res.write(`data: ${JSON.stringify({ error: errText || `HTTP ${upstream.status}` })}\n\n`);
        endStream(res, heartbeat);
        return;
      }

      const upstreamCT = upstream.headers.get("content-type") || "";

      // ---------- Expected SSE path ----------
      if (upstreamCT.includes("text/event-stream")) {
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          for (const rawLine of chunk.split("\n")) {
            const line = rawLine.trimEnd();
            if (!line || !line.startsWith("data:")) continue;

            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
              const json = JSON.parse(payload);
              const candidate = json?.candidates?.[0];

              // stream incremental text if present
              const delta = extractTextFromCandidate(candidate);
              if (delta) {
                streamDelta(res, delta);
              } else {
                // surface why there is no text
                const info = {
                  info: "no_text_chunk",
                  finishReason: candidate?.finishReason,
                  promptFeedback: json?.promptFeedback,
                  safety: candidate?.safetyRatings,
                  error: json?.error,
                };
                res.write(`data: ${JSON.stringify(info)}\n\n`);
              }
            } catch {
              // ignore partial JSON lines
            }
          }
        }

        endStream(res, heartbeat);
        return;
      }

      // ---------- Fallback: not SSE ----------
      const bodyText = await upstream.text().catch(() => "");

      // Handle NDJSON (newline-delimited objects)
      const maybeLines = bodyText.split(/\r?\n/).filter(Boolean);
      let parsed;
      if (maybeLines.length > 1) {
        // Try parse each line into an array of frames
        const frames = [];
        for (const line of maybeLines) {
          try {
            frames.push(JSON.parse(line));
          } catch {
            // ignore non-JSON lines
          }
        }
        if (frames.length) parsed = frames;
      }
      if (!parsed) {
        // Try parse as JSON (object or array)
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          // Non-JSON fallback
          res.write(`data: ${JSON.stringify({ info: "non_json_body", raw: bodyText })}\n\n`);
          endStream(res, heartbeat);
          return;
        }
      }

      let aggregated = "";

      // If array of frames, extract from each; else extract from single object
      if (Array.isArray(parsed)) {
        for (const obj of parsed) {
          const cand = obj?.candidates?.[0];
          aggregated += extractTextFromCandidate(cand);
        }
      } else {
        const cand = parsed?.candidates?.[0];
        aggregated += extractTextFromCandidate(cand);
      }

      if (aggregated) {
        // Stream as one chunk so client prints it
        streamDelta(res, aggregated);
      } else {
        // No text even after parsing; surface debug details
        const debugPayload = Array.isArray(parsed)
          ? { info: "non_sse_no_text_array", raw: parsed }
          : {
              info: "non_sse_no_text_object",
              modelVersion: parsed?.modelVersion,
              promptFeedback: parsed?.promptFeedback,
              safety: parsed?.candidates?.[0]?.safetyRatings,
              raw: parsed,
            };
        res.write(`data: ${JSON.stringify(debugPayload)}\n\n`);
      }

      endStream(res, heartbeat);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: String(e?.message || e) })}\n\n`);
      endStream(res, heartbeat);
    }
  });
});

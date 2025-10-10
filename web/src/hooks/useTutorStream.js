// web/src/hooks/useTutorStream.js
import { useRef, useState } from "react";
import { streamTutor } from "../lib/tutorSSE";

export function useTutorStream() {
  const endpoint = import.meta.env.VITE_TUTOR_ENDPOINT;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  async function send({ systemPrompt, messages, onDelta }) {
    setError(null);
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const body = { systemPrompt, messages };
      for await (const token of streamTutor({ endpoint, body, signal: ctrl.signal })) {
        onDelta?.(token);
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  return { send, cancel, loading, error };
}

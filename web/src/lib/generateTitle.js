// Generate a concise title for a conversation using Gemini API

export async function generateConversationTitle({ endpoint, messages }) {
  if (!messages || messages.length === 0) return "Nova Conversa";
  
  // Get first 2-3 exchanges for context
  const contextMessages = messages.slice(0, 6); // Up to 3 exchanges (user + assistant pairs)
  
  const titlePrompt = {
    systemPrompt: "Você é um assistente que gera títulos concisos para conversas educacionais. Gere um título curto (máximo 6 palavras) em português que capture o tema principal da conversa. Responda APENAS com o título, sem aspas ou explicações.",
    messages: [
      ...contextMessages,
      {
        role: "user",
        content: "Com base nesta conversa, gere um título curto e descritivo (máximo 6 palavras)."
      }
    ]
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(titlePrompt),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let titleText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let nlIndex;
      while ((nlIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nlIndex).trimEnd();
        buffer = buffer.slice(nlIndex + 1);

        if (!line || !line.startsWith("data:")) continue;

        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const obj = JSON.parse(payload);
          const token = obj.delta ?? obj.text ?? obj.content ?? "";
          if (token) titleText += token;
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Clean up the title
    const cleanTitle = titleText
      .trim()
      .replace(/^["']|["']$/g, "") // Remove quotes
      .replace(/\n/g, " ") // Remove newlines
      .slice(0, 60); // Max 60 chars

    return cleanTitle || "Nova Conversa";
  } catch (err) {
    console.error("Failed to generate title:", err);
    // Fallback to first user message
    const firstUserMsg = messages.find(m => m.role === "user");
    if (firstUserMsg?.content) {
      return firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "");
    }
    return "Nova Conversa";
  }
}


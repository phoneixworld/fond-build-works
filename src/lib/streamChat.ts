type MsgContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
type Msg = { role: "user" | "assistant"; content: MsgContent };

/**
 * Rough token estimator: ~4 chars per token for text, ~1000 tokens per image.
 */
function estimateTokens(content: MsgContent): number {
  if (typeof content === "string") return Math.ceil(content.length / 4);
  let tokens = 0;
  for (const part of content) {
    if (part.type === "text") tokens += Math.ceil(part.text.length / 4);
    else tokens += 1000; // image
  }
  return tokens;
}

/**
 * Trim messages to fit within a token budget.
 * Strategy: Always keep the first user message (project context) and the
 * most recent N messages. Summarize/drop middle messages.
 * If a single recent message is too large (huge HTML), truncate its text.
 */
export function trimToContextWindow(messages: Msg[], maxTokens: number = 100000): Msg[] {
  if (messages.length === 0) return messages;

  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (totalTokens <= maxTokens) return messages;

  // Always keep first message + last N messages that fit
  const first = messages[0];
  const firstTokens = estimateTokens(first.content);
  const summaryBudget = 200; // tokens for the trimmed-notice
  let budget = maxTokens - firstTokens - summaryBudget;

  // Walk backwards from the end, collecting messages that fit
  const kept: Msg[] = [];
  for (let i = messages.length - 1; i >= 1; i--) {
    const tokens = estimateTokens(messages[i].content);
    if (tokens <= budget) {
      kept.unshift(messages[i]);
      budget -= tokens;
    } else if (kept.length === 0) {
      // Must include at least the last message — truncate it
      const truncated = truncateContent(messages[i].content, budget);
      kept.unshift({ role: messages[i].role, content: truncated });
      budget = 0;
      break;
    } else {
      break;
    }
  }

  const droppedCount = messages.length - 1 - kept.length;
  if (droppedCount > 0) {
    const notice: Msg = {
      role: "assistant",
      content: `[Earlier ${droppedCount} message${droppedCount > 1 ? "s" : ""} trimmed to fit context window. The conversation continues from here.]`,
    };
    return [first, notice, ...kept];
  }

  return [first, ...kept];
}

function truncateContent(content: MsgContent, maxTokens: number): MsgContent {
  const maxChars = maxTokens * 4;
  if (typeof content === "string") {
    return content.slice(0, maxChars) + "\n...[truncated]";
  }
  // For multimodal, truncate text parts and drop images if needed
  const result: typeof content = [];
  let remaining = maxChars;
  for (const part of content) {
    if (part.type === "text") {
      if (remaining > 0) {
        result.push({ type: "text", text: part.text.slice(0, remaining) + (part.text.length > remaining ? "\n...[truncated]" : "") });
        remaining -= part.text.length;
      }
    } else if (part.type === "image_url" && remaining > 2000) {
      result.push(part);
      remaining -= 4000; // ~1000 tokens
    }
  }
  return result.length > 0 ? result : "...[truncated]";
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export async function streamChat({
  messages,
  projectId,
  techStack,
  schemas,
  model,
  designTheme,
  knowledge,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  projectId?: string;
  techStack?: string;
  schemas?: any[];
  model?: string;
  designTheme?: string;
  knowledge?: string[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  // Trim messages to fit context window before sending
  const trimmedMessages = trimToContextWindow(messages);

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages: trimmedMessages, project_id: projectId, tech_stack: techStack, schemas, model, design_theme: designTheme, knowledge }),
  });

  if (!resp.ok || !resp.body) {
    if (resp.status === 429) { onError("Rate limited. Try again shortly."); return; }
    if (resp.status === 402) { onError("Usage limit reached."); return; }
    onError("Failed to connect to AI.");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;

  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }

  onDone();
}

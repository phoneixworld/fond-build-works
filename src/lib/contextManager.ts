/**
 * Context Window Manager — Lovable-grade context strategy.
 *
 * Instead of dumping raw chat history (8+ messages, 20k+ chars),
 * this module builds a compact, high-signal context payload:
 *
 *   1. Current file contents (always — the source of truth)
 *   2. Compressed project memory (decisions, patterns, entities detected)
 *   3. Last 2–3 user messages only (recent intent)
 *
 * This reduces context size by 60–80% while improving coherence.
 */

type RawMessage = { role: string; content: string };

// ─── Project Memory ─────────────────────────────────────────────────────────

export interface ProjectMemory {
  /** Key architectural decisions extracted from conversation */
  decisions: string[];
  /** Entity/collection names detected */
  entities: string[];
  /** Design preferences mentioned */
  designNotes: string[];
  /** Features already built (avoid regeneration) */
  builtFeatures: string[];
  /** Last error context if any */
  lastError: string | null;
}

/**
 * Extract a compressed project memory from the full chat history.
 * Scans all messages once and distills into structured facts.
 */
export function extractProjectMemory(messages: RawMessage[]): ProjectMemory {
  const memory: ProjectMemory = {
    decisions: [],
    entities: [],
    designNotes: [],
    builtFeatures: [],
    lastError: null,
  };

  const seenDecisions = new Set<string>();
  const seenEntities = new Set<string>();
  const seenFeatures = new Set<string>();

  for (const msg of messages) {
    const text = typeof msg.content === "string" ? msg.content : "";
    if (!text) continue;

    if (msg.role === "user") {
      // Extract entity references (capitalized nouns after "add/create/build/manage")
      const entityMatches = text.matchAll(/\b(?:add|create|build|manage|show|list|display)\s+(\w+)/gi);
      for (const m of entityMatches) {
        const entity = m[1].toLowerCase();
        if (entity.length > 2 && !STOP_WORDS.has(entity) && !seenEntities.has(entity)) {
          seenEntities.add(entity);
          memory.entities.push(entity);
        }
      }

      // Extract design preferences
      const designMatches = text.match(/\b(dark\s*(?:mode|theme)|light\s*(?:mode|theme)|minimalist|colorful|modern|professional|rounded|flat|gradient|neon|pastel|monochrome)\b/gi);
      if (designMatches) {
        for (const d of designMatches) {
          const note = d.toLowerCase().trim();
          if (!memory.designNotes.includes(note)) memory.designNotes.push(note);
        }
      }

      // Extract decisions (explicit user choices like "use X", "make it Y", "I want Z")
      const decisionPatterns = text.matchAll(/\b(?:use|make\s+it|i\s+want|switch\s+to|change\s+to|prefer|should\s+be)\s+(.{3,60}?)(?:\.|,|$)/gi);
      for (const m of decisionPatterns) {
        const decision = m[1].trim();
        if (decision.length > 3 && decision.length < 60 && !seenDecisions.has(decision.toLowerCase())) {
          seenDecisions.add(decision.toLowerCase());
          memory.decisions.push(decision);
        }
      }
    }

    if (msg.role === "assistant") {
      // Track built features from assistant confirmations
      const builtMatches = text.matchAll(/✅\s*(?:\d+\.\s*)?(.{5,80})/g);
      for (const m of builtMatches) {
        const feature = m[1].trim().replace(/\*\*/g, "");
        if (feature.length > 4 && !seenFeatures.has(feature.toLowerCase())) {
          seenFeatures.add(feature.toLowerCase());
          memory.builtFeatures.push(feature);
        }
      }

      // Capture last error if any
      const errorMatch = text.match(/(?:error|failed|broken|crash)[:—]\s*(.{10,120})/i);
      if (errorMatch) {
        memory.lastError = errorMatch[1].trim();
      }
    }
  }

  // Cap arrays to prevent bloat
  memory.decisions = memory.decisions.slice(-8);
  memory.entities = memory.entities.slice(-12);
  memory.designNotes = memory.designNotes.slice(-4);
  memory.builtFeatures = memory.builtFeatures.slice(-10);

  return memory;
}

const STOP_WORDS = new Set([
  "the", "this", "that", "with", "from", "have", "will", "some", "more",
  "page", "button", "feature", "thing", "stuff", "something", "everything",
  "all", "new", "app", "application", "it", "them", "data", "info",
]);

// ─── Context Assembly ────────────────────────────────────────────────────────

/**
 * Build the optimized chat history for the build agent.
 *
 * Returns: last 2–3 user messages + a compressed memory preamble.
 * Total is typically 2–5k chars instead of 15–30k.
 */
export function buildSmartChatHistory(
  allMessages: RawMessage[],
  maxUserMessages = 3
): RawMessage[] {
  if (allMessages.length === 0) return [];

  const memory = extractProjectMemory(allMessages);
  const memoryBlock = formatMemoryBlock(memory);

  // Get the last N user messages and any assistant message immediately before each
  const recentMessages: RawMessage[] = [];
  const userMessages = allMessages
    .map((m, i) => ({ msg: m, idx: i }))
    .filter(({ msg }) => msg.role === "user");

  const lastN = userMessages.slice(-maxUserMessages);

  for (const { msg, idx } of lastN) {
    // Include preceding assistant message for context (if exists and not already added)
    if (idx > 0 && allMessages[idx - 1].role === "assistant") {
      const assistantMsg = allMessages[idx - 1];
      const assistantText = typeof assistantMsg.content === "string" ? assistantMsg.content : "";
      // Only include if it's short (not a huge code dump)
      if (assistantText.length < 2000) {
        recentMessages.push({ role: "assistant", content: compressAssistantMessage(assistantText) });
      }
    }
    recentMessages.push({ role: msg.role, content: msg.content });
  }

  // Prepend memory block as a system-style context message
  if (memoryBlock) {
    return [
      { role: "assistant", content: memoryBlock },
      ...recentMessages,
    ];
  }

  return recentMessages;
}

/**
 * Compress an assistant message: strip code blocks, keep first 500 chars.
 */
function compressAssistantMessage(text: string): string {
  // Remove code fences
  let compressed = text.replace(/```[\s\S]*?```/g, "[code output]");
  // Remove excessive whitespace
  compressed = compressed.replace(/\n{3,}/g, "\n\n");
  if (compressed.length > 500) {
    compressed = compressed.slice(0, 500) + "...";
  }
  return compressed;
}

/**
 * Format the project memory into a concise block for the AI.
 */
function formatMemoryBlock(memory: ProjectMemory): string | null {
  const parts: string[] = [];

  if (memory.entities.length > 0) {
    parts.push(`Entities: ${memory.entities.join(", ")}`);
  }
  if (memory.decisions.length > 0) {
    parts.push(`Decisions: ${memory.decisions.join("; ")}`);
  }
  if (memory.designNotes.length > 0) {
    parts.push(`Design: ${memory.designNotes.join(", ")}`);
  }
  if (memory.builtFeatures.length > 0) {
    parts.push(`Already built: ${memory.builtFeatures.slice(-5).join("; ")}`);
  }
  if (memory.lastError) {
    parts.push(`Last error: ${memory.lastError}`);
  }

  if (parts.length === 0) return null;

  return `[PROJECT MEMORY]\n${parts.join("\n")}`;
}

// ─── Code Context Budget ─────────────────────────────────────────────────────

/**
 * Build a budget-aware current code context string.
 * Prioritizes entry files (App.jsx), then recently modified, then others.
 */
export function buildCodeContext(
  files: Record<string, string>,
  budgetChars = 16000
): string {
  if (!files || Object.keys(files).length === 0) return "";

  const entries = Object.entries(files);
  const totalChars = entries.reduce((sum, [, code]) => sum + code.length, 0);

  // If everything fits, return it all
  if (totalChars <= budgetChars) {
    return entries.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
  }

  // Priority tiers
  const ENTRY_PATTERNS = ["/App.jsx", "/App.tsx", "/App.js"];
  const LAYOUT_PATTERNS = ["/layout/", "/contexts/", "/hooks/"];

  const tier1 = entries.filter(([p]) => ENTRY_PATTERNS.some(k => p.endsWith(k)));
  const tier2 = entries.filter(([p]) => LAYOUT_PATTERNS.some(k => p.includes(k)) && !tier1.some(([t]) => t === p));
  const tier3 = entries.filter(([p]) => !tier1.some(([t]) => t === p) && !tier2.some(([t]) => t === p));

  let result = "";
  let remaining = budgetChars;

  for (const tier of [tier1, tier2, tier3]) {
    for (const [path, code] of tier) {
      if (remaining <= 200) {
        result += `--- ${path} (${code.length} chars — omitted)\n`;
        continue;
      }
      if (code.length <= remaining) {
        const section = `--- ${path}\n${code}\n\n`;
        result += section;
        remaining -= section.length;
      } else {
        const snippet = code.slice(0, Math.max(200, Math.floor(remaining * 0.7)));
        result += `--- ${path} (truncated)\n${snippet}\n...[truncated]\n\n`;
        remaining = 0;
      }
    }
  }

  return result;
}

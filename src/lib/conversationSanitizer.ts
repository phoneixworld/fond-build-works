// src/lib/conversationSanitizer.ts

const DIAGNOSTIC_PREFIXES = [
  "❌",
  "⚠️",
  "Error:",
  "TypeError:",
  "ReferenceError:",
  "SyntaxError:",
  "Warning:",
  "at ",
];

const DIAGNOSTIC_KEYWORDS = [
  "stack trace",
  "runtime error",
  "missing page",
  "blank page",
  "these pages",
  "do not exist",
  "build failed",
  "compile error",
  "navigation link",
  "undefined component",
];

const META_PATTERNS = [
  /is the app complete/i,
  /is the application complete/i,
  /check if complete/i,
  /why is this broken/i,
  /what is wrong/i,
  /can you fix/i,
  /please fix/i,
  /it's not working/i,
  /it is not working/i,
  /fix this/i,
  // Phase 3: Filter meta-conversation Q&A (non-domain content)
  /what are your (?:qualities|capabilities|features|skills)/i,
  /how can you help/i,
  /what can you do/i,
  /tell me about yourself/i,
  /who are you/i,
  /introduce yourself/i,
  /what are you/i,
  /how do you work/i,
  /what do you know/i,
];

export function sanitizeRequirements(raw: string): string {
  if (!raw) return "";

  const lines = raw.split("\n");

  const cleaned = lines.filter((line) => {
    const t = line.trim();
    if (!t) return false;

    if (DIAGNOSTIC_PREFIXES.some((p) => t.startsWith(p))) return false;
    if (DIAGNOSTIC_KEYWORDS.some((k) => t.toLowerCase().includes(k))) return false;
    if (META_PATTERNS.some((re) => re.test(t))) return false;

    if (/^[-*]\s*(missing|blank|error|issue|bug)/i.test(t)) return false;

    return true;
  });

  return cleaned.join("\n").trim();
}

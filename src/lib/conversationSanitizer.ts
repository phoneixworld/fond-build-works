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

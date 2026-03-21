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
  "navigation link shows a blank page",
  "these pages do not exist",
  "missing page(s)",
  "runtime error",
  "build failed",
  "compile error",
];

const META_PATTERNS = [
  /is the app complete/i,
  /is the application complete/i,
  /check if complete app is done/i,
  /why is this broken/i,
  /what is wrong/i,
  /can you fix/i,
  /please fix/i,
  /it is not working/i,
  /it's not working/i,
];

export function sanitizeRequirements(raw: string): string {
  if (!raw) return "";

  const lines = raw.split("\n");

  const cleanedLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Drop obvious diagnostic lines
    if (DIAGNOSTIC_PREFIXES.some((p) => trimmed.startsWith(p))) return false;
    if (DIAGNOSTIC_KEYWORDS.some((k) => trimmed.toLowerCase().includes(k))) return false;

    // Drop meta / status questions
    if (META_PATTERNS.some((re) => re.test(trimmed))) return false;

    // Drop lines that look like error bullets
    if (/^[-*]\s*(missing|blank|error|issue|bug)/i.test(trimmed)) return false;

    return true;
  });

  return cleanedLines.join("\n").trim();
}

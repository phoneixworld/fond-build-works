/**
 * Structured Output Parser — enterprise-grade file extraction from AI output.
 *
 * Multi-strategy parser that handles:
 * 1. Standard ```react-preview fences with --- separators
 * 2. Alternative fence formats (```jsx, ```tsx, ```javascript)
 * 3. JSON-structured output as fallback
 * 4. Malformed/unclosed fences with recovery
 * 5. Dependency extraction from --- dependencies blocks
 *
 * This replaces regex-based parsing with a state-machine approach
 * for bulletproof file boundary detection.
 */

export interface ParseResult {
  chatText: string;
  files: Record<string, string> | null;
  deps: Record<string, string>;
  parseStrategy: "react-preview" | "alt-fence" | "json-structured" | "single-file" | "none";
}

// ─── State Machine Parser ─────────────────────────────────────────────────

type ParserState = "chat" | "in-fence" | "in-file" | "in-deps";

const FENCE_OPENERS = [
  "```react-preview",
  "```jsx-preview",
  "```react",
  "```jsx",
  "```tsx",
  "```javascript",
  "```typescript",
];

const FILE_SEPARATOR = /^-{3}\s+(\/?\w[\w/.\-]*\.(?:jsx?|tsx?|css|json))\s*(?:-{0,3})?\s*$/;
const DEPS_SEPARATOR = /^-{3}\s+\/?dependencies\s*$/i;
const FENCE_CLOSE = /^```\s*$/;

export function parseStructuredOutput(raw: string): ParseResult {
  // Strategy 1: Standard fence-based parsing (state machine)
  const fenceResult = parseFencedOutput(raw);
  if (fenceResult.files && Object.keys(fenceResult.files).length > 0) {
    return fenceResult;
  }

  // Strategy 2: JSON-structured output ({"files": {...}})
  const jsonResult = parseJsonOutput(raw);
  if (jsonResult.files && Object.keys(jsonResult.files).length > 0) {
    return jsonResult;
  }

  // Strategy 3: Single bare code block (no file separators)
  const singleResult = parseSingleCodeBlock(raw);
  if (singleResult.files && Object.keys(singleResult.files).length > 0) {
    return singleResult;
  }

  return { chatText: raw, files: null, deps: {}, parseStrategy: "none" };
}

function parseFencedOutput(raw: string): ParseResult {
  const lines = raw.split("\n");
  let state: ParserState = "chat";
  const chatLines: string[] = [];
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};
  let currentFile: string | null = null;
  let currentLines: string[] = [];
  let depsLines: string[] = [];
  let fenceDepth = 0;
  let strategy: ParseResult["parseStrategy"] = "none";

  function flushFile() {
    if (currentFile) {
      const code = currentLines.join("\n").trim();
      if (code.length > 0) {
        let fname = currentFile.startsWith("/") ? currentFile : `/${currentFile}`;
        fname = fname.replace(/^\/src\//, "/");
        // Enforce nested page structure
        const pageMatch = fname.match(/^\/pages\/([A-Z]\w+)\.(jsx?|tsx?)$/);
        if (pageMatch) {
          fname = `/pages/${pageMatch[1]}/${pageMatch[1]}.${pageMatch[2]}`;
        }
        files[fname] = code;
      }
    }
    currentFile = null;
    currentLines = [];
  }

  function flushDeps() {
    if (depsLines.length > 0) {
      try {
        const parsed = JSON.parse(depsLines.join("\n").trim());
        Object.assign(deps, parsed);
      } catch {
        // Try line-by-line: "package": "version"
        for (const line of depsLines) {
          const m = line.match(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/);
          if (m) deps[m[1]] = m[2];
        }
      }
      depsLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    switch (state) {
      case "chat": {
        // Check for fence opener
        const isFenceOpen = FENCE_OPENERS.some(f => trimmed.startsWith(f));
        if (isFenceOpen) {
          state = "in-fence";
          fenceDepth++;
          strategy = trimmed.startsWith("```react-preview") ? "react-preview" : "alt-fence";
          continue;
        }
        chatLines.push(line);
        break;
      }

      case "in-fence": {
        // Check for fence close
        if (FENCE_CLOSE.test(trimmed)) {
          flushFile();
          flushDeps();
          fenceDepth--;
          state = fenceDepth > 0 ? "in-fence" : "chat";
          continue;
        }

        // Check for dependencies separator
        if (DEPS_SEPARATOR.test(trimmed)) {
          flushFile();
          state = "in-deps";
          continue;
        }

        // Check for file separator
        const fileMatch = trimmed.match(FILE_SEPARATOR);
        if (fileMatch) {
          flushFile();
          currentFile = fileMatch[1];
          state = "in-file";
          continue;
        }

        // Content before first file separator — might be part of chat or loose code
        if (!currentFile) {
          // Check if this looks like code (imports, function declarations)
          if (trimmed.startsWith("import ") || trimmed.startsWith("export ") || trimmed.startsWith("function ")) {
            currentFile = "/App.jsx";
            currentLines.push(line);
            state = "in-file";
          }
        }
        break;
      }

      case "in-file": {
        if (FENCE_CLOSE.test(trimmed)) {
          flushFile();
          fenceDepth--;
          state = fenceDepth > 0 ? "in-fence" : "chat";
          continue;
        }

        if (DEPS_SEPARATOR.test(trimmed)) {
          flushFile();
          state = "in-deps";
          continue;
        }

        const fileMatch = trimmed.match(FILE_SEPARATOR);
        if (fileMatch) {
          flushFile();
          currentFile = fileMatch[1];
          continue;
        }

        currentLines.push(line);
        break;
      }

      case "in-deps": {
        if (FENCE_CLOSE.test(trimmed)) {
          flushDeps();
          fenceDepth--;
          state = fenceDepth > 0 ? "in-fence" : "chat";
          continue;
        }

        const fileMatch = trimmed.match(FILE_SEPARATOR);
        if (fileMatch) {
          flushDeps();
          currentFile = fileMatch[1];
          state = "in-file";
          continue;
        }

        depsLines.push(line);
        break;
      }
    }
  }

  // Handle unclosed fence (common with truncated responses)
  flushFile();
  flushDeps();

  return {
    chatText: chatLines.join("\n").trim(),
    files: Object.keys(files).length > 0 ? files : null,
    deps,
    parseStrategy: Object.keys(files).length > 0 ? strategy : "none",
  };
}

/**
 * Attempt to extract and repair JSON from potentially truncated response.
 */
function extractAndRepairJson(raw: string): unknown | null {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) return null;

  const startChar = cleaned[jsonStart];
  const endChar = startChar === '[' ? ']' : '}';
  const jsonEnd = cleaned.lastIndexOf(endChar);

  if (jsonEnd <= jsonStart) return null;
  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fix trailing commas and control characters
    cleaned = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, "");

    try {
      return JSON.parse(cleaned);
    } catch {
      // Try truncated array recovery: find last complete object
      const lastBrace = cleaned.lastIndexOf("}");
      if (lastBrace > 0 && startChar === '[') {
        try {
          return JSON.parse(cleaned.substring(0, lastBrace + 1) + "]");
        } catch { /* unrecoverable */ }
      }
      return null;
    }
  }
}

function parseJsonOutput(raw: string): ParseResult {
  // Look for JSON blocks: {"files": { "/App.jsx": "..." }}
  const jsonPatterns = [
    /```json\s*\n([\s\S]*?)\n```/,
    /\{[\s\S]*"files"\s*:\s*\{[\s\S]*\}\s*\}/,
  ];

  for (const pattern of jsonPatterns) {
    const match = raw.match(pattern);
    if (!match) continue;

    const jsonStr = match[1] || match[0];
    const parsed = extractAndRepairJson(jsonStr);
    if (parsed && typeof parsed === "object" && (parsed as any).files) {
      const files: Record<string, string> = {};
      for (const [path, content] of Object.entries((parsed as any).files)) {
        if (typeof content === "string") {
          const normalizedPath = path.startsWith("/") ? path : `/${path}`;
          files[normalizedPath] = content;
        }
      }
      if (Object.keys(files).length > 0) {
        return {
          chatText: raw.replace(match[0], "").trim(),
          files,
          deps: (parsed as any).dependencies || {},
          parseStrategy: "json-structured",
        };
      }
    }
  }

  return { chatText: raw, files: null, deps: {}, parseStrategy: "none" };
}

function parseSingleCodeBlock(raw: string): ParseResult {
  // Find any code block that contains JSX
  const codeBlockMatch = raw.match(/```(?:jsx?|tsx?|javascript|typescript)?\s*\n([\s\S]*?)\n```/);
  if (!codeBlockMatch) return { chatText: raw, files: null, deps: {}, parseStrategy: "none" };

  const code = codeBlockMatch[1].trim();
  if (code.length < 30) return { chatText: raw, files: null, deps: {}, parseStrategy: "none" };

  // Must look like React code
  if (!code.includes("import") && !code.includes("export") && !code.includes("function")) {
    return { chatText: raw, files: null, deps: {}, parseStrategy: "none" };
  }

  return {
    chatText: raw.replace(codeBlockMatch[0], "").trim(),
    files: { "/App.jsx": code },
    deps: {},
    parseStrategy: "single-file",
  };
}
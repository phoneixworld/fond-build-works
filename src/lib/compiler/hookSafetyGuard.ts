/**
 * Hook Safety Guard — prevents truncated/malformed data hooks from entering the workspace.
 *
 * 1. Dangling-const detector: rejects files with incomplete declarations
 * 2. Truncation-aware early-close: attempts to close incomplete hooks with a safe fallback
 * 3. Short-form hook generator: provides deterministic templates for data hooks
 */

// ─── Dangling Declaration Detector ──────────────────────────────────────────

const DANGLING_PATTERNS = [
  // `const X;` with no initializer (outside .d.ts)
  /\bconst\s+\w+\s*;/,
  // `const X =` at end of file or followed by nothing meaningful
  /\bconst\s+\w+\s*=\s*$/m,
  // `const { ... } =` at end of file
  /\bconst\s*\{[^}]*\}\s*=\s*$/m,
  // `return` at end of file with no value and no semicolon/brace after
  /\breturn\s*$/m,
  // Unclosed JSX — opening tag with no matching close at file end
  /<\w+[^/]*>\s*$/m,
];

export interface DanglingResult {
  hasDangling: boolean;
  pattern: string | null;
  line: number | null;
}

/**
 * Scans code for dangling/incomplete declarations.
 * Returns details about the first dangling pattern found.
 */
export function detectDanglingDeclarations(code: string, filePath: string): DanglingResult {
  // Skip .d.ts files — `const X;` is valid there
  if (filePath.endsWith(".d.ts")) return { hasDangling: false, pattern: null, line: null };

  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // `const X;` — missing initializer (but not `export const X;` in ambient)
    if (/^\s*(export\s+)?(const|let)\s+\w+\s*;\s*$/.test(line) && !filePath.endsWith(".d.ts")) {
      return { hasDangling: true, pattern: "const without initializer", line: i + 1 };
    }
  }

  // Check last meaningful line for trailing incomplete expressions
  const trimmedLines = lines.map(l => l.trim()).filter(l => l.length > 0);
  if (trimmedLines.length > 0) {
    const lastLine = trimmedLines[trimmedLines.length - 1];

    if (/\bconst\s+\w+\s*=\s*$/.test(lastLine)) {
      return { hasDangling: true, pattern: "const assignment truncated at EOF", line: lines.length };
    }
    if (/\bconst\s*\{[^}]*\}\s*=\s*$/.test(lastLine)) {
      return { hasDangling: true, pattern: "destructuring truncated at EOF", line: lines.length };
    }
    if (/^\s*return\s*$/.test(lastLine)) {
      return { hasDangling: true, pattern: "return with no value at EOF", line: lines.length };
    }
  }

  return { hasDangling: false, pattern: null, line: null };
}

// ─── Truncation-Aware Early Close ───────────────────────────────────────────

/**
 * Attempts to salvage a truncated data hook by:
 * 1. Detecting if it's a hook file (use*.ts/tsx in /hooks/)
 * 2. Counting open braces/parens
 * 3. Closing them with safe fallback returns
 */
export function attemptEarlyClose(code: string, filePath: string): string | null {
  // Only attempt for hook files
  if (!isDataHookPath(filePath)) return null;

  const dangling = detectDanglingDeclarations(code, filePath);
  if (!dangling.hasDangling) return null;

  // Try to close the function by:
  // 1. Remove the dangling line
  // 2. Close any open braces/parens
  // 3. Add a safe return + closing braces

  const lines = code.split("\n");

  // Find and remove the dangling line
  if (dangling.line !== null) {
    const idx = dangling.line - 1;
    if (idx >= 0 && idx < lines.length) {
      lines[idx] = ""; // Remove the broken line
    }
  }

  let result = lines.join("\n");

  // Count unmatched braces and parens
  let openBraces = 0;
  let openParens = 0;
  for (const ch of result) {
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "(") openParens++;
    if (ch === ")") openParens--;
  }

  // Close any unclosed structures
  if (openBraces > 0 || openParens > 0) {
    // Add safe return if we're inside a function body
    if (openBraces > 0) {
      result += "\n  return { data: [], loading: false, error: null };\n";
    }

    // Close parens first, then braces
    while (openParens > 0) { result += ")"; openParens--; }
    while (openBraces > 1) { result += "\n}"; openBraces--; }
    if (openBraces === 1) {
      result += "\n}\n";
    }

    // Ensure there's a default export if the function was cut off
    if (!result.includes("export default")) {
      const fnMatch = result.match(/(?:export\s+)?function\s+(\w+)/);
      if (fnMatch) {
        result += `\nexport default ${fnMatch[1]};\n`;
      }
    }

    return result;
  }

  return null;
}

// ─── Data Hook Template Generator ───────────────────────────────────────────

/**
 * Generates a short-form, truncation-safe data hook from a collection name.
 * Used as a fallback when the AI-generated hook is malformed.
 */
export function generateSafeDataHook(collectionName: string, hookName: string): string {
  const capitalName = collectionName.charAt(0).toUpperCase() + collectionName.slice(1);
  return `import { useState, useEffect } from "react";

interface ${capitalName}Item {
  id: string;
  name: string;
  [key: string]: unknown;
}

export default function ${hookName}() {
  const [data, setData] = useState<${capitalName}Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const projectId = (window as any).__PROJECT_ID__;
        const apiBase = (window as any).__SUPABASE_URL__;
        const apiKey = (window as any).__SUPABASE_KEY__;
        const res = await fetch(\`\${apiBase}/functions/v1/project-api\`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${apiKey}\` },
          body: JSON.stringify({ project_id: projectId, collection: "${collectionName}", action: "list" }),
        });
        const json = await res.json();
        setData(json.data || []);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { data, loading, error };
}
`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isDataHookPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return /\/hooks\/(data\/)?use\w+\.(ts|tsx)$/.test(normalized);
}

/**
 * Extracts a collection name from a hook filename.
 * e.g. "/hooks/data/useCourses.ts" → "courses"
 */
export function hookFileToCollectionName(filePath: string): string | null {
  const match = filePath.match(/use(\w+)\.(ts|tsx)$/);
  if (!match) return null;
  const name = match[1];
  // lowercase first letter
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Given extracted files from a task, detect and fix/replace broken data hooks.
 * Returns the repaired files map.
 */
export function repairBrokenDataHooks(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [path, code] of Object.entries(files)) {
    if (!isDataHookPath(path)) {
      result[path] = code;
      continue;
    }

    const dangling = detectDanglingDeclarations(code, path);
    if (!dangling.hasDangling) {
      result[path] = code;
      continue;
    }

    console.warn(`[HookSafety] Dangling declaration in ${path} at line ${dangling.line}: ${dangling.pattern}`);

    // Try early close first
    const closed = attemptEarlyClose(code, path);
    if (closed) {
      console.log(`[HookSafety] ✅ Early-closed ${path}`);
      result[path] = closed;
      continue;
    }

    // Fall back to template generation
    const collection = hookFileToCollectionName(path);
    const hookName = path.match(/\/(use\w+)\./)?.[1] || "useData";
    if (collection) {
      console.log(`[HookSafety] 🔄 Replaced ${path} with safe template (collection: ${collection})`);
      result[path] = generateSafeDataHook(collection, hookName);
    } else {
      result[path] = code; // Can't determine collection, keep as-is
    }
  }

  return result;
}

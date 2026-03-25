/**
 * Syntax Validator — Pre-commit parse gate
 * 
 * Validates generated files by parsing them with Babel before they enter
 * the workspace. Rejects unparseable files and provides diagnostic info
 * for per-file retry.
 */

import * as parser from "@babel/parser";

export interface ParseResult {
  path: string;
  valid: boolean;
  error?: string;
  errorLine?: number;
}

/**
 * Attempt to parse a single file. Returns parse result with error details.
 */
export function validateFileSyntax(path: string, code: string): ParseResult {
  // Skip non-JS/TS files
  if (!/\.(jsx?|tsx?|mjs|cjs)$/.test(path)) {
    return { path, valid: true };
  }

  // Skip very small files (likely just exports or type declarations)
  if (code.trim().length < 10) {
    return { path, valid: true };
  }

  // Skip CSS/JSON/SQL files that got misclassified
  if (code.trimStart().startsWith("{") && path.endsWith(".json")) {
    return { path, valid: true };
  }

  const isTS = /\.tsx?$/.test(path);
  const isJSX = /\.(jsx|tsx)$/.test(path);

  try {
    parser.parse(code, {
      sourceType: "module",
      plugins: [
        ...(isJSX ? ["jsx" as const] : []),
        ...(isTS ? ["typescript" as const] : []),
        "decorators-legacy" as const,
        "classProperties" as const,
        "optionalChaining" as const,
        "nullishCoalescingOperator" as const,
        "dynamicImport" as const,
      ],
      errorRecovery: false,
    });

    return { path, valid: true };
  } catch (err: any) {
    const line = err.loc?.line;
    const message = err.message?.split("\n")[0] || "Parse error";
    return {
      path,
      valid: false,
      error: message,
      errorLine: line,
    };
  }
}

/**
 * Validate all files in a record. Returns valid files and invalid file details.
 */
export function validateAllFiles(files: Record<string, string>): {
  valid: Record<string, string>;
  invalid: ParseResult[];
} {
  const valid: Record<string, string> = {};
  const invalid: ParseResult[] = [];

  for (const [path, code] of Object.entries(files)) {
    const result = validateFileSyntax(path, code);
    if (result.valid) {
      valid[path] = code;
    } else {
      invalid.push(result);
      console.warn(`[SyntaxValidator] ❌ ${path}: ${result.error}${result.errorLine ? ` (line ${result.errorLine})` : ""}`);
    }
  }

  return { valid, invalid };
}

/**
 * Build a targeted retry prompt for a single file that failed to parse.
 */
export function buildFileRetryPrompt(
  parseResult: ParseResult,
  originalCode: string,
  workspaceContext: string,
): string {
  const errorContext = parseResult.errorLine
    ? getErrorContext(originalCode, parseResult.errorLine)
    : "";

  return `## FIX SYNTAX ERROR

The file ${parseResult.path} has a syntax error and cannot be parsed.

**Error:** ${parseResult.error}
${parseResult.errorLine ? `**Line:** ${parseResult.errorLine}` : ""}

${errorContext ? `**Error context:**\n\`\`\`\n${errorContext}\n\`\`\`\n` : ""}

**Original file:**
\`\`\`
${originalCode}
\`\`\`

${workspaceContext ? `**Related workspace files:**\n${workspaceContext}\n` : ""}

RULES:
1. Output ONLY the corrected version of ${parseResult.path}
2. Fix the syntax error while preserving ALL functionality
3. Ensure all JSX tags are properly opened and closed
4. Ensure all braces, brackets, and parentheses are balanced
5. Ensure all imports are valid ESM syntax
6. Do NOT add new features or change behavior
7. Output the COMPLETE file — not just the fixed section`;
}

/**
 * Extract lines around the error for context
 */
function getErrorContext(code: string, errorLine: number, contextLines: number = 5): string {
  const lines = code.split("\n");
  const start = Math.max(0, errorLine - contextLines - 1);
  const end = Math.min(lines.length, errorLine + contextLines);

  return lines
    .slice(start, end)
    .map((line, i) => {
      const lineNum = start + i + 1;
      const marker = lineNum === errorLine ? " >>> " : "     ";
      return `${marker}${lineNum}: ${line}`;
    })
    .join("\n");
}

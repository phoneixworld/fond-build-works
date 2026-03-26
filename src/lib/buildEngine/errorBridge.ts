/**
 * Error Bridge — Pillar 2, Component 4
 * 
 * Pipes real build errors from WebContainer (tsc, Vite)
 * into the AST repair loop for targeted fixes.
 */

import { getASTWorkspace } from "./astBridge";
import type { PatchOperation } from "@/lib/ast/types";

// ─── Error Classification ────────────────────────────────────────────────

export type BuildErrorCategory =
  | "missing_import"
  | "missing_export"
  | "type_error"
  | "syntax_error"
  | "missing_module"
  | "unused_variable"
  | "jsx_error"
  | "unknown";

export interface ClassifiedBuildError {
  /** Original error text */
  raw: string;
  /** Category for targeted repair */
  category: BuildErrorCategory;
  /** File where error occurred */
  filePath: string | null;
  /** Line number if available */
  line: number | null;
  /** Specific symbol involved */
  symbol: string | null;
  /** Source module if applicable */
  sourceModule: string | null;
  /** Suggested patch operations */
  suggestedPatches: PatchOperation[];
}

// ─── Error Parsers ───────────────────────────────────────────────────────

const ERROR_PARSERS: Array<{
  pattern: RegExp;
  category: BuildErrorCategory;
  extract: (match: RegExpMatchArray) => Partial<ClassifiedBuildError>;
}> = [
  // TypeScript: Cannot find module
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/,
    category: "missing_module",
    extract: (m) => ({
      sourceModule: m[1],
      symbol: null,
    }),
  },
  // TypeScript: has no exported member
  {
    pattern: /Module ['"]([^'"]+)['"] has no exported member ['"](\w+)['"]/,
    category: "missing_export",
    extract: (m) => ({
      sourceModule: m[1],
      symbol: m[2],
    }),
  },
  // TypeScript: is not defined / Cannot find name
  {
    pattern: /Cannot find name ['"](\w+)['"]/,
    category: "missing_import",
    extract: (m) => ({
      symbol: m[1],
    }),
  },
  // Vite: Failed to resolve import
  {
    pattern: /Failed to resolve import ["']([^"']+)["'] from ["']([^"']+)["']/,
    category: "missing_module",
    extract: (m) => ({
      sourceModule: m[1],
      filePath: m[2],
    }),
  },
  // Generic TS error with file:line
  {
    pattern: /([^\s]+\.tsx?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.*)/,
    category: "type_error",
    extract: (m) => ({
      filePath: m[1],
      line: parseInt(m[2], 10),
      symbol: null,
    }),
  },
  // SyntaxError
  {
    pattern: /SyntaxError:\s*(.*?)(?:\s+\((\d+):(\d+)\))?$/,
    category: "syntax_error",
    extract: (m) => ({
      line: m[2] ? parseInt(m[2], 10) : null,
    }),
  },
  // JSX specific
  {
    pattern: /JSX element ['"](\w+)['"] has no corresponding closing tag/,
    category: "jsx_error",
    extract: (m) => ({
      symbol: m[1],
    }),
  },
];

// ─── Classify Errors ─────────────────────────────────────────────────────

/**
 * Classify a raw build error string into a structured error with repair hints.
 */
export function classifyBuildError(raw: string): ClassifiedBuildError {
  for (const parser of ERROR_PARSERS) {
    const match = raw.match(parser.pattern);
    if (match) {
      const extracted = parser.extract(match);
      const result: ClassifiedBuildError = {
        raw,
        category: parser.category,
        filePath: extracted.filePath || null,
        line: extracted.line || null,
        symbol: extracted.symbol || null,
        sourceModule: extracted.sourceModule || null,
        suggestedPatches: [],
      };

      // Generate repair patches
      result.suggestedPatches = generateRepairPatches(result);
      return result;
    }
  }

  return {
    raw,
    category: "unknown",
    filePath: null,
    line: null,
    symbol: null,
    sourceModule: null,
    suggestedPatches: [],
  };
}

/**
 * Classify multiple errors from build output.
 */
export function classifyBuildErrors(errors: string[]): ClassifiedBuildError[] {
  return errors.map(classifyBuildError);
}

// ─── Repair Patch Generation ─────────────────────────────────────────────

function generateRepairPatches(error: ClassifiedBuildError): PatchOperation[] {
  const patches: PatchOperation[] = [];

  switch (error.category) {
    case "missing_import": {
      if (error.symbol && error.filePath) {
        // Try to find where this symbol is exported in the workspace
        const ws = getASTWorkspace();
        const exportSource = ws.query.findExportSource(error.symbol);
        if (exportSource) {
          patches.push({
            type: "add_import",
            source: exportSource.file,
            specifiers: [{
              imported: error.symbol,
              type: exportSource.exportType === "default" ? "default" : "named",
            }],
          });
        }
      }
      break;
    }

    case "missing_export": {
      if (error.symbol && error.sourceModule) {
        patches.push({
          type: "add_export",
          name: error.symbol,
          exportType: "named",
        });
      }
      break;
    }

    case "missing_module": {
      // Can't auto-fix missing npm modules, but can log for user
      console.warn(`[ErrorBridge] Missing module: ${error.sourceModule} — may need npm install`);
      break;
    }
  }

  return patches;
}

/**
 * Apply classified error repairs to the AST workspace.
 * Returns the list of files that were repaired.
 */
export function applyErrorRepairs(errors: ClassifiedBuildError[]): string[] {
  const ws = getASTWorkspace();
  const repairedFiles: string[] = [];

  for (const error of errors) {
    if (error.suggestedPatches.length === 0 || !error.filePath) continue;

    const results = ws.patcher.applyPatches(error.filePath, error.suggestedPatches);
    if (results.some(r => r.success)) {
      repairedFiles.push(error.filePath);
      console.log(`[ErrorBridge] Repaired ${error.category} in ${error.filePath}`);
    }
  }

  return repairedFiles;
}

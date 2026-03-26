/**
 * Build Error Classifier v2
 * 
 * Classifies REAL parse/type/structural errors from AST analysis
 * into actionable repair strategies. Uses the AST Store for actual
 * error detection instead of regex guessing.
 */

import type { ASTStore } from "../ast/store";
import type { ASTFileEntry, ParseError } from "../ast/types";

// ─── Error Types ─────────────────────────────────────────────────────────

export type ErrorCategory =
  | "parse_error"          // Babel can't parse the file
  | "missing_import"       // Uses symbol that isn't imported
  | "broken_import_path"   // Import path doesn't resolve to any file
  | "missing_export"       // Imports symbol that target file doesn't export
  | "duplicate_export"     // Same symbol exported twice
  | "unused_import"        // Import that's never used (warning)
  | "missing_dependency"   // External package not in deps
  | "circular_dependency"  // Circular import chain
  | "missing_jsx_import"   // JSX used but React not imported
  | "hook_violation"       // Hook called outside component/hook
  | "type_mismatch"        // Props don't match component signature
  | "empty_component"      // Component renders nothing meaningful
  | "router_violation"     // Router hook outside Router provider
  | "alias_import"         // @/ alias used (breaks Sandpack)
  | "default_import_missing"; // Default import but file only has named exports

export type RepairStrategy =
  | "deterministic"     // Can fix without AI (AST manipulation)
  | "template"          // Fix by inserting a known template
  | "ai_targeted"       // AI fixes specific node (scoped prompt)
  | "ai_full_file"      // AI rewrites entire file (last resort)
  | "remove"            // Delete the broken code
  | "skip";             // Not fixable or not worth fixing

export interface ClassifiedError {
  /** Unique ID for deduplication */
  id: string;
  /** Error category */
  category: ErrorCategory;
  /** File containing the error */
  file: string;
  /** Line number if known */
  line?: number;
  /** Column if known */
  column?: number;
  /** Human-readable error message */
  message: string;
  /** Recommended repair strategy */
  strategy: RepairStrategy;
  /** Confidence (0-1) that this classification is correct */
  confidence: number;
  /** Severity: errors block build, warnings don't */
  severity: "error" | "warning";
  /** Additional context for the repair */
  context: ErrorContext;
}

export interface ErrorContext {
  /** Symbol name involved (if applicable) */
  symbol?: string;
  /** Source module of the import */
  importSource?: string;
  /** Available exports from the target file */
  availableExports?: string[];
  /** Suggested fix (deterministic) */
  suggestedFix?: string;
  /** Related files */
  relatedFiles?: string[];
}

// ─── Error Classifier ────────────────────────────────────────────────────

export class BuildErrorClassifier {
  constructor(private store: ASTStore) {}

  /**
   * Run full error classification across the workspace.
   * Returns all detected errors sorted by severity and fixability.
   */
  classify(): ClassifiedError[] {
    const errors: ClassifiedError[] = [];
    const seen = new Set<string>();

    const addError = (err: ClassifiedError) => {
      if (seen.has(err.id)) return;
      seen.add(err.id);
      errors.push(err);
    };

    for (const entry of this.store.getAllFiles()) {
      // 1. Parse errors (from Babel)
      for (const parseErr of entry.parseErrors) {
        addError(this.classifyParseError(entry, parseErr));
      }

      // Skip further checks if file didn't parse
      if (entry.parseErrors.length > 0) continue;

      // 2. Import path resolution
      for (const imp of entry.metadata.imports) {
        const pathErrors = this.checkImportPath(entry, imp.source, imp.specifiers.map(s => s.local));
        pathErrors.forEach(addError);
      }

      // 3. Missing exports (import { X } from "./foo" but foo doesn't export X)
      for (const imp of entry.metadata.imports) {
        if (imp.source.startsWith(".")) {
          const exportErrors = this.checkImportedExports(entry, imp);
          exportErrors.forEach(addError);
        }
      }

      // 4. Alias imports (@/ paths)
      for (const imp of entry.metadata.imports) {
        if (imp.source.startsWith("@/")) {
          addError({
            id: `alias:${entry.path}:${imp.source}`,
            category: "alias_import",
            file: entry.path,
            line: imp.loc.line,
            message: `Alias import '${imp.source}' not supported in preview runtime`,
            strategy: "deterministic",
            confidence: 1.0,
            severity: "error",
            context: {
              importSource: imp.source,
              suggestedFix: `Convert @/ to relative path`,
            },
          });
        }
      }

      // 5. JSX without React import (for non-automatic JSX runtime)
      if (entry.hasJSX) {
        const hasReactImport = entry.metadata.imports.some(
          i => i.source === "react" && i.specifiers.some(s => s.imported === "default" || s.imported === "React")
        );
        if (!hasReactImport) {
          addError({
            id: `jsx-react:${entry.path}`,
            category: "missing_jsx_import",
            file: entry.path,
            line: 1,
            message: "JSX used but React is not imported",
            strategy: "deterministic",
            confidence: 1.0,
            severity: "error",
            context: {
              suggestedFix: `Add: import React from "react"`,
            },
          });
        }
      }

      // 6. Empty components
      for (const comp of entry.metadata.components) {
        if (entry.source.length < 100 && !entry.source.includes("return")) {
          addError({
            id: `empty-comp:${entry.path}:${comp.name}`,
            category: "empty_component",
            file: entry.path,
            line: comp.loc.line,
            message: `Component '${comp.name}' appears to be a stub with no meaningful render`,
            strategy: "template",
            confidence: 0.7,
            severity: "warning",
            context: { symbol: comp.name },
          });
        }
      }

      // 7. Hook violations — hooks used in non-component functions
      this.checkHookViolations(entry).forEach(addError);
    }

    // 8. Cross-file: circular dependencies
    this.checkCircularDeps().forEach(addError);

    // Sort: errors first, then by confidence (highest first)
    errors.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      return b.confidence - a.confidence;
    });

    return errors;
  }

  /**
   * Classify errors for a single file (incremental).
   */
  classifyFile(path: string): ClassifiedError[] {
    const entry = this.store.getFile(path);
    if (!entry) return [];

    const allErrors = this.classify();
    return allErrors.filter(e => e.file === path);
  }

  // ─── Internal Classifiers ──────────────────────────────────────────────

  private classifyParseError(entry: ASTFileEntry, err: ParseError): ClassifiedError {
    const message = err.message || "Syntax error";

    // Classify parse error subtypes for better repair
    let suggestedFix: string | undefined;
    let strategy: RepairStrategy = "ai_targeted";

    if (message.includes("Unexpected token")) {
      if (message.includes("export")) {
        suggestedFix = "Fix export syntax — likely missing closing brace or semicolon";
        strategy = "deterministic";
      } else if (message.includes("}") || message.includes("{")) {
        suggestedFix = "Balance braces — unmatched { or }";
      } else if (message.includes(">") || message.includes("<")) {
        suggestedFix = "Fix JSX — unclosed tag or mismatched angle brackets";
      }
    } else if (message.includes("Unterminated string")) {
      suggestedFix = "Close the string literal";
      strategy = "deterministic";
    } else if (message.includes("Missing semicolon")) {
      suggestedFix = "Add missing semicolon";
      strategy = "deterministic";
    }

    return {
      id: `parse:${entry.path}:${err.line || 0}`,
      category: "parse_error",
      file: entry.path,
      line: err.line,
      column: err.column,
      message,
      strategy,
      confidence: 1.0,
      severity: "error",
      context: { suggestedFix },
    };
  }

  private checkImportPath(
    entry: ASTFileEntry,
    source: string,
    specifiers: string[]
  ): ClassifiedError[] {
    // Skip external packages
    if (!source.startsWith(".") && !source.startsWith("/")) return [];

    // Try to resolve the import
    const resolved = this.resolveImportPath(entry.path, source);
    if (resolved) return [];

    return [{
      id: `broken-path:${entry.path}:${source}`,
      category: "broken_import_path",
      file: entry.path,
      message: `Cannot resolve import '${source}'`,
      strategy: "deterministic",
      confidence: 1.0,
      severity: "error",
      context: {
        importSource: source,
        symbol: specifiers.join(", "),
        suggestedFix: this.suggestImportFix(entry.path, source),
        relatedFiles: this.findSimilarFiles(source),
      },
    }];
  }

  private checkImportedExports(
    entry: ASTFileEntry,
    imp: ASTFileEntry["metadata"]["imports"][0]
  ): ClassifiedError[] {
    const errors: ClassifiedError[] = [];
    const resolved = this.resolveImportPath(entry.path, imp.source);
    if (!resolved) return []; // Already caught by checkImportPath

    const targetMeta = this.store.getMetadata(resolved);
    if (!targetMeta) return [];

    const availableExports = targetMeta.exports.map(e => e.name);

    for (const spec of imp.specifiers) {
      if (spec.type === "namespace") continue; // import * as X
      if (spec.type === "default") {
        const hasDefault = targetMeta.exports.some(e => e.type === "default");
        if (!hasDefault) {
          errors.push({
            id: `missing-default:${entry.path}:${imp.source}`,
            category: "default_import_missing",
            file: entry.path,
            line: imp.loc.line,
            message: `'${resolved}' has no default export, but is imported as default`,
            strategy: "deterministic",
            confidence: 0.9,
            severity: "error",
            context: {
              importSource: imp.source,
              availableExports,
              suggestedFix: availableExports.length > 0
                ? `Use named import: import { ${availableExports[0]} } from "${imp.source}"`
                : `Add default export to ${resolved}`,
            },
          });
        }
        continue;
      }

      // Named import
      const exportExists = targetMeta.exports.some(
        e => e.name === spec.imported || e.localName === spec.imported
      );
      if (!exportExists) {
        errors.push({
          id: `missing-export:${entry.path}:${imp.source}:${spec.imported}`,
          category: "missing_export",
          file: entry.path,
          line: imp.loc.line,
          message: `'${spec.imported}' is not exported from '${resolved}'`,
          strategy: "deterministic",
          confidence: 0.95,
          severity: "error",
          context: {
            symbol: spec.imported,
            importSource: imp.source,
            availableExports,
            suggestedFix: this.suggestExportFix(spec.imported, availableExports),
          },
        });
      }
    }

    return errors;
  }

  private checkHookViolations(entry: ASTFileEntry): ClassifiedError[] {
    const errors: ClassifiedError[] = [];
    const routerHooks = ["useNavigate", "useLocation", "useParams", "useSearchParams"];

    for (const hook of entry.metadata.hooks) {
      if (routerHooks.includes(hook.name)) {
        // Check if this file is likely outside router (e.g., context files)
        const isContext = entry.path.includes("context") || entry.path.includes("Context");
        if (isContext) {
          errors.push({
            id: `router-hook:${entry.path}:${hook.name}`,
            category: "router_violation",
            file: entry.path,
            line: hook.loc.line,
            message: `'${hook.name}' used in context file — may be outside Router provider`,
            strategy: "deterministic",
            confidence: 0.85,
            severity: "error",
            context: {
              symbol: hook.name,
              suggestedFix: `Remove ${hook.name} from context file and pass navigation as a callback prop`,
            },
          });
        }
      }
    }

    return errors;
  }

  private checkCircularDeps(): ClassifiedError[] {
    // Use AST dependency graph if available
    const errors: ClassifiedError[] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    for (const entry of this.store.getAllFiles()) {
      this.dfsCircular(entry.path, visited, stack, [], errors);
    }

    return errors;
  }

  private dfsCircular(
    path: string,
    visited: Set<string>,
    stack: Set<string>,
    currentPath: string[],
    errors: ClassifiedError[]
  ): void {
    if (stack.has(path)) {
      const cycleStart = currentPath.indexOf(path);
      if (cycleStart !== -1) {
        const cycle = currentPath.slice(cycleStart);
        errors.push({
          id: `circular:${cycle.join("->")}`,
          category: "circular_dependency",
          file: path,
          message: `Circular dependency: ${cycle.join(" → ")} → ${path}`,
          strategy: "ai_targeted",
          confidence: 0.8,
          severity: "warning",
          context: {
            relatedFiles: cycle,
            suggestedFix: "Break the cycle by extracting shared types/interfaces into a separate file",
          },
        });
      }
      return;
    }
    if (visited.has(path)) return;

    visited.add(path);
    stack.add(path);
    currentPath.push(path);

    const meta = this.store.getMetadata(path);
    if (meta) {
      for (const imp of meta.imports) {
        if (!imp.source.startsWith(".")) continue;
        const resolved = this.resolveImportPath(path, imp.source);
        if (resolved) {
          this.dfsCircular(resolved, visited, stack, [...currentPath], errors);
        }
      }
    }

    stack.delete(path);
  }

  // ─── Resolution Helpers ────────────────────────────────────────────────

  private resolveImportPath(fromFile: string, importSource: string): string | null {
    if (!importSource.startsWith(".")) return null;

    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    const segments = [...fromDir.split("/"), ...importSource.split("/")];
    const resolved: string[] = [];

    for (const seg of segments) {
      if (seg === ".") continue;
      if (seg === "..") { resolved.pop(); continue; }
      if (seg) resolved.push(seg);
    }

    const basePath = resolved.join("/");
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

    if (this.store.hasFile(basePath)) return basePath;
    for (const ext of extensions) {
      if (this.store.hasFile(basePath + ext)) return basePath + ext;
    }
    for (const ext of extensions) {
      if (this.store.hasFile(basePath + "/index" + ext)) return basePath + "/index" + ext;
    }

    return null;
  }

  private suggestImportFix(fromFile: string, source: string): string {
    const similar = this.findSimilarFiles(source);
    if (similar.length > 0) {
      return `Did you mean '${similar[0]}'?`;
    }
    return `Create the missing file or update the import path`;
  }

  private findSimilarFiles(source: string): string[] {
    const baseName = source.split("/").pop()?.replace(/\.\w+$/, "") || "";
    if (!baseName) return [];

    return this.store.paths.filter(p => {
      const fileName = p.split("/").pop()?.replace(/\.\w+$/, "") || "";
      return fileName.toLowerCase() === baseName.toLowerCase() ||
        fileName.toLowerCase().includes(baseName.toLowerCase());
    });
  }

  private suggestExportFix(symbol: string, available: string[]): string {
    // Levenshtein-like fuzzy match
    const similar = available.find(exp => {
      const a = exp.toLowerCase();
      const b = symbol.toLowerCase();
      return a.includes(b) || b.includes(a) || levenshtein(a, b) <= 2;
    });

    if (similar) return `Did you mean '${similar}'? Available: ${available.join(", ")}`;
    return `Available exports: ${available.join(", ")}`;
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

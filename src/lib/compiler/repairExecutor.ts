/**
 * Build Repair Executor v2
 * 
 * Executes repairs based on classified errors using the AST workspace.
 * Deterministic fixes are applied via AST patching.
 * AI-targeted fixes get scoped prompts with real error context.
 */

import type { ASTStore } from "../ast/store";
import { ASTPatcher, type PatchResult } from "../ast/patch";
import { ASTQueryEngine } from "../ast/query";
import { BuildErrorClassifier, type ClassifiedError, type RepairStrategy } from "./errorClassifier";

// ─── Repair Result ───────────────────────────────────────────────────────

export interface RepairResult {
  /** Error that was addressed */
  error: ClassifiedError;
  /** Whether the repair was successful */
  success: boolean;
  /** What was done */
  action: string;
  /** Strategy used */
  strategy: RepairStrategy;
  /** New source code if file was modified */
  newSource?: string;
  /** AI prompt if strategy requires AI */
  aiPrompt?: string;
}

export interface RepairRoundResult {
  round: number;
  errorsAtStart: number;
  repairsAttempted: number;
  repairsSucceeded: number;
  errorsRemaining: number;
  results: RepairResult[];
}

export interface RepairLoopResult {
  rounds: RepairRoundResult[];
  totalRounds: number;
  totalRepairs: number;
  converged: boolean;
  remainingErrors: ClassifiedError[];
  summary: string;
}

// ─── Configuration ───────────────────────────────────────────────────────

export interface RepairConfig {
  /** Max rounds before stopping (default: 4) */
  maxRounds: number;
  /** Max total repair actions (default: 30) */
  maxActions: number;
  /** Whether to attempt AI repairs or only deterministic (default: true) */
  allowAI: boolean;
  /** Callback for AI-targeted repairs */
  onAIRepairNeeded?: (prompt: string, file: string) => Promise<string | null>;
}

const DEFAULT_CONFIG: RepairConfig = {
  maxRounds: 4,
  maxActions: 30,
  allowAI: true,
};

// ─── Repair Executor ─────────────────────────────────────────────────────

export class RepairExecutor {
  private store: ASTStore;
  private patcher: ASTPatcher;
  private query: ASTQueryEngine;
  private classifier: BuildErrorClassifier;

  constructor(store: ASTStore) {
    this.store = store;
    this.patcher = new ASTPatcher(store);
    this.query = new ASTQueryEngine(store);
    this.classifier = new BuildErrorClassifier(store);
  }

  /**
   * Run the full repair loop until convergence or max rounds.
   */
  async runRepairLoop(config: Partial<RepairConfig> = {}): Promise<RepairLoopResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const rounds: RepairRoundResult[] = [];
    let totalActions = 0;

    for (let round = 1; round <= cfg.maxRounds; round++) {
      const errors = this.classifier.classify();
      const actionableErrors = errors.filter(e => e.severity === "error");

      if (actionableErrors.length === 0) {
        // All clear!
        return {
          rounds,
          totalRounds: round - 1,
          totalRepairs: totalActions,
          converged: true,
          remainingErrors: [],
          summary: `✅ All errors resolved in ${round - 1} round(s), ${totalActions} repairs applied`,
        };
      }

      const roundResult: RepairRoundResult = {
        round,
        errorsAtStart: actionableErrors.length,
        repairsAttempted: 0,
        repairsSucceeded: 0,
        errorsRemaining: 0,
        results: [],
      };

      // Process errors by strategy priority: deterministic first, then template, then AI
      const sorted = [...actionableErrors].sort((a, b) => {
        const priority: Record<RepairStrategy, number> = {
          deterministic: 0,
          template: 1,
          remove: 2,
          ai_targeted: 3,
          ai_full_file: 4,
          skip: 5,
        };
        return (priority[a.strategy] || 5) - (priority[b.strategy] || 5);
      });

      for (const error of sorted) {
        if (totalActions >= cfg.maxActions) break;
        if (error.strategy === "skip") continue;
        if (!cfg.allowAI && (error.strategy === "ai_targeted" || error.strategy === "ai_full_file")) continue;

        const result = await this.repairError(error, cfg);
        roundResult.results.push(result);
        roundResult.repairsAttempted++;
        totalActions++;

        if (result.success) {
          roundResult.repairsSucceeded++;
        }
      }

      // Re-classify to check remaining
      const remaining = this.classifier.classify().filter(e => e.severity === "error");
      roundResult.errorsRemaining = remaining.length;
      rounds.push(roundResult);

      // Converged if no improvement
      if (roundResult.repairsSucceeded === 0) {
        return {
          rounds,
          totalRounds: round,
          totalRepairs: totalActions,
          converged: false,
          remainingErrors: remaining,
          summary: this.buildSummary(rounds, remaining),
        };
      }
    }

    const remaining = this.classifier.classify().filter(e => e.severity === "error");
    return {
      rounds,
      totalRounds: rounds.length,
      totalRepairs: totalActions,
      converged: remaining.length === 0,
      remainingErrors: remaining,
      summary: this.buildSummary(rounds, remaining),
    };
  }

  /**
   * Repair a single error.
   */
  async repairError(error: ClassifiedError, config: RepairConfig): Promise<RepairResult> {
    switch (error.category) {
      case "parse_error":
        return this.repairParseError(error, config);
      case "broken_import_path":
        return this.repairBrokenImportPath(error);
      case "missing_export":
        return this.repairMissingExport(error);
      case "default_import_missing":
        return this.repairDefaultImportMissing(error);
      case "alias_import":
        return this.repairAliasImport(error);
      case "missing_jsx_import":
        return this.repairMissingJsxImport(error);
      case "router_violation":
        return this.repairRouterViolation(error);
      case "missing_import":
        return this.repairMissingImport(error);
      default:
        return this.buildAIRepairPrompt(error, config);
    }
  }

  // ─── Deterministic Repairs ──────────────────────────────────────────────

  private repairBrokenImportPath(error: ClassifiedError): RepairResult {
    const source = error.context.importSource;
    if (!source) return { error, success: false, action: "No import source", strategy: "deterministic" };

    // Try to find the file with a different extension
    const similar = error.context.relatedFiles || [];
    if (similar.length > 0) {
      // Compute the correct relative path
      const targetFile = similar[0];
      const fromDir = error.file.split("/").slice(0, -1).join("/");
      const relativePath = this.computeRelativePath(fromDir, targetFile);

      const result = this.patcher.applyPatch(error.file, {
        type: "remove_import",
        source,
      });

      if (result.success) {
        // Re-add with corrected path
        const entry = this.store.getFile(error.file);
        if (entry) {
          // Parse the original import to get specifiers
          const origMeta = entry.metadata.imports.find(i => i.source === source);
          if (origMeta) {
            this.patcher.applyPatch(error.file, {
              type: "add_import",
              source: relativePath,
              specifiers: origMeta.specifiers.map(s => ({
                imported: s.imported,
                local: s.local,
                type: s.type,
              })),
            });
          }
        }
      }

      return {
        error,
        success: true,
        action: `Fixed import path: '${source}' → '${relativePath}'`,
        strategy: "deterministic",
      };
    }

    // If no similar file, try to create a stub file
    const targetPath = this.resolveTargetPath(error.file, source);
    if (targetPath) {
      const symbols = error.context.symbol?.split(", ") || [];
      const stubCode = this.generateStubFile(targetPath, symbols);
      this.store.setFile(targetPath, stubCode);

      return {
        error,
        success: true,
        action: `Created stub file: ${targetPath}`,
        strategy: "template",
      };
    }

    return { error, success: false, action: "Could not resolve import path", strategy: "deterministic" };
  }

  private repairMissingExport(error: ClassifiedError): RepairResult {
    const symbol = error.context.symbol;
    const importSource = error.context.importSource;
    if (!symbol || !importSource) {
      return { error, success: false, action: "No symbol/source info", strategy: "deterministic" };
    }

    // Find the target file
    const targetPath = this.resolveImportToFile(error.file, importSource);
    if (!targetPath) {
      return { error, success: false, action: "Target file not found", strategy: "deterministic" };
    }

    // Check if there's a similar export name (typo)
    const available = error.context.availableExports || [];
    const similar = available.find(e =>
      e.toLowerCase() === symbol.toLowerCase() ||
      e.toLowerCase().includes(symbol.toLowerCase())
    );

    if (similar && similar !== symbol) {
      // Fix the import to use the correct name
      const result = this.patcher.applyPatch(error.file, {
        type: "rename_symbol",
        from: symbol,
        to: similar,
        scope: "file",
      });

      return {
        error,
        success: result.success,
        action: `Fixed import: '${symbol}' → '${similar}'`,
        strategy: "deterministic",
      };
    }

    // Add the export to the target file
    const targetSource = this.store.getSource(targetPath);
    if (targetSource) {
      // Check if the symbol is defined but not exported
      const targetMeta = this.store.getMetadata(targetPath);
      const isDefined = targetMeta?.declarations.some(d => d.name === symbol);

      if (isDefined) {
        const result = this.patcher.applyPatch(targetPath, {
          type: "add_export",
          name: symbol,
          exportType: "named",
        });

        return {
          error,
          success: result.success,
          action: `Added export for '${symbol}' in ${targetPath}`,
          strategy: "deterministic",
        };
      }
    }

    return { error, success: false, action: `'${symbol}' not found in ${targetPath}`, strategy: "ai_targeted" };
  }

  private repairDefaultImportMissing(error: ClassifiedError): RepairResult {
    const available = error.context.availableExports || [];
    if (available.length === 0) {
      return { error, success: false, action: "No exports available", strategy: "ai_targeted" };
    }

    // Convert default import to named import
    const source = error.context.importSource;
    if (!source) return { error, success: false, action: "No source", strategy: "deterministic" };

    // Remove the default import and add named
    const result = this.patcher.applyPatches(error.file, [
      { type: "remove_import", source },
      {
        type: "add_import",
        source,
        specifiers: [{ imported: available[0], type: "named" as const }],
      },
    ]);

    const success = result.every(r => r.success);
    return {
      error,
      success,
      action: `Converted default import to named: { ${available[0]} }`,
      strategy: "deterministic",
    };
  }

  private repairAliasImport(error: ClassifiedError): RepairResult {
    const source = error.context.importSource;
    if (!source || !source.startsWith("@/")) {
      return { error, success: false, action: "Not an alias import", strategy: "deterministic" };
    }

    // Convert @/path to relative path
    const targetPath = source.replace("@/", "src/");
    const fromDir = error.file.split("/").slice(0, -1).join("/");
    const relativePath = this.computeRelativePath(fromDir, targetPath);

    // Get current specifiers
    const entry = this.store.getFile(error.file);
    const imp = entry?.metadata.imports.find(i => i.source === source);
    if (!imp) return { error, success: false, action: "Import not found in AST", strategy: "deterministic" };

    const results = this.patcher.applyPatches(error.file, [
      { type: "remove_import", source },
      {
        type: "add_import",
        source: relativePath,
        specifiers: imp.specifiers.map(s => ({
          imported: s.imported,
          local: s.local,
          type: s.type,
        })),
      },
    ]);

    const success = results.every(r => r.success);
    return {
      error,
      success,
      action: `Converted alias: '${source}' → '${relativePath}'`,
      strategy: "deterministic",
    };
  }

  private repairMissingJsxImport(error: ClassifiedError): RepairResult {
    const result = this.patcher.applyPatch(error.file, {
      type: "add_import",
      source: "react",
      specifiers: [{ imported: "React", type: "default" as const }],
    });

    return {
      error,
      success: result.success,
      action: "Added React import",
      strategy: "deterministic",
    };
  }

  private repairRouterViolation(error: ClassifiedError): RepairResult {
    const hookName = error.context.symbol;
    if (!hookName) return { error, success: false, action: "No hook name", strategy: "deterministic" };

    const result = this.patcher.applyPatch(error.file, {
      type: "remove_import",
      source: "react-router-dom",
      specifiers: [hookName],
    });

    return {
      error,
      success: result.success,
      action: `Removed router hook '${hookName}' from context file`,
      strategy: "deterministic",
    };
  }

  private repairMissingImport(error: ClassifiedError): RepairResult {
    const symbol = error.context.symbol;
    if (!symbol) return { error, success: false, action: "No symbol", strategy: "deterministic" };

    // Find where this symbol is exported
    const exportSource = this.query.findExportSource(symbol);
    if (!exportSource) {
      return { error, success: false, action: `Cannot find export for '${symbol}'`, strategy: "ai_targeted" };
    }

    const fromDir = error.file.split("/").slice(0, -1).join("/");
    const relativePath = this.computeRelativePath(fromDir, exportSource.file);

    const result = this.patcher.applyPatch(error.file, {
      type: "add_import",
      source: relativePath,
      specifiers: [{
        imported: symbol,
        type: exportSource.exportType === "default" ? "default" as const : "named" as const,
      }],
    });

    return {
      error,
      success: result.success,
      action: `Added import: ${symbol} from '${relativePath}'`,
      strategy: "deterministic",
    };
  }

  private async repairParseError(error: ClassifiedError, config: RepairConfig): Promise<RepairResult> {
    // For simple parse errors, try deterministic fixes first
    if (error.context.suggestedFix?.includes("semicolon") || error.context.suggestedFix?.includes("string")) {
      const source = this.store.getSource(error.file);
      if (source && error.line) {
        const lines = source.split("\n");
        if (error.context.suggestedFix.includes("semicolon") && error.line <= lines.length) {
          lines[error.line - 1] = lines[error.line - 1].replace(/\s*$/, ";");
          this.store.setFile(error.file, lines.join("\n"));
          return { error, success: true, action: "Added missing semicolon", strategy: "deterministic" };
        }
      }
    }

    // Delegate to AI for complex parse errors
    return this.buildAIRepairPrompt(error, config);
  }

  // ─── AI Repair Prompt Builder ──────────────────────────────────────────

  private async buildAIRepairPrompt(error: ClassifiedError, config: RepairConfig): Promise<RepairResult> {
    const source = this.store.getSource(error.file) || "";
    const relatedContext = this.getRelatedContext(error);

    const prompt = `## FIX ERROR in ${error.file}

**Error:** ${error.message}
${error.line ? `**Line:** ${error.line}` : ""}
${error.context.suggestedFix ? `**Suggestion:** ${error.context.suggestedFix}` : ""}

**Current file:**
\`\`\`
${source}
\`\`\`

${relatedContext}

RULES:
1. Fix ONLY the reported error
2. Output the COMPLETE corrected file
3. Preserve all existing functionality
4. Use relative imports (no @/ aliases)
5. Ensure all JSX tags are balanced
6. Do NOT add new features`;

    if (config.onAIRepairNeeded) {
      const fixed = await config.onAIRepairNeeded(prompt, error.file);
      if (fixed) {
        this.store.setFile(error.file, fixed);
        return {
          error,
          success: true,
          action: `AI repaired: ${error.message}`,
          strategy: error.strategy,
          aiPrompt: prompt,
        };
      }
    }

    return {
      error,
      success: false,
      action: "AI repair needed but no handler provided",
      strategy: error.strategy,
      aiPrompt: prompt,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private getRelatedContext(error: ClassifiedError): string {
    const parts: string[] = [];
    const budget = 3000;
    let remaining = budget;

    const related = error.context.relatedFiles || [];
    for (const file of related.slice(0, 3)) {
      const content = this.store.getSource(file);
      if (content && content.length < remaining) {
        parts.push(`**${file}:**\n\`\`\`\n${content}\n\`\`\``);
        remaining -= content.length;
      }
    }

    // Also include files imported by the error file
    const meta = this.store.getMetadata(error.file);
    if (meta) {
      for (const imp of meta.imports.slice(0, 3)) {
        if (!imp.source.startsWith(".")) continue;
        const resolved = this.resolveImportToFile(error.file, imp.source);
        if (!resolved || related.includes(resolved)) continue;
        const content = this.store.getSource(resolved);
        if (content && content.length < remaining) {
          parts.push(`**${resolved}:**\n\`\`\`\n${content}\n\`\`\``);
          remaining -= content.length;
        }
      }
    }

    return parts.length > 0 ? `**Related files:**\n${parts.join("\n\n")}` : "";
  }

  private resolveImportToFile(fromFile: string, source: string): string | null {
    if (!source.startsWith(".")) return null;
    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    const segments = [...fromDir.split("/"), ...source.split("/")];
    const resolved: string[] = [];

    for (const seg of segments) {
      if (seg === ".") continue;
      if (seg === "..") { resolved.pop(); continue; }
      if (seg) resolved.push(seg);
    }

    const basePath = resolved.join("/");
    const exts = [".ts", ".tsx", ".js", ".jsx"];

    if (this.store.hasFile(basePath)) return basePath;
    for (const ext of exts) {
      if (this.store.hasFile(basePath + ext)) return basePath + ext;
    }
    for (const ext of exts) {
      if (this.store.hasFile(basePath + "/index" + ext)) return basePath + "/index" + ext;
    }
    return null;
  }

  private resolveTargetPath(fromFile: string, source: string): string | null {
    if (!source.startsWith(".")) return null;
    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    const segments = [...fromDir.split("/"), ...source.split("/")];
    const resolved: string[] = [];

    for (const seg of segments) {
      if (seg === ".") continue;
      if (seg === "..") { resolved.pop(); continue; }
      if (seg) resolved.push(seg);
    }

    return resolved.join("/") + ".tsx";
  }

  private computeRelativePath(fromDir: string, targetPath: string): string {
    const fromParts = fromDir.split("/").filter(Boolean);
    const toParts = targetPath.split("/").filter(Boolean);

    // Remove extension for import
    const lastPart = toParts[toParts.length - 1];
    toParts[toParts.length - 1] = lastPart.replace(/\.(tsx?|jsx?|mjs)$/, "");

    let commonLength = 0;
    while (
      commonLength < fromParts.length &&
      commonLength < toParts.length &&
      fromParts[commonLength] === toParts[commonLength]
    ) {
      commonLength++;
    }

    const ups = fromParts.length - commonLength;
    const prefix = ups === 0 ? "./" : "../".repeat(ups);
    const remainder = toParts.slice(commonLength).join("/");

    return prefix + remainder;
  }

  private generateStubFile(path: string, exportedSymbols: string[]): string {
    const name = path.split("/").pop()?.replace(/\.\w+$/, "") || "Component";
    const isComponent = /^[A-Z]/.test(name);

    if (isComponent) {
      const namedExports = exportedSymbols
        .filter(s => s !== name && s !== "default")
        .map(s => `export const ${s} = () => null;`)
        .join("\n");

      return `import React from "react";

export default function ${name}({ children, ...props }) {
  return (
    <div className="p-4" {...props}>
      <h2 className="text-lg font-semibold">${name}</h2>
      {children}
    </div>
  );
}
${namedExports}`;
    }

    // Utility/hook file
    return exportedSymbols
      .map(s => `export function ${s}() { return null; }`)
      .join("\n\n") || `export default function ${name}() { return null; }`;
  }

  private buildSummary(rounds: RepairRoundResult[], remaining: ClassifiedError[]): string {
    const totalRepairs = rounds.reduce((s, r) => s + r.repairsSucceeded, 0);

    if (remaining.length === 0) {
      return `✅ All errors resolved: ${totalRepairs} repairs in ${rounds.length} round(s)`;
    }

    const lines = [
      `⚠️ ${remaining.length} errors remain after ${rounds.length} round(s), ${totalRepairs} repairs applied:`,
      ...remaining.slice(0, 10).map(e => `  ❌ ${e.file}: ${e.message} [${e.strategy}]`),
    ];

    if (remaining.length > 10) {
      lines.push(`  ... and ${remaining.length - 10} more`);
    }

    return lines.join("\n");
  }
}

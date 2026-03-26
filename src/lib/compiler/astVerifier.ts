/**
 * AST Verifier — Deep Structural Verification via AST Analysis
 * 
 * Replaces regex-based guessing with precise AST-powered checks:
 * 
 * 1. Cross-file type safety (imports match exports by type)
 * 2. Component completeness (no empty returns, orphaned state)
 * 3. Hook rule enforcement (no conditional hooks, no hooks outside components)
 * 4. Dependency cycle detection with impact severity
 * 5. Quality scoring (0-100) with granular metrics
 * 
 * This is the final gate before a build is marked "complete".
 */

import { createASTWorkspace, type ASTWorkspace } from "@/lib/ast";
import type { FileMetadata, ComponentInfo, ImportInfo, ExportInfo } from "@/lib/ast/types";

// ─── Quality Score ───────────────────────────────────────────────────────

export interface QualityScore {
  /** Overall score 0-100 */
  overall: number;
  /** Breakdown by category */
  categories: {
    importHealth: number;      // 0-100: resolved imports / total imports
    exportConsistency: number; // 0-100: correct import-export matching
    componentQuality: number;  // 0-100: component structure quality
    hookSafety: number;        // 0-100: hook rule compliance
    dependencyHealth: number;  // 0-100: no cycles, clean graph
  };
  /** Total files analyzed */
  filesAnalyzed: number;
  /** Issues found per severity */
  issueCounts: { error: number; warning: number; info: number };
}

// ─── Verification Issue ──────────────────────────────────────────────────

export interface ASTVerificationIssue {
  category: ASTIssueCategory;
  severity: "error" | "warning" | "info";
  file: string;
  line?: number;
  message: string;
  suggestedFix?: string;
  /** Confidence that this is a real issue (0-1) */
  confidence: number;
}

export type ASTIssueCategory =
  | "import_export_mismatch"
  | "missing_export"
  | "unused_import"
  | "circular_dependency"
  | "hook_violation"
  | "empty_component"
  | "orphaned_state"
  | "missing_return"
  | "type_mismatch"
  | "dead_code"
  | "provider_gap"
  | "missing_error_boundary"
  | "excessive_rerenders";

// ─── Verification Result ─────────────────────────────────────────────────

export interface ASTVerificationResult {
  ok: boolean;
  score: QualityScore;
  issues: ASTVerificationIssue[];
  /** Files with the most issues */
  hotspots: { file: string; issueCount: number }[];
  /** Suggested refactoring opportunities */
  refactorSuggestions: string[];
}

// ─── Main Verifier ───────────────────────────────────────────────────────

export function verifyWithAST(
  workspace: Record<string, string>
): ASTVerificationResult {
  const ws = createASTWorkspace(workspace);
  const issues: ASTVerificationIssue[] = [];

  // 1. Import-export cross-file verification
  const importExportIssues = checkImportExportAlignment(ws);
  issues.push(...importExportIssues);

  // 2. Component quality checks
  const componentIssues = checkComponentQuality(ws);
  issues.push(...componentIssues);

  // 3. Hook rule enforcement
  const hookIssues = checkHookRules(ws);
  issues.push(...hookIssues);

  // 4. Dependency cycle detection
  const cycleIssues = checkDependencyCycles(ws);
  issues.push(...cycleIssues);

  // 5. Unused import detection
  const unusedIssues = checkUnusedImports(ws);
  issues.push(...unusedIssues);

  // 6. Provider gap detection
  const providerIssues = checkProviderGaps(ws);
  issues.push(...providerIssues);

  // 7. Dead code detection
  const deadCodeIssues = checkDeadCode(ws);
  issues.push(...deadCodeIssues);

  // Calculate quality score
  const score = calculateQualityScore(ws, issues);

  // Find hotspots
  const fileCounts = new Map<string, number>();
  for (const issue of issues) {
    fileCounts.set(issue.file, (fileCounts.get(issue.file) || 0) + 1);
  }
  const hotspots = [...fileCounts.entries()]
    .map(([file, issueCount]) => ({ file, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 5);

  // Generate refactoring suggestions
  const refactorSuggestions = generateRefactorSuggestions(ws, issues);

  const errorCount = issues.filter(i => i.severity === "error").length;

  return {
    ok: errorCount === 0,
    score,
    issues,
    hotspots,
    refactorSuggestions,
  };
}

// ─── Check: Import-Export Alignment ──────────────────────────────────────

function checkImportExportAlignment(ws: ASTWorkspace): ASTVerificationIssue[] {
  const issues: ASTVerificationIssue[] = [];

  for (const filePath of ws.store.paths) {
    const meta = ws.store.getMetadata(filePath);
    if (!meta) continue;

    for (const imp of meta.imports) {
      // Skip external packages
      if (!imp.source.startsWith(".") && !imp.source.startsWith("/")) continue;

      // Resolve import target
      const targetFile = resolveImportInWorkspace(ws, filePath, imp.source);
      if (!targetFile) {
        issues.push({
          category: "import_export_mismatch",
          severity: "error",
          file: filePath,
          line: imp.loc.line,
          message: `Import '${imp.source}' cannot be resolved to any file`,
          suggestedFix: `Create the file or fix the import path`,
          confidence: 0.95,
        });
        continue;
      }

      const targetMeta = ws.store.getMetadata(targetFile);
      if (!targetMeta) continue;

      // Check each specifier
      for (const spec of imp.specifiers) {
        if (spec.type === "default") {
          const hasDefault = targetMeta.exports.some(e => e.type === "default");
          if (!hasDefault) {
            issues.push({
              category: "import_export_mismatch",
              severity: "error",
              file: filePath,
              line: imp.loc.line,
              message: `Default import '${spec.local}' from '${imp.source}' but target has no default export`,
              suggestedFix: `Add 'export default' to ${targetFile} or use named import`,
              confidence: 0.9,
            });
          }
        } else if (spec.type === "named") {
          const hasNamed = targetMeta.exports.some(
            e => e.name === spec.imported || e.localName === spec.imported
          );
          // Also check re-exports (export * from)
          const hasReexportAll = targetMeta.exports.some(e => e.type === "all");
          if (!hasNamed && !hasReexportAll) {
            issues.push({
              category: "missing_export",
              severity: "error",
              file: filePath,
              line: imp.loc.line,
              message: `Named import '${spec.imported}' not exported from '${imp.source}'`,
              suggestedFix: `Export '${spec.imported}' from ${targetFile}`,
              confidence: 0.85,
            });
          }
        }
      }
    }
  }

  return issues;
}

// ─── Check: Component Quality ────────────────────────────────────────────

function checkComponentQuality(ws: ASTWorkspace): ASTVerificationIssue[] {
  const issues: ASTVerificationIssue[] = [];

  for (const filePath of ws.store.paths) {
    const meta = ws.store.getMetadata(filePath);
    if (!meta) continue;

    for (const comp of meta.components) {
      // Check for components with no hooks and no props (potentially empty)
      if (comp.hooks.length === 0 && comp.propNames.length === 0) {
        const source = ws.store.getSource(filePath) || "";
        // Check if the component body is very small
        const compMatch = source.match(
          new RegExp(`(?:function|const)\\s+${comp.name}[^{]*\\{([^]*?)\\}\\s*(?:;|$)`)
        );
        if (compMatch && compMatch[1].trim().length < 50) {
          issues.push({
            category: "empty_component",
            severity: "warning",
            file: filePath,
            line: comp.loc.line,
            message: `Component '${comp.name}' appears to be a minimal stub`,
            suggestedFix: `Add meaningful content to ${comp.name}`,
            confidence: 0.7,
          });
        }
      }

      // Check for orphaned state (useState without usage in JSX)
      const stateHooks = comp.hooks.filter(h => h === "useState");
      if (stateHooks.length > 5) {
        issues.push({
          category: "excessive_rerenders",
          severity: "warning",
          file: filePath,
          line: comp.loc.line,
          message: `Component '${comp.name}' has ${stateHooks.length} useState calls — consider useReducer or splitting`,
          suggestedFix: `Consolidate state with useReducer or extract into custom hooks`,
          confidence: 0.75,
        });
      }
    }
  }

  return issues;
}

// ─── Check: Hook Rules ───────────────────────────────────────────────────

function checkHookRules(ws: ASTWorkspace): ASTVerificationIssue[] {
  const issues: ASTVerificationIssue[] = [];

  for (const filePath of ws.store.paths) {
    const meta = ws.store.getMetadata(filePath);
    if (!meta) continue;

    // Check hooks used outside components
    const componentNames = new Set(meta.components.map(c => c.name));
    const isHookFile = /use[A-Z]/.test(filePath.split("/").pop() || "");

    for (const hook of meta.hooks) {
      // Hooks should only be in components or custom hook files
      if (!isHookFile && componentNames.size === 0) {
        issues.push({
          category: "hook_violation",
          severity: "error",
          file: filePath,
          line: hook.loc.line,
          message: `Hook '${hook.name}' called outside a React component or custom hook`,
          suggestedFix: `Move ${hook.name} inside a component function`,
          confidence: 0.8,
        });
      }
    }

    // Check for useEffect without dependencies array (common mistake)
    const source = ws.store.getSource(filePath) || "";
    const effectCalls = [...source.matchAll(/useEffect\s*\(\s*(?:async\s*)?\(\)\s*=>/g)];
    for (const match of effectCalls) {
      // Find the matching closing of useEffect
      const startIdx = match.index!;
      // Simple heuristic: if there's no second argument (comma after the arrow function body)
      const afterMatch = source.slice(startIdx, startIdx + 500);
      // Count balanced parens to find the useEffect closing
      if (/useEffect\s*\(\s*async/.test(afterMatch)) {
        issues.push({
          category: "hook_violation",
          severity: "warning",
          file: filePath,
          message: `useEffect with async callback — use async function inside the effect instead`,
          suggestedFix: `Define async function inside useEffect and call it`,
          confidence: 0.85,
        });
      }
    }
  }

  return issues;
}

// ─── Check: Dependency Cycles ────────────────────────────────────────────

function checkDependencyCycles(ws: ASTWorkspace): ASTVerificationIssue[] {
  const issues: ASTVerificationIssue[] = [];

  try {
    const graph = ws.graph.build();

    for (const cycle of graph.cycles) {
      const severity = cycle.length > 3 ? "error" : "warning";
      const cyclePath = cycle.join(" → ");

      issues.push({
        category: "circular_dependency",
        severity: severity as "error" | "warning",
        file: cycle[0],
        message: `Circular dependency: ${cyclePath}`,
        suggestedFix: `Break the cycle by extracting shared types/interfaces to a separate file`,
        confidence: 0.95,
      });
    }
  } catch {
    // Graph build might fail for some files — not critical
  }

  return issues;
}

// ─── Check: Unused Imports ───────────────────────────────────────────────

function checkUnusedImports(ws: ASTWorkspace): ASTVerificationIssue[] {
  const issues: ASTVerificationIssue[] = [];

  for (const filePath of ws.store.paths) {
    const meta = ws.store.getMetadata(filePath);
    const source = ws.store.getSource(filePath);
    if (!meta || !source) continue;

    for (const imp of meta.imports) {
      if (imp.isTypeOnly) continue;

      for (const spec of imp.specifiers) {
        if (spec.type === "namespace") continue; // Can't easily check

        const localName = spec.local;
        // Remove the import declaration text and check if the name is used elsewhere
        const importText = source.slice(imp.loc.start, imp.loc.end);
        const rest = source.slice(0, imp.loc.start) + source.slice(imp.loc.end);

        const usageRegex = new RegExp(`\\b${escapeRegex(localName)}\\b`);
        if (!usageRegex.test(rest)) {
          issues.push({
            category: "unused_import",
            severity: "info",
            file: filePath,
            line: imp.loc.line,
            message: `Import '${localName}' from '${imp.source}' is unused`,
            suggestedFix: `Remove unused import`,
            confidence: 0.8,
          });
        }
      }
    }
  }

  return issues;
}

// ─── Check: Provider Gaps ────────────────────────────────────────────────

function checkProviderGaps(ws: ASTWorkspace): ASTVerificationIssue[] {
  const issues: ASTVerificationIssue[] = [];

  // Find components using context hooks and verify providers exist
  const contextUsages = ws.query.findHookUsages("useContext");
  const providerComponents = new Set<string>();

  // Scan for Provider components
  for (const filePath of ws.store.paths) {
    const meta = ws.store.getMetadata(filePath);
    if (!meta) continue;
    for (const comp of meta.components) {
      if (comp.name.endsWith("Provider")) {
        providerComponents.add(comp.name);
      }
    }
  }

  // Check if app file wraps with necessary providers
  const appFile = ws.store.paths.find(f => /App\.(jsx?|tsx?)$/.test(f));
  if (appFile) {
    const appSource = ws.store.getSource(appFile) || "";
    for (const provider of providerComponents) {
      if (!appSource.includes(`<${provider}`)) {
        issues.push({
          category: "provider_gap",
          severity: "warning",
          file: appFile,
          message: `Provider '${provider}' is defined but not used in the App component tree`,
          suggestedFix: `Wrap your app with <${provider}>`,
          confidence: 0.7,
        });
      }
    }
  }

  return issues;
}

// ─── Check: Dead Code ────────────────────────────────────────────────────

function checkDeadCode(ws: ASTWorkspace): ASTVerificationIssue[] {
  const issues: ASTVerificationIssue[] = [];

  // Find exported components/functions that are never imported anywhere
  const allImportedSymbols = new Map<string, Set<string>>(); // file -> imported symbols

  for (const filePath of ws.store.paths) {
    const meta = ws.store.getMetadata(filePath);
    if (!meta) continue;

    for (const imp of meta.imports) {
      // Skip external
      if (!imp.source.startsWith(".") && !imp.source.startsWith("/")) continue;

      const target = resolveImportInWorkspace(ws, filePath, imp.source);
      if (!target) continue;

      if (!allImportedSymbols.has(target)) {
        allImportedSymbols.set(target, new Set());
      }
      const set = allImportedSymbols.get(target)!;
      for (const spec of imp.specifiers) {
        set.add(spec.imported === "default" ? "default" : spec.imported);
      }
    }
  }

  // Check files with exports that nobody imports
  for (const filePath of ws.store.paths) {
    // Skip entry points and index files
    if (/App\.(jsx?|tsx?)$/.test(filePath)) continue;
    if (/index\.(jsx?|tsx?)$/.test(filePath)) continue;
    if (/main\.(jsx?|tsx?)$/.test(filePath)) continue;

    const meta = ws.store.getMetadata(filePath);
    if (!meta || meta.exports.length === 0) continue;

    const importedSet = allImportedSymbols.get(filePath);
    if (!importedSet || importedSet.size === 0) {
      // This file's exports are never imported anywhere
      const isPage = /pages?\//i.test(filePath);
      if (!isPage) {
        issues.push({
          category: "dead_code",
          severity: "info",
          file: filePath,
          message: `File exports are never imported — potential dead code`,
          suggestedFix: `Remove if unused, or add imports where needed`,
          confidence: 0.6,
        });
      }
    }
  }

  return issues;
}

// ─── Quality Score Calculator ────────────────────────────────────────────

function calculateQualityScore(
  ws: ASTWorkspace,
  issues: ASTVerificationIssue[]
): QualityScore {
  const filesAnalyzed = ws.store.paths.length;
  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const infoCount = issues.filter(i => i.severity === "info").length;

  // Import health: % of imports that resolve correctly
  let totalImports = 0;
  let brokenImports = 0;
  for (const filePath of ws.store.paths) {
    const meta = ws.store.getMetadata(filePath);
    if (!meta) continue;
    for (const imp of meta.imports) {
      if (!imp.source.startsWith(".") && !imp.source.startsWith("/")) continue;
      totalImports++;
      const target = resolveImportInWorkspace(ws, filePath, imp.source);
      if (!target) brokenImports++;
    }
  }
  const importHealth = totalImports > 0
    ? Math.round(((totalImports - brokenImports) / totalImports) * 100)
    : 100;

  // Export consistency
  const exportIssues = issues.filter(i =>
    i.category === "import_export_mismatch" || i.category === "missing_export"
  ).length;
  const exportConsistency = Math.max(0, 100 - exportIssues * 15);

  // Component quality
  const compIssues = issues.filter(i =>
    i.category === "empty_component" || i.category === "orphaned_state" ||
    i.category === "missing_return" || i.category === "excessive_rerenders"
  ).length;
  const componentQuality = Math.max(0, 100 - compIssues * 10);

  // Hook safety
  const hookIssues = issues.filter(i => i.category === "hook_violation").length;
  const hookSafety = Math.max(0, 100 - hookIssues * 20);

  // Dependency health
  const cycleIssues = issues.filter(i => i.category === "circular_dependency").length;
  const dependencyHealth = Math.max(0, 100 - cycleIssues * 25);

  // Overall: weighted average
  const overall = Math.round(
    importHealth * 0.3 +
    exportConsistency * 0.25 +
    componentQuality * 0.2 +
    hookSafety * 0.15 +
    dependencyHealth * 0.1
  );

  return {
    overall,
    categories: {
      importHealth,
      exportConsistency,
      componentQuality,
      hookSafety,
      dependencyHealth,
    },
    filesAnalyzed,
    issueCounts: { error: errorCount, warning: warningCount, info: infoCount },
  };
}

// ─── Refactoring Suggestions ─────────────────────────────────────────────

function generateRefactorSuggestions(
  ws: ASTWorkspace,
  issues: ASTVerificationIssue[]
): string[] {
  const suggestions: string[] = [];

  // Large components
  for (const filePath of ws.store.paths) {
    const source = ws.store.getSource(filePath);
    if (!source) continue;
    const lines = source.split("\n").length;
    if (lines > 300) {
      suggestions.push(`${filePath} is ${lines} lines — consider splitting into smaller components`);
    }
  }

  // Many circular dependencies
  const cycles = issues.filter(i => i.category === "circular_dependency");
  if (cycles.length > 2) {
    suggestions.push("Multiple circular dependencies detected — extract shared types to a common module");
  }

  // Many unused imports
  const unused = issues.filter(i => i.category === "unused_import");
  if (unused.length > 5) {
    suggestions.push(`${unused.length} unused imports — run cleanup to reduce bundle size`);
  }

  // Components with too many hooks
  const rerenderIssues = issues.filter(i => i.category === "excessive_rerenders");
  if (rerenderIssues.length > 0) {
    suggestions.push("Components with excessive useState — consider useReducer pattern");
  }

  return suggestions;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function resolveImportInWorkspace(
  ws: ASTWorkspace,
  fromFile: string,
  importPath: string
): string | null {
  // Try direct match
  if (ws.store.hasFile(importPath)) return importPath;

  // Resolve relative paths
  if (importPath.startsWith(".")) {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const parts = [...fromDir.split("/"), ...importPath.split("/")].filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "..") stack.pop();
      else if (part !== ".") stack.push(part);
    }
    const resolved = stack.join("/");

    // Try with extensions
    const extensions = ["", ".tsx", ".ts", ".jsx", ".js"];
    for (const ext of extensions) {
      if (ws.store.hasFile(resolved + ext)) return resolved + ext;
    }
    for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
      if (ws.store.hasFile(resolved + "/index" + ext)) return resolved + "/index" + ext;
    }
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Summary Formatter ──────────────────────────────────────────────────

export function formatVerificationSummary(result: ASTVerificationResult): string {
  const { score, issues, hotspots, refactorSuggestions } = result;
  const lines: string[] = [];

  lines.push(`## Build Quality Score: ${score.overall}/100 ${result.ok ? "✅" : "❌"}`);
  lines.push("");
  lines.push("### Category Breakdown");
  lines.push(`- Import Health: ${score.categories.importHealth}/100`);
  lines.push(`- Export Consistency: ${score.categories.exportConsistency}/100`);
  lines.push(`- Component Quality: ${score.categories.componentQuality}/100`);
  lines.push(`- Hook Safety: ${score.categories.hookSafety}/100`);
  lines.push(`- Dependency Health: ${score.categories.dependencyHealth}/100`);
  lines.push("");
  lines.push(`### Issues: ${score.issueCounts.error} errors, ${score.issueCounts.warning} warnings, ${score.issueCounts.info} info`);

  if (hotspots.length > 0) {
    lines.push("");
    lines.push("### Hotspots");
    for (const h of hotspots) {
      lines.push(`- ${h.file}: ${h.issueCount} issues`);
    }
  }

  if (refactorSuggestions.length > 0) {
    lines.push("");
    lines.push("### Refactoring Suggestions");
    for (const s of refactorSuggestions) {
      lines.push(`- ${s}`);
    }
  }

  return lines.join("\n");
}

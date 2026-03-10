/**
 * Build Compiler v1.0 — Verification Layer
 * 
 * Never marks a build "complete" if the workspace is broken.
 * Runs static, structural, and domain checks.
 */

import { transform } from "sucrase";
import type { Workspace } from "./workspace";
import type { TaskGraph, VerificationResult, VerificationIssue, IssueCategory } from "./types";

// ─── Main Verification ────────────────────────────────────────────────────

export function verifyWorkspace(
  workspace: Workspace,
  taskGraph: TaskGraph
): VerificationResult {
  const issues: VerificationIssue[] = [];

  // 1. Static checks: syntax
  const syntaxResults = checkSyntax(workspace);
  issues.push(...syntaxResults.issues);

  // 2. Static checks: import resolution
  const importResults = checkImports(workspace);
  issues.push(...importResults.issues);

  // 3. Structural checks: all produces[] exist
  const producesResults = checkProducedFiles(workspace, taskGraph);
  issues.push(...producesResults.issues);

  // 4. Structural checks: empty stubs
  const stubResults = checkEmptyStubs(workspace);
  issues.push(...stubResults.issues);

  // 5. Structural checks: route existence
  const routeResults = checkRoutes(workspace);
  issues.push(...routeResults.issues);

  // Stats
  const files = workspace.listFiles();
  const jsFiles = files.filter(f => /\.(jsx?|tsx?)$/.test(f));
  const errorCount = issues.filter(i => i.severity === "error").length;

  return {
    ok: errorCount === 0,
    issues,
    stats: {
      totalFiles: files.length,
      parsedOk: syntaxResults.passed,
      parseFailed: syntaxResults.failed,
      importsResolved: importResults.resolved,
      importsBroken: importResults.broken,
      routesOk: routeResults.found,
      routesMissing: routeResults.missing,
    },
  };
}

// ─── Syntax Check ─────────────────────────────────────────────────────────

function checkSyntax(workspace: Workspace): {
  issues: VerificationIssue[];
  passed: number;
  failed: number;
} {
  const issues: VerificationIssue[] = [];
  let passed = 0;
  let failed = 0;

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;

    // Skip very small files (likely just re-exports)
    if (content.trim().length < 10) continue;

    try {
      transform(content, {
        transforms: ["jsx", "imports"],
        jsxRuntime: "automatic",
        filePath: path,
      });
      passed++;
    } catch (err: any) {
      failed++;
      issues.push({
        category: "syntax_error",
        severity: "error",
        file: path,
        line: err.loc?.line,
        message: err.message?.split("\n")[0] || "Syntax error",
      });
    }
  }

  return { issues, passed, failed };
}

// ─── Import Resolution Check ──────────────────────────────────────────────

function checkImports(workspace: Workspace): {
  issues: VerificationIssue[];
  resolved: number;
  broken: number;
} {
  const unresolved = workspace.findUnresolvedImports();
  const issues: VerificationIssue[] = unresolved.map(u => ({
    category: "broken_import" as IssueCategory,
    severity: "error" as const,
    file: u.file,
    message: `Cannot resolve import '${u.importPath}' (symbols: ${u.symbols.join(", ")})`,
    suggestedFix: `Create file ${u.importPath} or fix the import path`,
  }));

  // Count total imports to get resolved count
  const idx = workspace.index;
  let totalInternal = 0;
  for (const imports of Object.values(idx.imports)) {
    totalInternal += imports.filter(i =>
      i.from.startsWith(".") || i.from.startsWith("/") || i.from.startsWith("@/")
    ).length;
  }

  return {
    issues,
    resolved: totalInternal - unresolved.length,
    broken: unresolved.length,
  };
}

// ─── Produced Files Check ─────────────────────────────────────────────────

function checkProducedFiles(
  workspace: Workspace,
  taskGraph: TaskGraph
): { issues: VerificationIssue[] } {
  const issues: VerificationIssue[] = [];

  for (const task of taskGraph.tasks) {
    if (task.status === "skipped") continue;

    for (const expectedFile of task.produces) {
      // Try with and without extensions
      const exists = workspace.hasFile(expectedFile) ||
        workspace.hasFile(expectedFile + ".jsx") ||
        workspace.hasFile(expectedFile + ".tsx") ||
        workspace.hasFile(expectedFile + ".js");

      if (!exists) {
        issues.push({
          category: "missing_file",
          severity: "error",
          file: expectedFile,
          message: `Task '${task.label}' was expected to produce '${expectedFile}' but it doesn't exist`,
          suggestedFix: `Generate ${expectedFile} with the required exports`,
        });
      }
    }
  }

  return { issues };
}

// ─── Empty Stub Check ─────────────────────────────────────────────────────

function checkEmptyStubs(workspace: Workspace): {
  issues: VerificationIssue[];
} {
  const issues: VerificationIssue[] = [];
  const STUB_PATTERNS = [
    /loading\.\.\./i,
    /placeholder/i,
    /TODO:\s*implement/i,
    /stub/i,
  ];

  for (const path of workspace.listFiles()) {
    if (!/\.(jsx?|tsx?)$/.test(path)) continue;
    const content = workspace.getFile(path)!;

    // Very short files with stub-like content
    if (content.length < 200 && STUB_PATTERNS.some(p => p.test(content))) {
      issues.push({
        category: "empty_stub",
        severity: "warning",
        file: path,
        message: `File appears to be an empty stub: ${path}`,
        suggestedFix: `Generate real implementation for ${path}`,
      });
    }
  }

  return { issues };
}

// ─── Route Check ──────────────────────────────────────────────────────────

function checkRoutes(workspace: Workspace): {
  issues: VerificationIssue[];
  found: number;
  missing: number;
} {
  const issues: VerificationIssue[] = [];
  let found = 0;
  let missing = 0;

  const appFile = workspace.getFile("/App.jsx") || workspace.getFile("/App.tsx") || "";
  if (!appFile) return { issues, found: 0, missing: 0 };

  // Extract route paths from App.jsx
  const routeRegex = /path=["']([^"']+)["']/g;
  let match;
  while ((match = routeRegex.exec(appFile)) !== null) {
    const routePath = match[1];
    if (routePath === "*") continue;

    // Extract component name from element={<ComponentName />}
    const routeArea = appFile.substring(Math.max(0, match.index - 200), match.index + match[0].length + 200);
    const componentMatch = routeArea.match(/element=\{[^}]*<(\w+)/);
    if (componentMatch) {
      const componentName = componentMatch[1];
      // Check if this component is imported
      const importRegex = new RegExp(`import\\s+.*${componentName}.*from\\s+['"]([^'"]+)['"]`);
      const importMatch = appFile.match(importRegex);

      if (importMatch) {
        const importPath = importMatch[1];
        const resolved = workspace.resolveImport("/App.jsx", importPath);
        if (resolved && workspace.hasFile(resolved)) {
          found++;
        } else {
          missing++;
          issues.push({
            category: "missing_route" as const,
            severity: "error",
            file: "/App.jsx",
            message: `Route '${routePath}' references component '${componentName}' imported from '${importPath}' which doesn't exist`,
            suggestedFix: `Create ${importPath}.jsx with a ${componentName} component`,
          });
        }
      }
    }
  }

  return { issues, found, missing };
}

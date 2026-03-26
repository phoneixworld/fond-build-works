/**
 * AST Bridge — Pillar 2, Component 1
 * 
 * Connects the build orchestrator to the AST workspace.
 * Every time files are committed to the preview, they are also
 * parsed and indexed in the AST store for surgical editing,
 * dependency tracking, and provenance mapping.
 */

import { createASTWorkspace, type ASTWorkspace } from "@/lib/ast";

// ─── Singleton AST Workspace ─────────────────────────────────────────────

let _workspace: ASTWorkspace | null = null;

/**
 * Get or create the singleton AST workspace.
 * Called once at app boot; persists across builds.
 */
export function getASTWorkspace(): ASTWorkspace {
  if (!_workspace) {
    _workspace = createASTWorkspace();
    console.log("[ASTBridge] Created singleton AST workspace");
  }
  return _workspace;
}

/**
 * Reset the workspace (used on project switch or clear).
 */
export function resetASTWorkspace(): void {
  if (_workspace) {
    _workspace.store.clear();
    _workspace.graph.invalidate();
  }
  _workspace = null;
}

// ─── Index Files Into AST ────────────────────────────────────────────────

export interface IndexResult {
  parsed: number;
  errors: number;
  components: number;
  totalExports: number;
  cycles: number;
}

/**
 * Index a set of files into the AST workspace.
 * Called after every build/edit cycle when files are committed.
 */
export function indexFilesIntoAST(files: Record<string, string>): IndexResult {
  const ws = getASTWorkspace();
  const startTime = performance.now();

  // Parse all files
  const { parsed, errors } = ws.store.setFiles(files);

  // Rebuild dependency graph
  const graph = ws.graph.build();

  // Collect stats
  const allComponents = ws.store.findAllComponents();
  const allExports = ws.store.findAllExports();

  const result: IndexResult = {
    parsed,
    errors,
    components: allComponents.length,
    totalExports: allExports.length,
    cycles: graph.cycles.length,
  };

  const elapsed = (performance.now() - startTime).toFixed(1);
  console.log(
    `[ASTBridge] Indexed ${parsed} files in ${elapsed}ms — ` +
    `${result.components} components, ${result.totalExports} exports, ${result.cycles} cycles`
  );

  if (graph.cycles.length > 0) {
    console.warn("[ASTBridge] Circular dependencies detected:", graph.cycles.map(c => c.join(" → ")));
  }

  return result;
}

/**
 * Get a compact workspace summary for context injection.
 */
export function getWorkspaceSummary(): string {
  const ws = getASTWorkspace();
  return ws.store.getSummary();
}

/**
 * Get impacted files when a file changes (for targeted rebuilds).
 */
export function getImpactedFiles(filePath: string): string[] {
  const ws = getASTWorkspace();
  return ws.graph.getImpactedFiles(filePath);
}

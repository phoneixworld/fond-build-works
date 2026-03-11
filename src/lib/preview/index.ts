/**
 * Phoenix Preview Architecture — Public API
 * 
 * Single entry point for the preview system.
 * Backward-compatible with the old buildESMPreview interface.
 */

export type {
  PreviewSession,
  PreviewBuildResult,
  PreviewEngine,
  PreviewEngineType,
  PreviewDiagnostic,
  PreviewMetrics,
  WorkspaceSnapshot,
  ImportMapProvider,
  BareImport,
  CompiledModule,
  PreviewOrchestratorConfig,
} from "./types";

export { DEFAULT_ORCHESTRATOR_CONFIG } from "./types";
export { ESMPreviewEngine } from "./esmPreviewEngine";
export { PreviewOrchestrator, getOrchestrator, resetOrchestrator, materializeSnapshot } from "./previewOrchestrator";
export { CdnImportMapProvider, buildImportMap, scanBareImports } from "./importMapResolver";
export { compileFile, compileWorkspace, rewriteToRegistry, resetUidCounter } from "./esmCompiler";
export { generateHtmlShell, generateErrorPage } from "./htmlShellGenerator";

// ─── Backward-Compatible API ────────────────────────────────────────────────

import { getOrchestrator } from "./previewOrchestrator";

export interface ESMBuildResult {
  html: string;
  fileCount: number;
  errors: string[];
  sessionId?: string;
  complexity?: number;
  buildDurationMs?: number;
  modules?: Record<string, string>;
}

/**
 * Drop-in replacement for the old buildESMPreview function.
 * Routes through the new orchestrator but returns the same shape.
 */
export function buildESMPreview(
  files: Record<string, string>,
  extraDeps?: Record<string, string>,
  projectId?: string,
  supabaseUrl?: string,
  supabaseKey?: string
): ESMBuildResult {
  const orchestrator = getOrchestrator({
    supabase: supabaseUrl && supabaseKey ? { url: supabaseUrl, anonKey: supabaseKey } : undefined,
  });

  const { session, result } = orchestrator.createSession(
    files,
    extraDeps || {},
    projectId || "",
    supabaseUrl && supabaseKey ? { url: supabaseUrl, anonKey: supabaseKey } : undefined
  );

  return {
    html: result.htmlShell,
    fileCount: result.metrics.moduleCount,
    errors: result.diagnostics
      .filter(d => d.severity === "error")
      .map(d => d.message),
    sessionId: session.id,
    complexity: session.complexityScore,
    buildDurationMs: result.metrics.buildDurationMs,
    modules: result.modules,
  };
}

/** No-op kept for API compatibility */
export function revokeBlobUrls(_html: string): void {}

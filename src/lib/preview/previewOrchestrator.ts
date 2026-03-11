/**
 * Phoenix Preview Orchestrator
 * 
 * Central coordinator for preview sessions:
 * - Engine selection (ESM / Sandpack / future Vite)
 * - Workspace snapshot materialization
 * - Session lifecycle management
 * - Complexity scoring
 * - Telemetry aggregation
 */

import type {
  PreviewSession,
  PreviewBuildResult,
  PreviewOrchestratorConfig,
  WorkspaceSnapshot,
  PreviewEngine,
  PreviewDiagnostic,
  PreviewEngineType,
} from "./types";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "./types";
import { ESMPreviewEngine } from "./esmPreviewEngine";
import { VitePreviewEngine } from "./vitePreviewEngine";

// ─── Complexity Scoring ─────────────────────────────────────────────────────

function computeComplexityScore(files: Record<string, string>): number {
  const keys = Object.keys(files);
  const jsFiles = keys.filter(k => /\.(jsx?|tsx?)$/.test(k));
  let score = 0;

  // File count factor (0–30)
  score += Math.min(30, jsFiles.length * 1.5);

  // Total size factor (0–20)
  const totalSize = Object.values(files).reduce((s, c) => s + c.length, 0);
  score += Math.min(20, totalSize / 10000);

  // Routing complexity (0–15)
  const hasRouting = Object.values(files).some(c =>
    c.includes("react-router") || c.includes("BrowserRouter") || c.includes("Routes")
  );
  if (hasRouting) score += 15;

  // Provider depth (0–10)
  const providerCount = Object.values(files).reduce((count, code) => {
    return count + (code.match(/Provider>/g) || []).length;
  }, 0);
  score += Math.min(10, providerCount * 2);

  // Auth complexity (0–10)
  const hasAuth = Object.values(files).some(c =>
    c.includes("AuthContext") || c.includes("useAuth") || c.includes("ProtectedRoute")
  );
  if (hasAuth) score += 10;

  // External dependency count (0–15)
  const externalImports = new Set<string>();
  for (const code of Object.values(files)) {
    const matches = code.matchAll(/from\s+['"]([^./][^'"]*)['"]/g);
    for (const m of matches) externalImports.add(m[1]);
  }
  score += Math.min(15, externalImports.size);

  return Math.min(100, Math.round(score));
}

function detectFeatures(files: Record<string, string>): { hasRouting: boolean; hasAuth: boolean } {
  const allCode = Object.values(files).join("\n");
  return {
    hasRouting: /react-router|BrowserRouter|Routes/.test(allCode),
    hasAuth: /AuthContext|useAuth|ProtectedRoute/.test(allCode),
  };
}

// ─── Entry Point Detection ──────────────────────────────────────────────────

function detectEntryFile(files: Record<string, string>): string | null {
  const keys = Object.keys(files);
  const candidates = [
    "/App.tsx", "/App.jsx", "/App.js", "/App.ts",
    "/src/App.tsx", "/src/App.jsx", "/src/App.js", "/src/App.ts",
  ];
  for (const c of candidates) {
    const normalized = keys.find(k => {
      const n = k.startsWith("/") ? k : `/${k}`;
      return n === c;
    });
    if (normalized) return normalized;
  }
  return keys.find(k => /\/App\.(tsx?|jsx?)$/.test(k)) || null;
}

// ─── Workspace Snapshot ─────────────────────────────────────────────────────

export function materializeSnapshot(
  files: Record<string, string>,
  dependencies: Record<string, string>,
  projectId: string,
  supabaseUrl?: string,
  supabaseKey?: string
): WorkspaceSnapshot {
  const totalSize = Object.values(files).reduce((s, c) => s + c.length, 0);
  const features = detectFeatures(files);

  return {
    files,
    dependencies,
    projectId,
    fileCount: Object.keys(files).length,
    totalSizeBytes: totalSize,
    complexityScore: computeComplexityScore(files),
    hasRouting: features.hasRouting,
    hasAuth: features.hasAuth,
    entryFile: detectEntryFile(files),
    supabaseUrl,
    supabaseKey,
  };
}

// ─── Preview Orchestrator ───────────────────────────────────────────────────

let sessionCounter = 0;

export class PreviewOrchestrator {
  private config: PreviewOrchestratorConfig;
  private engines: Map<PreviewEngineType, PreviewEngine> = new Map();
  private sessions: Map<string, PreviewSession> = new Map();

  constructor(config?: Partial<PreviewOrchestratorConfig>) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };

    // Register default engines
    this.engines.set("esm", new ESMPreviewEngine(this.config.cdnBaseUrl));
    this.engines.set("vite", new VitePreviewEngine(this.config.cdnBaseUrl));
  }

  /** Register a custom engine (e.g., future Vite engine) */
  registerEngine(engine: PreviewEngine): void {
    this.engines.set(engine.name, engine);
  }

  /** Select the best engine for a given snapshot */
  selectEngine(snapshot: WorkspaceSnapshot): PreviewEngine {
    // Try engines in preference order
    const preferenceOrder: PreviewEngineType[] = ["esm", "vite", "sandpack"];

    for (const engineType of preferenceOrder) {
      const engine = this.engines.get(engineType);
      if (engine && engine.canHandle(snapshot)) {
        return engine;
      }
    }

    // Fallback to ESM
    return this.engines.get("esm")!;
  }

  /** Create a preview session and build */
  createSession(
    files: Record<string, string>,
    dependencies: Record<string, string>,
    projectId: string,
    supabaseConfig?: { url: string; anonKey: string }
  ): { session: PreviewSession; result: PreviewBuildResult } {
    // 1. Materialize snapshot
    const snapshot = materializeSnapshot(files, dependencies, projectId, supabaseConfig?.url, supabaseConfig?.anonKey);

    // 2. Validate limits
    const limitDiags = this.validateLimits(snapshot);

    // 3. Select engine
    const engine = this.selectEngine(snapshot);

    // 4. Create session
    const sessionId = `ps_${++sessionCounter}_${Date.now().toString(36)}`;
    const session: PreviewSession = {
      id: sessionId,
      workspaceId: projectId,
      engine: engine.name,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      status: "initializing",
      entryUrl: "",
      complexityScore: snapshot.complexityScore,
      diagnostics: limitDiags,
      metrics: {
        buildStartMs: 0, buildEndMs: 0, buildDurationMs: 0,
        fileCount: snapshot.fileCount, moduleCount: 0,
        dependencyCount: Object.keys(dependencies).length,
        totalSizeBytes: snapshot.totalSizeBytes,
        errorCount: 0, warningCount: 0,
      },
    };

    // 5. Build
    const result = engine.build(session, snapshot);

    // 6. Update session
    session.status = result.diagnostics.some(d => d.severity === "error" && d.category === "entrypoint-missing")
      ? "error"
      : "ready";
    session.diagnostics = [...limitDiags, ...result.diagnostics];
    session.metrics = result.metrics;

    this.sessions.set(sessionId, session);

    console.log(
      `[Phoenix Orchestrator] Session ${sessionId}: engine=${engine.name}, ` +
      `complexity=${snapshot.complexityScore}, status=${session.status}, ` +
      `build=${result.metrics.buildDurationMs}ms`
    );

    return { session, result };
  }

  /** Get an existing session */
  getSession(sessionId: string): PreviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Touch session to extend TTL */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
    }
  }

  /** Clean up expired sessions */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt > this.config.sessionTtlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  private validateLimits(snapshot: WorkspaceSnapshot): PreviewDiagnostic[] {
    const diags: PreviewDiagnostic[] = [];

    if (snapshot.fileCount > this.config.maxFiles) {
      diags.push({
        severity: "warning",
        category: "complexity-warning",
        message: `File count (${snapshot.fileCount}) exceeds limit (${this.config.maxFiles})`,
        timestamp: Date.now(),
      });
    }

    if (snapshot.totalSizeBytes > this.config.maxTotalSize) {
      diags.push({
        severity: "warning",
        category: "complexity-warning",
        message: `Total size (${(snapshot.totalSizeBytes / 1024).toFixed(0)}KB) exceeds limit (${(this.config.maxTotalSize / 1024).toFixed(0)}KB)`,
        timestamp: Date.now(),
      });
    }

    return diags;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _orchestrator: PreviewOrchestrator | null = null;

export function getOrchestrator(config?: Partial<PreviewOrchestratorConfig>): PreviewOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new PreviewOrchestrator(config);
  }
  return _orchestrator;
}

export function resetOrchestrator(): void {
  _orchestrator = null;
}

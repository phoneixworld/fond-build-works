/**
 * Phoenix Vite Preview Component
 * 
 * Renders the preview iframe backed by the VFS Service Worker.
 * Handles:
 * - SW registration + smoke tests on mount
 * - File sync to SW on sandpackFiles change
 * - Automatic fallback to Sandpack if SW fails
 * - Error/diagnostic display
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { AlertTriangle, RefreshCw, Activity, Zap } from "lucide-react";
import { VitePreviewEngine } from "@/lib/preview/vitePreviewEngine";
import {
  registerVFS,
  updateFiles,
  isReady as isSwReady,
  getPreviewUrl,
  healthCheck,
} from "@/lib/preview/vfsServiceWorkerClient";
import { runSmokeTests, type SmokeTestResult } from "@/lib/preview/viteSmokeTest";
import type { PreviewDiagnostic } from "@/lib/preview/types";

interface VitePreviewProps {
  viewport?: { width: string; maxWidth: string };
  initialPath?: string;
  onFallback?: (reason: string) => void;
}

type EngineState =
  | { status: "initializing" }
  | { status: "smoke-testing"; progress: string }
  | { status: "ready" }
  | { status: "error"; message: string }
  | { status: "fallback"; reason: string };

const engine = new VitePreviewEngine();

const VitePreview = ({ viewport, initialPath, onFallback }: VitePreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { sandpackFiles, sandpackDeps, isBuilding, setPreviewMode } = usePreview();
  const { currentProject } = useProjects();
  const [engineState, setEngineState] = useState<EngineState>({ status: "initializing" });
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [bootMetrics, setBootMetrics] = useState<{ bootDurationMs?: number; moduleCount?: number } | null>(null);
  const [smokeResult, setSmokeResult] = useState<SmokeTestResult | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const prevFilesRef = useRef<string | null>(null);

  const projectId = currentProject?.id || "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  // ── Initialize: Register SW + Run Smoke Tests ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setEngineState({ status: "initializing" });

      // 1. Register SW
      const registered = await registerVFS();
      if (cancelled) return;

      if (!registered) {
        const reason = "Service Worker registration failed";
        setEngineState({ status: "fallback", reason });
        onFallback?.(reason);
        return;
      }

      // 2. Run smoke tests (hard gate)
      setEngineState({ status: "smoke-testing", progress: "Running diagnostics..." });
      const result = await runSmokeTests();
      if (cancelled) return;

      setSmokeResult(result);

      if (!result.passed) {
        const reason = result.failReason || "Smoke tests failed";
        console.warn("[VitePreview] Smoke tests failed, falling back to Sandpack:", reason);
        setEngineState({ status: "fallback", reason });
        onFallback?.(reason);
        return;
      }

      setEngineState({ status: "ready" });
      console.log("[VitePreview] Engine ready, smoke tests passed");
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-fallback: switch to Sandpack mode ──
  useEffect(() => {
    if (engineState.status === "fallback") {
      // Give UI a moment to show the fallback message, then switch
      const timer = setTimeout(() => {
        setPreviewMode("webcontainer");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [engineState.status, setPreviewMode]);

  // ── Sync files to SW when sandpackFiles change ──
  useEffect(() => {
    if (engineState.status !== "ready") return;
    if (!sandpackFiles || Object.keys(sandpackFiles).length === 0) return;

    const filesKey = Object.keys(sandpackFiles).sort().join(",");
    if (filesKey === prevFilesRef.current) return;
    prevFilesRef.current = filesKey;

    async function syncFiles() {
      try {
        // Build with Vite engine (compile + rewrite imports)
        const snapshot = {
          files: sandpackFiles!,
          dependencies: sandpackDeps,
          projectId,
          fileCount: Object.keys(sandpackFiles!).length,
          totalSizeBytes: Object.values(sandpackFiles!).reduce((s, c) => s + c.length, 0),
          complexityScore: 0,
          hasRouting: false,
          hasAuth: false,
          entryFile: null,
          supabaseUrl,
          supabaseKey,
        };

        const session = {
          id: `vite_${Date.now()}`,
          workspaceId: projectId,
          engine: "vite" as const,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          status: "initializing" as const,
          entryUrl: "",
          complexityScore: 0,
          diagnostics: [],
          metrics: {
            buildStartMs: 0, buildEndMs: 0, buildDurationMs: 0,
            fileCount: 0, moduleCount: 0, dependencyCount: 0,
            totalSizeBytes: 0, errorCount: 0, warningCount: 0,
          },
        };

        const result = engine.build(session, snapshot);

        // Send compiled files to SW
        await updateFiles(result.modules, projectId);

        // Set iframe src to trigger load
        setIframeSrc(getPreviewUrl() + "?t=" + Date.now());
        setIframeError(null);
      } catch (e: any) {
        console.error("[VitePreview] File sync error:", e);
        setIframeError(e.message);
      }
    }

    syncFiles();
  }, [sandpackFiles, sandpackDeps, projectId, supabaseUrl, supabaseKey, engineState.status]);

  // ── Listen for iframe messages ──
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "preview-error") {
        setIframeError(e.data.msg);
      }
      if (e.data?.type === "preview-ready") {
        setIframeError(null);
        if (e.data.metrics) {
          setBootMetrics(e.data.metrics);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleRetry = useCallback(() => {
    setIframeError(null);
    prevFilesRef.current = null; // Force re-sync
    setIframeSrc(getPreviewUrl() + "?t=" + Date.now());
  }, []);

  // ── Render: Initializing ──
  if (engineState.status === "initializing" || engineState.status === "smoke-testing") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Initializing Vite Engine</p>
            <p className="text-xs text-muted-foreground mt-1">
              {engineState.status === "smoke-testing"
                ? (engineState as any).progress
                : "Registering service worker..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Fallback ──
  if (engineState.status === "fallback") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-3 max-w-sm px-6">
          <div className="w-10 h-10 mx-auto rounded-xl bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Switching to compatible mode</p>
            <p className="text-xs text-muted-foreground mt-1">{engineState.reason}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Error ──
  if (engineState.status === "error") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-6">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-sm text-foreground">{engineState.message}</p>
          <button onClick={handleRetry} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Ready ──
  if (!iframeSrc) return null;

  return (
    <div
      className="h-full w-full flex flex-col"
      style={viewport ? { width: viewport.width, maxWidth: viewport.maxWidth } : undefined}
    >
      {iframeError && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{iframeError}</span>
        </div>
      )}
      {bootMetrics && (
        <div className="px-3 py-1 bg-muted/50 border-b border-border text-[10px] text-muted-foreground flex items-center gap-2">
          <Activity className="w-3 h-3" />
          <span>⚡ Vite · Boot: {bootMetrics.bootDurationMs}ms</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="w-full flex-1 border-0 bg-white"
        title="Phoenix Vite Preview"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        style={viewport && viewport.width !== "100%" ? { borderRadius: 8 } : undefined}
      />
    </div>
  );
};

export default VitePreview;

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import type { BuildMetrics } from "@/lib/buildObservability";

export interface SandpackFileSet {
  [path: string]: string;
}

// ─── Rollback Snapshots ───────────────────────────────────────────────────

export interface BuildSnapshot {
  files: SandpackFileSet;
  deps: Record<string, string>;
  timestamp: number;
  label: string;
}

const MAX_SNAPSHOTS = 10;

export type ViewportId = "desktop" | "tablet" | "mobile";

interface PreviewContextType {
  // Legacy HTML preview
  previewHtml: string;
  setPreviewHtml: (html: string) => void;
  // Sandpack React preview
  sandpackFiles: SandpackFileSet | null;
  setSandpackFiles: (files: SandpackFileSet | null) => void;
  sandpackDeps: Record<string, string>;
  setSandpackDeps: (deps: Record<string, string>) => void;
  // Build state
  isBuilding: boolean;
  setIsBuilding: (building: boolean) => void;
  buildStep: string;
  setBuildStep: (step: string) => void;
  // Mode
  previewMode: "html" | "sandpack" | "esm" | "vite";
  setPreviewMode: (mode: "html" | "sandpack" | "esm" | "vite") => void;
  // Build metrics for timeline
  buildMetrics: BuildMetrics | null;
  setBuildMetrics: (metrics: BuildMetrics | null) => void;
  // Rollback snapshots
  snapshots: BuildSnapshot[];
  saveSnapshot: (label: string) => void;
  restoreSnapshot: (index: number) => void;
  // Viewport & refresh (shared with header)
  viewport: ViewportId;
  setViewport: (vp: ViewportId) => void;
  refreshKey: number;
  triggerRefresh: () => void;
  currentPath: string;
  setCurrentPath: (path: string) => void;
}

const PreviewContext = createContext<PreviewContextType | null>(null);

export const PreviewProvider = ({ children }: { children: ReactNode }) => {
  const [previewHtml, setPreviewHtml] = useState("");
  const [sandpackFilesState, setSandpackFilesState] = useState<SandpackFileSet | null>(null);
  const [sandpackDeps, setSandpackDeps] = useState<Record<string, string>>({});
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState("");
  const [previewMode, setPreviewMode] = useState<"html" | "sandpack" | "esm" | "vite">("html");
  const [buildMetrics, setBuildMetrics] = useState<BuildMetrics | null>(null);
  const [snapshots, setSnapshots] = useState<BuildSnapshot[]>([]);
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentPath, setCurrentPath] = useState("/");

  const sanitizeSandpackFiles = useCallback((files: SandpackFileSet | null): SandpackFileSet | null => {
    if (!files) return null;
    const sanitized: SandpackFileSet = {};

    for (const [rawPath, rawContent] of Object.entries(files)) {
      if (typeof rawPath !== "string") continue;
      const trimmedPath = rawPath.trim();
      if (!trimmedPath) continue;
      if (/^(null|undefined)$/i.test(trimmedPath) || /\/(?:null|undefined)$/i.test(trimmedPath)) {
        console.warn(`[PreviewContext] Dropping invalid sandpack path: ${trimmedPath}`);
        continue;
      }
      if (typeof rawContent !== "string") {
        console.warn(`[PreviewContext] Dropping non-string sandpack file content for ${trimmedPath}`);
        continue;
      }

      const normalizedPath = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
      sanitized[normalizedPath] = rawContent;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }, []);

  const setSandpackFiles = useCallback((files: SandpackFileSet | null) => {
    setSandpackFilesState(sanitizeSandpackFiles(files));
  }, [sanitizeSandpackFiles]);

  const saveSnapshot = useCallback((label: string) => {
    if (!sandpackFilesState) return;
    setSnapshots(prev => {
      const snapshot: BuildSnapshot = {
        files: { ...sandpackFilesState },
        deps: { ...sandpackDeps },
        timestamp: Date.now(),
        label,
      };
      const updated = [...prev, snapshot];
      // Keep only last N snapshots
      return updated.slice(-MAX_SNAPSHOTS);
    });
  }, [sandpackFilesState, sandpackDeps]);

  const restoreSnapshot = useCallback((index: number) => {
    setSnapshots(prev => {
      const snapshot = prev[index];
      if (!snapshot) return prev;
      setSandpackFiles({ ...snapshot.files });
      setSandpackDeps({ ...snapshot.deps });
      return prev;
    });
  }, []);

  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const contextValue = useMemo(() => ({
    previewHtml, setPreviewHtml,
    sandpackFiles: sandpackFilesState, setSandpackFiles,
    sandpackDeps, setSandpackDeps,
    isBuilding, setIsBuilding,
    buildStep, setBuildStep,
    previewMode, setPreviewMode,
    buildMetrics, setBuildMetrics,
    snapshots, saveSnapshot, restoreSnapshot,
    viewport, setViewport,
    refreshKey, triggerRefresh,
    currentPath, setCurrentPath,
  }), [
    previewHtml, sandpackFilesState, sandpackDeps, isBuilding, buildStep,
    previewMode, buildMetrics, snapshots, saveSnapshot, restoreSnapshot,
    viewport, refreshKey, triggerRefresh, currentPath,
  ]);

  return (
    <PreviewContext.Provider value={contextValue}>
      {children}
    </PreviewContext.Provider>
  );
};

export const usePreview = () => {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
};

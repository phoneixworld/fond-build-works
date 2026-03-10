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
  previewMode: "html" | "sandpack";
  setPreviewMode: (mode: "html" | "sandpack") => void;
  // Build metrics for timeline
  buildMetrics: BuildMetrics | null;
  setBuildMetrics: (metrics: BuildMetrics | null) => void;
  // Rollback snapshots
  snapshots: BuildSnapshot[];
  saveSnapshot: (label: string) => void;
  restoreSnapshot: (index: number) => void;
}

const PreviewContext = createContext<PreviewContextType | null>(null);

export const PreviewProvider = ({ children }: { children: ReactNode }) => {
  const [previewHtml, setPreviewHtml] = useState("");
  const [sandpackFiles, setSandpackFiles] = useState<SandpackFileSet | null>(null);
  const [sandpackDeps, setSandpackDeps] = useState<Record<string, string>>({});
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState("");
  const [previewMode, setPreviewMode] = useState<"html" | "sandpack">("html");
  const [buildMetrics, setBuildMetrics] = useState<BuildMetrics | null>(null);
  const [snapshots, setSnapshots] = useState<BuildSnapshot[]>([]);

  const saveSnapshot = useCallback((label: string) => {
    if (!sandpackFiles) return;
    setSnapshots(prev => {
      const snapshot: BuildSnapshot = {
        files: { ...sandpackFiles },
        deps: { ...sandpackDeps },
        timestamp: Date.now(),
        label,
      };
      const updated = [...prev, snapshot];
      // Keep only last N snapshots
      return updated.slice(-MAX_SNAPSHOTS);
    });
  }, [sandpackFiles, sandpackDeps]);

  const restoreSnapshot = useCallback((index: number) => {
    setSnapshots(prev => {
      const snapshot = prev[index];
      if (!snapshot) return prev;
      setSandpackFiles({ ...snapshot.files });
      setSandpackDeps({ ...snapshot.deps });
      return prev;
    });
  }, []);

  return (
    <PreviewContext.Provider value={{
      previewHtml, setPreviewHtml,
      sandpackFiles, setSandpackFiles,
      sandpackDeps, setSandpackDeps,
      isBuilding, setIsBuilding,
      buildStep, setBuildStep,
      previewMode, setPreviewMode,
      buildMetrics, setBuildMetrics,
      snapshots, saveSnapshot, restoreSnapshot,
    }}>
      {children}
    </PreviewContext.Provider>
  );
};

export const usePreview = () => {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
};

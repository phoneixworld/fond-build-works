import { createContext, useContext, useState, ReactNode } from "react";
import type { BuildMetrics } from "@/lib/buildObservability";

export interface SandpackFileSet {
  [path: string]: string;
}

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

  return (
    <PreviewContext.Provider value={{
      previewHtml, setPreviewHtml,
      sandpackFiles, setSandpackFiles,
      sandpackDeps, setSandpackDeps,
      isBuilding, setIsBuilding,
      buildStep, setBuildStep,
      previewMode, setPreviewMode,
      buildMetrics, setBuildMetrics,
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

import { useRef, useEffect, useMemo, useState } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { buildESMPreview, revokeBlobUrls } from "@/lib/esmPreviewBuilder";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Check if the workspace has a real App entry point or enough files to render */
function hasAppEntry(files: Record<string, string> | null): boolean {
  if (!files) return false;
  const keys = Object.keys(files);
  const hasExplicitApp = keys.some(p => {
    const normalized = p.replace(/^\/+/, '/');
    return /\/?(?:src\/)?App\.(tsx?|jsx?)$/.test(normalized) || 
           normalized === '/App.jsx' || normalized === '/App.tsx' ||
           normalized === '/App.js' || normalized === '/App.ts';
  });
  if (hasExplicitApp) return true;
  const jsxFiles = keys.filter(p => /\.(jsx?|tsx?)$/.test(p));
  return jsxFiles.length >= 2;
}

interface ESMPreviewProps {
  viewport?: { width: string; maxWidth: string };
  initialPath?: string;
}

const ESMPreview = ({ viewport, initialPath }: ESMPreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { sandpackFiles, sandpackDeps, isBuilding } = usePreview();
  const { currentProject } = useProjects();
  const [error, setError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const prevHtmlRef = useRef<string | null>(null);

  const projectId = currentProject?.id || "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  const ready = hasAppEntry(sandpackFiles);
  
  if (sandpackFiles && Object.keys(sandpackFiles).length > 0 && !ready) {
    console.warn("[ESMPreview] Files present but no App entry found. File keys:", Object.keys(sandpackFiles));
  }

  // Listen for errors from inside the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "esm-preview-error") {
        console.error("[ESMPreview] Iframe error:", e.data.message);
        setIframeError(e.data.message);
      }
      if (e.data?.type === "preview-ready") {
        setIframeError(null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const buildResult = useMemo(() => {
    if (!ready || !sandpackFiles) return null;
    
    try {
      const result = buildESMPreview(
        sandpackFiles,
        sandpackDeps,
        projectId,
        supabaseUrl,
        supabaseKey
      );
      console.log("[ESMPreview] Build result: fileCount=", result.fileCount, "errors=", result.errors, "htmlLength=", result.html?.length);
      setError(null);
      setIframeError(null);
      return result;
    } catch (e: any) {
      console.error("[ESMPreview] Build exception:", e);
      setError(e.message);
      return null;
    }
  }, [ready, sandpackFiles, sandpackDeps, projectId, supabaseUrl, supabaseKey]);

  useEffect(() => {
    return () => {
      if (prevHtmlRef.current) {
        revokeBlobUrls(prevHtmlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (buildResult?.html) {
      if (prevHtmlRef.current) {
        revokeBlobUrls(prevHtmlRef.current);
      }
      prevHtmlRef.current = buildResult.html;
    }
  }, [buildResult?.html]);

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-6">
          <div className="w-12 h-12 mx-auto rounded-xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Preview Build Error</h3>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!buildResult?.html) {
    return null;
  }

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
      <iframe
        ref={iframeRef}
        srcDoc={buildResult.html}
        className="w-full flex-1 border-0 bg-white"
        title="ESM Preview"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        style={viewport && viewport.width !== "100%" ? { borderRadius: 8 } : undefined}
      />
    </div>
  );
};

export default ESMPreview;

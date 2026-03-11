import { useRef, useEffect, useMemo, useState } from "react";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { buildESMPreview, revokeBlobUrls } from "@/lib/esmPreviewBuilder";
import { AlertTriangle, RefreshCw } from "lucide-react";

/** Check if the workspace has a real App entry point */
function hasAppEntry(files: Record<string, string> | null): boolean {
  if (!files) return false;
  return Object.keys(files).some(p => {
    const normalized = p.replace(/^\/+/, '/');
    return /\/?(?:src\/)?App\.(tsx?|jsx?)$/.test(normalized) || 
           normalized === '/App.jsx' || normalized === '/App.tsx' ||
           normalized === '/App.js' || normalized === '/App.ts';
  });
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
  const prevHtmlRef = useRef<string | null>(null);

  const projectId = currentProject?.id || "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  // Build preview whenever we have a real App file
  const ready = hasAppEntry(sandpackFiles);
  
  if (sandpackFiles && Object.keys(sandpackFiles).length > 0 && !ready) {
    console.warn("[ESMPreview] Files present but no App entry found. File keys:", Object.keys(sandpackFiles));
  }

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
      return result;
    } catch (e: any) {
      console.error("[ESMPreview] Build exception:", e);
      setError(e.message);
      return null;
    }
  }, [ready, sandpackFiles, sandpackDeps, projectId, supabaseUrl, supabaseKey]);

  // Cleanup old blob URLs
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
    return null; // Let the loading overlay or EmptyState handle this
  }

  return (
    <div
      className="h-full w-full"
      style={viewport ? { width: viewport.width, maxWidth: viewport.maxWidth } : undefined}
    >
      <iframe
        ref={iframeRef}
        srcDoc={buildResult.html}
        className="w-full h-full border-0 bg-white"
        title="ESM Preview"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        style={viewport && viewport.width !== "100%" ? { borderRadius: 8 } : undefined}
      />
    </div>
  );
};

export default ESMPreview;

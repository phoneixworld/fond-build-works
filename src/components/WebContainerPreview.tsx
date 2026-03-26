/**
 * WebContainer Preview Component — Pillar 1
 * 
 * React component that boots a WebContainer, mounts workspace files,
 * runs the dev server, and renders the output in an iframe.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import {
  mountAndRun,
  updateFiles,
  teardownWebContainer,
  type WebContainerStatus,
} from "@/lib/webcontainer/engine";
import { Loader2, Terminal, AlertCircle, CheckCircle2 } from "lucide-react";

interface WebContainerPreviewProps {
  viewport?: { width: string; maxWidth: string };
  initialPath?: string;
}

const STATUS_LABELS: Record<WebContainerStatus, string> = {
  idle: "Idle",
  booting: "Booting WebContainer...",
  mounting: "Mounting files...",
  installing: "Installing dependencies...",
  starting: "Starting dev server...",
  ready: "Ready",
  error: "Error",
};

export default function WebContainerPreview({
  viewport,
  initialPath,
}: WebContainerPreviewProps) {
  const { files } = useVirtualFS();
  const [status, setStatus] = useState<WebContainerStatus>("idle");
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mountedRef = useRef(false);
  const prevFilesRef = useRef<Record<string, string>>({});

  const addLog = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-200), line]);
  }, []);

  // Initial mount and boot
  useEffect(() => {
    if (mountedRef.current || !files || Object.keys(files).length === 0) return;
    mountedRef.current = true;

    mountAndRun(files, {}, {
      onStatus: setStatus,
      onLog: addLog,
      onServerReady: (url) => {
        setServerUrl(url);
        setError(null);
      },
      onError: (err) => {
        setError(err);
        addLog(`❌ Error: ${err}`);
      },
    }).catch((err) => {
      setError(err.message);
    });

    prevFilesRef.current = { ...files };

    return () => {
      teardownWebContainer();
      mountedRef.current = false;
    };
  }, []); // Boot once

  // Hot-update files when workspace changes
  useEffect(() => {
    if (status !== "ready" || !files) return;

    const changed: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      if (prevFilesRef.current[path] !== content) {
        changed[path] = content;
      }
    }

    if (Object.keys(changed).length > 0) {
      addLog(`🔄 Hot-updating ${Object.keys(changed).length} files...`);
      updateFiles(changed).then(() => {
        addLog("✅ Files updated — Vite HMR will reload");
      }).catch((err) => {
        addLog(`❌ Update failed: ${err.message}`);
      });
      prevFilesRef.current = { ...files };
    }
  }, [files, status, addLog]);

  const isLoading = ["booting", "mounting", "installing", "starting"].includes(status);

  return (
    <div className="relative w-full h-full flex flex-col" style={{
      width: viewport?.width,
      maxWidth: viewport?.maxWidth,
    }}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[hsl(var(--ide-panel-header))] border-b border-border text-xs">
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
          {status === "ready" && <CheckCircle2 className="w-3 h-3 text-green-500" />}
          {status === "error" && <AlertCircle className="w-3 h-3 text-destructive" />}
          <span className="text-muted-foreground">{STATUS_LABELS[status]}</span>
        </div>
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Terminal className="w-3 h-3" />
          <span>Logs</span>
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 relative">
        {/* Iframe — shown when server is ready */}
        {serverUrl && (
          <iframe
            ref={iframeRef}
            src={serverUrl}
            className="w-full h-full border-0 bg-white"
            title="WebContainer Preview"
            allow="cross-origin-isolated"
          />
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium text-foreground">
                {STATUS_LABELS[status]}
              </p>
              <p className="text-xs text-muted-foreground">
                First boot takes ~10s, subsequent runs are cached
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === "error" && error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90">
            <div className="text-center space-y-3 max-w-md px-4">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
              <p className="text-sm font-medium text-foreground">Build Error</p>
              <p className="text-xs text-muted-foreground font-mono">{error}</p>
            </div>
          </div>
        )}

        {/* Log panel */}
        {showLogs && (
          <div className="absolute bottom-0 left-0 right-0 h-48 bg-[hsl(var(--ide-bg))] border-t border-border overflow-auto font-mono text-[11px] p-2">
            {logs.map((line, i) => (
              <div key={i} className="text-muted-foreground whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

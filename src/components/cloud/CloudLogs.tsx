import { useState, useEffect } from "react";
import { ScrollText, RefreshCw } from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

const LEVEL_STYLES: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-destructive",
};

const CloudLogs = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    // Seed with sample log entries
    setLogs([
      { timestamp: new Date().toISOString(), level: "info", message: "Cloud panel initialized" },
      { timestamp: new Date(Date.now() - 2000).toISOString(), level: "info", message: "Ready for connections" },
    ]);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Logs</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3 h-3 rounded accent-primary cursor-pointer"
            />
            Auto-refresh
          </label>
          <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-secondary">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-background/50 p-4 font-mono">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No logs yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Activity from your app will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 text-xs py-0.5">
                <span className="text-muted-foreground/60 shrink-0 tabular-nums">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`uppercase text-[10px] font-bold shrink-0 w-10 ${LEVEL_STYLES[log.level] || ""}`}>
                  {log.level}
                </span>
                <span className="text-foreground">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudLogs;

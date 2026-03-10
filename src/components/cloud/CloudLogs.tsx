import { useState, useEffect, useCallback, useRef, forwardRef } from "react";
import { ScrollText, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";

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

const CloudLogs = forwardRef<HTMLDivElement>((_, ref) => {
  const { currentProject } = useProjects();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchActivity = useCallback(async () => {
    if (!currentProject) return;

    const pid = currentProject.id;
    const entries: LogEntry[] = [
      { timestamp: new Date().toISOString(), level: "info", message: `Cloud panel initialized for "${currentProject.name}"` },
    ];

    // Fetch all sources in parallel
    const [dataRes, usersRes, fnRes, buildRes, auditRes, deployRes] = await Promise.all([
      supabase.from("project_data").select("id, collection, created_at, updated_at").eq("project_id", pid).order("updated_at", { ascending: false }).limit(20),
      supabase.from("project_users").select("id, email, created_at").eq("project_id", pid).order("created_at", { ascending: false }).limit(10),
      supabase.from("project_functions").select("id, name, created_at").eq("project_id", pid).order("created_at", { ascending: false }).limit(10),
      supabase.from("build_jobs").select("id, status, created_at, completed_at, error, build_duration_ms").eq("project_id", pid).order("created_at", { ascending: false }).limit(15),
      supabase.from("project_audit_log").select("id, action, entity_type, agent_name, created_at").eq("project_id", pid).order("created_at", { ascending: false }).limit(20),
      supabase.from("deploy_history").select("id, to_env, status, deployed_by_email, created_at").eq("project_id", pid).order("created_at", { ascending: false }).limit(10),
    ]);

    if (dataRes.error) {
      entries.push({ timestamp: new Date().toISOString(), level: "error", message: `Failed to fetch data: ${dataRes.error.message}` });
    }

    (dataRes.data || []).forEach((row: any) => {
      entries.push({ timestamp: row.updated_at || row.created_at, level: "info", message: `Data record in "${row.collection}" (${row.id.slice(0, 8)}…) updated` });
    });

    (usersRes.data || []).forEach((user: any) => {
      entries.push({ timestamp: user.created_at, level: "info", message: `User "${user.email}" registered` });
    });

    (fnRes.data || []).forEach((fn: any) => {
      entries.push({ timestamp: fn.created_at, level: "info", message: `Function "${fn.name}" created` });
    });

    (buildRes.data || []).forEach((build: any) => {
      const dur = build.build_duration_ms ? ` (${(build.build_duration_ms / 1000).toFixed(1)}s)` : "";
      const lvl: LogEntry["level"] = build.status === "failed" ? "error" : build.status === "building" ? "warn" : "info";
      const msg = build.error
        ? `Build ${build.id.slice(0, 8)}… failed: ${build.error.slice(0, 80)}`
        : `Build ${build.id.slice(0, 8)}… ${build.status}${dur}`;
      entries.push({ timestamp: build.completed_at || build.created_at, level: lvl, message: msg });
    });

    (auditRes.data || []).forEach((log: any) => {
      entries.push({ timestamp: log.created_at, level: "info", message: `[${log.agent_name}] ${log.action} on ${log.entity_type}` });
    });

    (deployRes.data || []).forEach((dep: any) => {
      const lvl: LogEntry["level"] = dep.status === "failed" ? "error" : "info";
      entries.push({ timestamp: dep.created_at, level: lvl, message: `Deploy to ${dep.to_env} ${dep.status}${dep.deployed_by_email ? ` by ${dep.deployed_by_email}` : ""}` });
    });

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLogs(entries);
  }, [currentProject]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchActivity, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchActivity]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Realtime subscription
  useEffect(() => {
    if (!currentProject) return;
    const channel = supabase
      .channel(`logs-${currentProject.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_data", filter: `project_id=eq.${currentProject.id}` }, (payload) => {
        const evt = payload.eventType;
        const collection = (payload.new as any)?.collection || (payload.old as any)?.collection || "unknown";
        setLogs(prev => [{ timestamp: new Date().toISOString(), level: "info", message: `[realtime] ${evt.toUpperCase()} on "${collection}"` }, ...prev]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "build_jobs", filter: `project_id=eq.${currentProject.id}` }, (payload) => {
        const build = (payload.new as any) || {};
        const lvl: LogEntry["level"] = build.status === "failed" ? "error" : "info";
        setLogs(prev => [{ timestamp: new Date().toISOString(), level: lvl, message: `[realtime] Build ${build.id?.slice(0, 8) || ""}… ${build.status || payload.eventType}` }, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentProject]);

  return (
    <div ref={ref} className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Logs</span>
          <span className="text-xs text-muted-foreground">({logs.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="w-3 h-3 rounded accent-primary cursor-pointer" />
            Auto-refresh
          </label>
          <button onClick={fetchActivity} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-secondary">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setLogs([])} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-secondary">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-background/50 p-4 font-mono">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No logs yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Activity from your app will appear here</p>
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
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
});

CloudLogs.displayName = "CloudLogs";

export default CloudLogs;

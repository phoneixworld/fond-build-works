/**
 * ContainerBuildPanel — Live container build status with DAG visualization.
 * Uses Supabase Realtime for streaming updates from Azure Container Apps.
 */

import { useState } from "react";
import {
  Container, CheckCircle2, XCircle, Loader2, Clock,
  SkipForward, Play, AlertTriangle, Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useContainerBuild, type ContainerTask, type ContainerBuildStatus } from "@/hooks/useContainerBuild";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS } from "@/contexts/VirtualFSContext";

const TASK_STATUS_ICON: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground" },
  running: { icon: Loader2, color: "text-blue-400" },
  passed: { icon: CheckCircle2, color: "text-emerald-400" },
  failed: { icon: XCircle, color: "text-red-400" },
  skipped: { icon: SkipForward, color: "text-muted-foreground" },
};

const BUILD_STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  idle: { variant: "outline", label: "Idle" },
  pending: { variant: "secondary", label: "Pending" },
  provisioning: { variant: "secondary", label: "Provisioning" },
  building: { variant: "default", label: "Building" },
  testing: { variant: "default", label: "Testing" },
  publishing: { variant: "default", label: "Publishing" },
  complete: { variant: "secondary", label: "Complete" },
  failed: { variant: "destructive", label: "Failed" },
  cancelled: { variant: "outline", label: "Cancelled" },
};

function TaskRow({ task }: { task: ContainerTask }) {
  const config = TASK_STATUS_ICON[task.status] || TASK_STATUS_ICON.pending;
  const Icon = config.icon;
  const isSpinning = task.status === "running";

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-card/50 border border-border/50">
      <Icon className={`h-4 w-4 ${config.color} ${isSpinning ? "animate-spin" : ""}`} />
      <span className="flex-1 text-sm font-medium">{task.label}</span>
      {task.duration_ms != null && (
        <span className="text-xs text-muted-foreground">{(task.duration_ms / 1000).toFixed(1)}s</span>
      )}
      {task.error && (
        <span className="text-xs text-destructive truncate max-w-[200px]" title={task.error}>
          {task.error}
        </span>
      )}
    </div>
  );
}

const ContainerBuildPanel = () => {
  const { currentProject } = useProjects();
  const { files } = useVirtualFS();
  const build = useContainerBuild();
  const [showLogs, setShowLogs] = useState(false);

  const handleStartBuild = async () => {
    if (!currentProject) return;
    try {
      const plainFiles: Record<string, string> = {};
      for (const [path, vf] of Object.entries(files)) {
        plainFiles[path] = vf.content;
      }
      await build.startBuild(currentProject.id, plainFiles, {}, {});
    } catch (err) {
      console.error("Failed to start container build:", err);
    }
  };

  const badgeConfig = BUILD_STATUS_BADGE[build.status] || BUILD_STATUS_BADGE.idle;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Container className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Container Build</h3>
          <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
        </div>
        <Button
          size="sm"
          onClick={handleStartBuild}
          disabled={build.isBuilding || !currentProject}
        >
          {build.isBuilding ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              Building...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 mr-1" />
              Build
            </>
          )}
        </Button>
      </div>

      {/* Error banner */}
      {build.error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <span className="text-destructive">{build.error}</span>
        </div>
      )}

      {/* Task DAG */}
      {build.tasks.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Pipeline
          </span>
          {build.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Build metrics */}
      {build.status === "complete" && build.durationMs && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>⏱ {(build.durationMs / 1000).toFixed(1)}s</span>
          {build.previewUrl && (
            <a
              href={build.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Open Preview →
            </a>
          )}
        </div>
      )}

      {/* Build logs */}
      {build.buildLog.length > 0 && (
        <div>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Terminal className="h-3.5 w-3.5" />
            {showLogs ? "Hide" : "Show"} logs ({build.buildLog.length})
          </button>
          {showLogs && (
            <ScrollArea className="mt-2 h-[200px] rounded-md border bg-background/80 p-2">
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {build.buildLog.join("\n")}
              </pre>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
};

export default ContainerBuildPanel;

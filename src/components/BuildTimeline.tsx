/**
 * Build Timeline — developer mode panel showing per-task metrics,
 * latency breakdown, cache hits, and parallel group visualization.
 * 
 * Reads from buildObservability data passed via props.
 */

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BuildMetrics, TaskMetrics } from "@/lib/buildObservability";
import {
  Clock,
  Zap,
  Database,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";

interface BuildTimelineProps {
  metrics: BuildMetrics | null;
  isBuilding?: boolean;
}

function formatMs(ms: number | undefined): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function StatusIcon({ status }: { status: TaskMetrics["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case "stubbed":
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
    case "skipped":
      return <SkipForward className="w-3.5 h-3.5 text-muted-foreground" />;
    default:
      return null;
  }
}

function LatencyBar({ task, maxMs }: { task: TaskMetrics; maxMs: number }) {
  const totalMs = task.endTime ? task.endTime - task.startTime : 0;
  const modelPct = totalMs > 0 ? ((task.modelLatencyMs || 0) / totalMs) * 100 : 0;
  const valPct = totalMs > 0 ? ((task.validationLatencyMs || 0) / totalMs) * 100 : 0;
  const mergePct = totalMs > 0 ? ((task.mergeLatencyMs || 0) / totalMs) * 100 : 0;
  const widthPct = maxMs > 0 ? (totalMs / maxMs) * 100 : 0;

  return (
    <div className="w-full flex items-center gap-2">
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden relative" style={{ maxWidth: `${widthPct}%`, minWidth: "20px" }}>
        <div
          className="absolute inset-y-0 left-0 bg-blue-500 rounded-l-full"
          style={{ width: `${modelPct}%` }}
          title={`Model: ${formatMs(task.modelLatencyMs)}`}
        />
        <div
          className="absolute inset-y-0 bg-emerald-500"
          style={{ left: `${modelPct}%`, width: `${valPct}%` }}
          title={`Validation: ${formatMs(task.validationLatencyMs)}`}
        />
        <div
          className="absolute inset-y-0 bg-amber-500 rounded-r-full"
          style={{ left: `${modelPct + valPct}%`, width: `${mergePct}%` }}
          title={`Merge: ${formatMs(task.mergeLatencyMs)}`}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
        {formatMs(totalMs)}
      </span>
    </div>
  );
}

export default function BuildTimeline({ metrics, isBuilding }: BuildTimelineProps) {
  const [expanded, setExpanded] = useState(true);

  if (!metrics) {
    return (
      <div className="p-4 text-center text-muted-foreground text-xs">
        No build metrics yet. Run a build to see the timeline.
      </div>
    );
  }

  const totalMs = metrics.endTime ? metrics.endTime - metrics.startTime : 0;
  const maxTaskMs = Math.max(
    ...metrics.tasks.map(t => (t.endTime ? t.endTime - t.startTime : 0)),
    1
  );
  const successRate = metrics.totalTasks > 0
    ? Math.round((metrics.completedTasks / metrics.totalTasks) * 100)
    : 0;

  return (
    <div className="border border-border rounded-lg bg-card text-card-foreground overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Build Timeline</span>
          <span className="text-[10px] text-muted-foreground font-mono">{metrics.buildId}</span>
          {isBuilding && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full animate-pulse">
              Building...
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-2 p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                Total
              </div>
              <div className="text-sm font-semibold font-mono">{formatMs(totalMs)}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Layers className="w-3 h-3" />
                Tasks
              </div>
              <div className="text-sm font-semibold">
                {metrics.completedTasks}/{metrics.totalTasks}
                {metrics.parallelGroups && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    ({metrics.parallelGroups} groups)
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Database className="w-3 h-3" />
                Cache
              </div>
              <div className="text-sm font-semibold">{metrics.cacheHits} hits</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <RefreshCw className="w-3 h-3" />
                Retries
              </div>
              <div className="text-sm font-semibold">{metrics.totalRetries}</div>
            </div>
          </div>

          {/* Pipeline latency */}
          <div className="px-3 pb-2 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Success rate</span>
              <span>{successRate}%</span>
            </div>
            <Progress value={successRate} className="h-1.5" />
          </div>

          <div className="px-3 pb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Planning</span>
              <span className="font-mono">{formatMs(metrics.planningLatencyMs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Assembly</span>
              <span className="font-mono">{formatMs(metrics.assemblyLatencyMs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stubbed</span>
              <span className="font-mono">{metrics.stubbedFiles}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Failed</span>
              <span className="font-mono">{metrics.failedTasks}</span>
            </div>
          </div>

          {/* Task breakdown */}
          <ScrollArea className="max-h-64">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="h-7 px-2 w-6" />
                  <TableHead className="h-7 px-2">Task</TableHead>
                  <TableHead className="h-7 px-2">Latency</TableHead>
                  <TableHead className="h-7 px-2 text-right">Files</TableHead>
                  <TableHead className="h-7 px-2 text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.tasks.map((task) => (
                  <TableRow key={task.taskId} className="text-[10px]">
                    <TableCell className="p-1.5 w-6">
                      <StatusIcon status={task.status} />
                    </TableCell>
                    <TableCell className="p-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[120px]" title={task.taskTitle}>
                          {task.taskTitle}
                        </span>
                        {task.cached && (
                          <span className="text-[8px] bg-emerald-500/20 text-emerald-600 px-1 rounded">
                            CACHED
                          </span>
                        )}
                        {task.retryCount > 0 && (
                          <span className="text-[8px] bg-amber-500/20 text-amber-600 px-1 rounded">
                            {task.retryCount}×
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="p-1.5 w-36">
                      <LatencyBar task={task} maxMs={maxTaskMs} />
                    </TableCell>
                    <TableCell className="p-1.5 text-right font-mono">{task.fileCount}</TableCell>
                    <TableCell className="p-1.5 text-right font-mono">
                      {formatBytes(task.totalFileSize)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Legend */}
          <div className="px-3 py-2 border-t border-border flex items-center gap-3 text-[9px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Model
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Validate
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Merge
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

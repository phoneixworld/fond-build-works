/**
 * BuildPipeline — Cloud panel section for viewing build jobs, logs, and artifacts.
 * Wired to the server-side build orchestrator via buildPipelineService.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Hammer, Clock, CheckCircle2, XCircle, Loader2, ExternalLink,
  FileCode, ChevronDown, ChevronRight, RefreshCw, Eye, AlertTriangle,
} from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import {
  listBuilds,
  getBuild,
  subscribeToProjectBuilds,
  type BuildListItem,
  type BuildJob,
} from "@/lib/buildPipelineService";
import { formatDistanceToNow } from "date-fns";

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  building: { icon: Loader2, color: "text-blue-400", label: "Building" },
  validating: { icon: Loader2, color: "text-amber-400", label: "Validating" },
  storing: { icon: Loader2, color: "text-purple-400", label: "Storing" },
  complete: { icon: CheckCircle2, color: "text-emerald-400", label: "Complete" },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed" },
};

const BuildPipeline = () => {
  const { currentProject } = useProjects();
  const [builds, setBuilds] = useState<BuildListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);
  const [buildDetail, setBuildDetail] = useState<BuildJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchBuilds = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const data = await listBuilds(currentProject.id, { limit: 50 });
      setBuilds(data);
    } catch (err) {
      console.error("Failed to fetch builds:", err);
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  // Realtime subscription
  useEffect(() => {
    if (!currentProject) return;
    const unsubscribe = subscribeToProjectBuilds(currentProject.id, (updatedBuild) => {
      setBuilds((prev) => {
        const idx = prev.findIndex((b) => b.id === updatedBuild.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...updatedBuild } as BuildListItem;
          return updated;
        }
        return [updatedBuild as BuildListItem, ...prev];
      });
      // Update detail if viewing this build
      if (expandedBuild === updatedBuild.id) {
        setBuildDetail((prev) => (prev ? { ...prev, ...updatedBuild } as BuildJob : prev));
      }
    });
    return unsubscribe;
  }, [currentProject, expandedBuild]);

  const handleExpand = async (buildId: string) => {
    if (expandedBuild === buildId) {
      setExpandedBuild(null);
      setBuildDetail(null);
      return;
    }
    setExpandedBuild(buildId);
    setDetailLoading(true);
    try {
      const detail = await getBuild(buildId);
      setBuildDetail(detail);
    } catch (err) {
      console.error("Failed to fetch build detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  if (!currentProject) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Select a project to view builds.</div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Hammer className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Build Pipeline</h2>
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
            {builds.length} builds
          </span>
        </div>
        <button
          onClick={fetchBuilds}
          className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-border">
        {[
          { label: "Total", value: builds.length, color: "text-foreground" },
          { label: "Complete", value: builds.filter((b) => b.status === "complete").length, color: "text-emerald-400" },
          { label: "Failed", value: builds.filter((b) => b.status === "failed").length, color: "text-red-400" },
          {
            label: "Avg Time",
            value: builds.filter((b) => b.build_duration_ms).length > 0
              ? `${Math.round(builds.filter((b) => b.build_duration_ms).reduce((sum, b) => sum + (b.build_duration_ms || 0), 0) / builds.filter((b) => b.build_duration_ms).length)}ms`
              : "—",
            color: "text-blue-400",
          },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Build list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : builds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Hammer className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No builds yet</p>
            <p className="text-xs mt-1">Builds are created when you generate code via the chat.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {builds.map((build) => {
              const statusCfg = STATUS_CONFIG[build.status] || STATUS_CONFIG.queued;
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedBuild === build.id;
              const isAnimating = ["building", "validating", "storing"].includes(build.status);

              return (
                <div key={build.id} className="group">
                  <button
                    onClick={() => handleExpand(build.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <StatusIcon
                      className={`w-4 h-4 shrink-0 ${statusCfg.color} ${isAnimating ? "animate-spin" : ""}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground truncate">
                          {build.id.slice(0, 8)}
                        </span>
                        <span className={`text-[10px] font-medium ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{build.file_count} files</span>
                        <span>•</span>
                        <span>{formatBytes(build.total_size_bytes)}</span>
                        {build.build_duration_ms && (
                          <>
                            <span>•</span>
                            <span>{build.build_duration_ms}ms</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(build.created_at), { addSuffix: true })}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-3 bg-accent/10">
                      {detailLoading ? (
                        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading details...
                        </div>
                      ) : buildDetail ? (
                        <div className="space-y-3 pt-2">
                          {/* Preview link */}
                          {buildDetail.preview_url && (
                            <a
                              href={buildDetail.preview_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-xs text-primary hover:underline"
                            >
                              <Eye className="w-3 h-3" />
                              Open Preview
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}

                          {/* Error */}
                          {buildDetail.error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-xs text-red-400">
                              <div className="flex items-center gap-1 font-medium mb-1">
                                <XCircle className="w-3 h-3" /> Build Error
                              </div>
                              <pre className="whitespace-pre-wrap font-mono text-[10px]">
                                {buildDetail.error}
                              </pre>
                            </div>
                          )}

                          {/* Validation */}
                          {buildDetail.validation_results?.warnings?.length > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-xs">
                              <div className="flex items-center gap-1 font-medium text-amber-400 mb-1">
                                <AlertTriangle className="w-3 h-3" /> Validation Warnings
                              </div>
                              {buildDetail.validation_results.warnings.map((w, i) => (
                                <div key={i} className="text-[10px] text-amber-300/80 font-mono">
                                  {w.file}: {w.message}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Build log */}
                          {buildDetail.build_log && buildDetail.build_log.length > 0 && (
                            <div className="bg-background/50 rounded p-2">
                              <div className="flex items-center gap-1 text-xs font-medium text-foreground mb-1">
                                <FileCode className="w-3 h-3" /> Build Log
                              </div>
                              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                                {buildDetail.build_log.map((line, i) => (
                                  <div
                                    key={i}
                                    className="text-[10px] font-mono text-muted-foreground leading-relaxed"
                                  >
                                    {line}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BuildPipeline;

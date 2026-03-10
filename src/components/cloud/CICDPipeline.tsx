/**
 * CI/CD Pipeline — enterprise-grade panel wired to real backend.
 * Gates persist to DB, pipeline runs server-side, promotion includes rollback.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, Play, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Shield, Rocket, FileCode, Settings2, Copy, Check, Download,
  ArrowRight, ChevronDown, ChevronRight, RotateCcw, Clock, Eye,
  RefreshCw, Zap, BarChart3, Lock, Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useProjects } from "@/contexts/ProjectContext";
import { usePreview } from "@/contexts/PreviewContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_QUALITY_GATES,
  createPipelineSteps,
  type QualityGateRule,
  type PipelineStep,
} from "@/lib/qualityGates";
import { generateWorkflow, type WorkflowConfig } from "@/lib/githubActionsGenerator";
import { formatDistanceToNow } from "date-fns";

type CICDTab = "pipeline" | "gates" | "promotion" | "github";

interface GateReport {
  passed: boolean;
  score: number;
  blockers: number;
  warnings: number;
  results: Array<{ rule_id: string; name: string; value: number; threshold: number; passed: boolean; severity: string }>;
}

const CICDPipeline = () => {
  const { currentProject } = useProjects();
  const { sandpackFiles, previewHtml } = usePreview();
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<CICDTab>("pipeline");

  // Pipeline state
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(createPipelineSteps());
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);

  // Quality gates state — loaded from DB
  const [gates, setGates] = useState<QualityGateRule[]>(DEFAULT_QUALITY_GATES);
  const [gatesLoaded, setGatesLoaded] = useState(false);
  const [gateReport, setGateReport] = useState<GateReport | null>(null);

  // Promotion state
  const [environments, setEnvironments] = useState<any[]>([]);
  const [deployHistory, setDeployHistory] = useState<any[]>([]);
  const [promoting, setPromoting] = useState(false);

  // GitHub Actions state
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig>({
    projectName: currentProject?.name || "My App",
    nodeVersion: "20",
    packageManager: "bun",
    enableLint: true,
    enableTypecheck: true,
    enableTests: true,
    enableQualityGates: true,
    enableDeploy: false,
    branches: ["main"],
  });
  const [copied, setCopied] = useState(false);

  // ─── Load gates from DB ───
  const loadGates = useCallback(async () => {
    if (!currentProject) return;
    const { data } = await supabase
      .from("quality_gates" as any)
      .select("*")
      .eq("project_id", currentProject.id);

    if (data && (data as any[]).length > 0) {
      setGates((data as any[]).map((g: any) => ({
        id: g.rule_id,
        name: g.name,
        description: g.description || "",
        category: g.category as any,
        threshold: Number(g.threshold),
        operator: g.operator as any,
        severity: g.severity as any,
        enabled: g.enabled,
      })));
    }
    setGatesLoaded(true);
  }, [currentProject]);

  // ─── Persist gate toggle to DB ───
  const persistGate = useCallback(async (gate: QualityGateRule) => {
    if (!currentProject) return;
    const row = {
      project_id: currentProject.id,
      rule_id: gate.id,
      name: gate.name,
      description: gate.description,
      category: gate.category,
      threshold: gate.threshold,
      operator: gate.operator,
      severity: gate.severity,
      enabled: gate.enabled,
      updated_at: new Date().toISOString(),
    };
    await supabase
      .from("quality_gates" as any)
      .upsert(row as any, { onConflict: "project_id,rule_id" });
  }, [currentProject]);

  // ─── Load environments & deploy history ───
  const fetchEnvData = useCallback(async () => {
    if (!currentProject) return;
    const [envRes, histRes] = await Promise.all([
      supabase.from("project_environments").select("*").eq("project_id", currentProject.id),
      supabase.from("deploy_history").select("*").eq("project_id", currentProject.id)
        .order("created_at", { ascending: false }).limit(20),
    ]);
    if (envRes.data) setEnvironments(envRes.data);
    if (histRes.data) setDeployHistory(histRes.data);
  }, [currentProject]);

  useEffect(() => {
    loadGates();
    fetchEnvData();
  }, [loadGates, fetchEnvData]);

  // ─── Realtime build_jobs subscription ───
  useEffect(() => {
    if (!buildId) return;
    const channel = supabase
      .channel(`pipeline-${buildId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "build_jobs",
        filter: `id=eq.${buildId}`,
      }, (payload) => {
        const row = payload.new as any;
        const status = row.status as string;

        // Map server status to step states
        if (status.startsWith("stage:")) {
          const stage = status.replace("stage:", "");
          const stageOrder = ["lint", "typecheck", "test", "quality", "build", "gates"];
          const idx = stageOrder.indexOf(stage);
          if (idx >= 0) {
            setPipelineSteps(prev => prev.map((s, i) => {
              if (i < idx) return { ...s, status: "passed" as const };
              if (i === idx) return { ...s, status: "running" as const };
              return s;
            }));
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [buildId]);

  // ─── Pipeline Runner — calls edge function ───
  const getFiles = useCallback(() => {
    return sandpackFiles || (previewHtml ? { "/index.html": previewHtml } : {});
  }, [sandpackFiles, previewHtml]);

  const runPipeline = async () => {
    if (!currentProject || !user) return;
    setIsRunning(true);
    setPipelineSteps(createPipelineSteps());
    setGateReport(null);

    try {
      const files = getFiles();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pipeline-runner`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            project_id: currentProject.id,
            files,
            gates: gates.map(g => ({
              rule_id: g.id, name: g.name, threshold: g.threshold,
              operator: g.operator, severity: g.severity, enabled: g.enabled, category: g.category,
            })),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Pipeline failed");
      }

      setBuildId(result.build_id);

      // Map server stage results to UI steps
      const stageOrder = ["lint", "typecheck", "test", "quality", "build", "gates"] as const;
      const updatedSteps = stageOrder.map((stage) => {
        const sr = result.stages?.[stage];
        if (!sr) return { stage, label: stage, status: "skipped" as const };
        return {
          stage,
          label: createPipelineSteps().find(s => s.stage === stage)?.label || stage,
          status: sr.passed ? "passed" as const : sr.output?.[0] === "Skipped" ? "skipped" as const : "failed" as const,
          duration: sr.duration,
          output: sr.output,
        };
      });
      setPipelineSteps(updatedSteps);

      // Extract gate report from validation_results
      if (result.stages?.gates) {
        const gateStage = result.stages.gates;
        // Fetch the build job for full gate results
        const { data: buildRow } = await supabase
          .from("build_jobs")
          .select("validation_results")
          .eq("id", result.build_id)
          .single();

        const vr = buildRow?.validation_results as any;
        if (vr?.gateResults) {
          const blockers = vr.gateResults.filter((r: any) => !r.passed && r.severity === "blocker");
          const warns = vr.gateResults.filter((r: any) => !r.passed && r.severity === "warning");
          const passedCount = vr.gateResults.filter((r: any) => r.passed).length;
          setGateReport({
            passed: vr.passed,
            score: vr.gateResults.length > 0 ? Math.round((passedCount / vr.gateResults.length) * 100) : 100,
            blockers: blockers.length,
            warnings: warns.length,
            results: vr.gateResults,
          });
        }
      }

      setLastRunAt(new Date().toISOString());
      toast({
        title: result.status === "complete" ? "Pipeline passed ✓" : "Pipeline failed",
        description: `Completed in ${result.duration_ms}ms${result.failed_stage ? ` — failed at ${result.failed_stage}` : ""}`,
        variant: result.status === "complete" ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Pipeline error", description: err.message, variant: "destructive" });
      setPipelineSteps(prev => prev.map(s => s.status === "pending" || s.status === "running" ? { ...s, status: "failed" as const, output: [err.message] } : s));
    } finally {
      setIsRunning(false);
    }
  };

  // ─── Promotion with rollback ───
  const handlePromote = async (from: string, to: string) => {
    if (!currentProject || !user) return;
    setPromoting(true);
    try {
      if (gateReport && !gateReport.passed) {
        toast({ title: "Promotion blocked", description: "Quality gates must pass before promoting.", variant: "destructive" });
        return;
      }

      const { data: sourceEnv } = await supabase
        .from("project_environments").select("html_snapshot, config")
        .eq("project_id", currentProject.id).eq("name", from).maybeSingle();

      const snapshot = (sourceEnv as any)?.html_snapshot;
      if (!snapshot) {
        toast({ title: "Nothing to promote", description: `Deploy to ${from} first.`, variant: "destructive" });
        return;
      }

      const { data: existing } = await supabase
        .from("project_environments").select("id")
        .eq("project_id", currentProject.id).eq("name", to).maybeSingle();

      const envData = {
        html_snapshot: snapshot,
        status: "deployed",
        deployed_at: new Date().toISOString(),
        deployed_by: user.id,
        updated_at: new Date().toISOString(),
        config: { previous_snapshot: (sourceEnv as any)?.config?.previous_snapshot || null, build_id: buildId },
      };

      if (existing) {
        // Save current target snapshot for rollback
        const { data: targetEnv } = await supabase
          .from("project_environments").select("html_snapshot")
          .eq("id", existing.id).single();
        if (targetEnv) {
          (envData.config as any).previous_snapshot = (targetEnv as any).html_snapshot?.slice(0, 50000) || null;
        }
        await supabase.from("project_environments").update(envData as any).eq("id", existing.id);
      } else {
        await supabase.from("project_environments").insert({
          project_id: currentProject.id, name: to, label: to.charAt(0).toUpperCase() + to.slice(1),
          ...envData,
        } as any);
      }

      if (to === "production") {
        const slug = currentProject.published_slug || currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + currentProject.id.slice(0, 8);
        await supabase.from("projects").update({ is_published: true, published_slug: slug, html_content: snapshot } as any).eq("id", currentProject.id);
      }

      await supabase.from("deploy_history").insert({
        project_id: currentProject.id, deployed_by: user.id, deployed_by_email: user.email || "",
        from_env: from, to_env: to, status: "success",
        notes: `Promoted ${from} → ${to}`,
        build_id: buildId,
      } as any);

      toast({ title: `Promoted to ${to}! 🚀` });
      fetchEnvData();
    } catch (err: any) {
      toast({ title: "Promotion failed", description: err.message, variant: "destructive" });
    } finally {
      setPromoting(false);
    }
  };

  // ─── Rollback ───
  const handleRollback = async (envName: string) => {
    if (!currentProject || !user) return;
    setPromoting(true);
    try {
      const { data: env } = await supabase
        .from("project_environments").select("id, html_snapshot, config")
        .eq("project_id", currentProject.id).eq("name", envName).maybeSingle();

      if (!env) throw new Error("Environment not found");
      const config = (env as any).config as any;
      const previousSnapshot = config?.previous_snapshot;

      if (!previousSnapshot) {
        toast({ title: "No rollback available", description: "No previous deployment snapshot stored.", variant: "destructive" });
        return;
      }

      // Swap: current becomes previous, previous becomes current
      await supabase.from("project_environments").update({
        html_snapshot: previousSnapshot,
        config: { ...config, previous_snapshot: (env as any).html_snapshot },
        deployed_at: new Date().toISOString(),
        deployed_by: user.id,
        updated_at: new Date().toISOString(),
      } as any).eq("id", (env as any).id);

      // If production, update project html_content
      if (envName === "production") {
        await supabase.from("projects").update({ html_content: previousSnapshot } as any).eq("id", currentProject.id);
      }

      await supabase.from("deploy_history").insert({
        project_id: currentProject.id, deployed_by: user.id, deployed_by_email: user.email || "",
        from_env: envName, to_env: envName, status: "success",
        notes: `Rolled back ${envName} to previous version`,
      } as any);

      toast({ title: `Rolled back ${envName} ↩` });
      fetchEnvData();
    } catch (err: any) {
      toast({ title: "Rollback failed", description: err.message, variant: "destructive" });
    } finally {
      setPromoting(false);
    }
  };

  // ─── GitHub Actions ───
  const workflowYaml = generateWorkflow(workflowConfig);

  const handleCopyWorkflow = () => {
    navigator.clipboard.writeText(workflowYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadWorkflow = () => {
    const blob = new Blob([workflowYaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ci.yml";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded ci.yml", description: "Place in .github/workflows/ in your repo." });
  };

  // ─── Render helpers ───
  const getStepIcon = (status: PipelineStep["status"]) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4 text-muted-foreground" />;
      case "running": return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case "passed": return <CheckCircle2 className="w-4 h-4 text-[hsl(var(--ide-success))]" />;
      case "failed": return <XCircle className="w-4 h-4 text-destructive" />;
      case "skipped": return <ArrowRight className="w-4 h-4 text-muted-foreground opacity-40" />;
    }
  };

  const pipelineStatus = pipelineSteps.every(s => s.status === "passed")
    ? "passed" : pipelineSteps.some(s => s.status === "failed")
    ? "failed" : pipelineSteps.some(s => s.status === "running")
    ? "running" : "idle";

  if (!currentProject) {
    return <div className="p-6 text-sm text-muted-foreground">Select a project to view CI/CD.</div>;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[hsl(var(--ide-panel))]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-[hsl(var(--ide-panel-header))]">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">CI/CD Pipeline</h2>
          {pipelineStatus === "passed" && (
            <Badge variant="outline" className="text-[hsl(var(--ide-success))] border-[hsl(var(--ide-success))]/30 text-[10px]">Passing</Badge>
          )}
          {pipelineStatus === "failed" && (
            <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">Failed</Badge>
          )}
        </div>
        <Button size="sm" variant={isRunning ? "secondary" : "default"} onClick={runPipeline} disabled={isRunning}>
          {isRunning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
          {isRunning ? "Running…" : "Run Pipeline"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CICDTab)} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 bg-secondary">
          <TabsTrigger value="pipeline" className="text-xs gap-1"><Zap className="w-3 h-3" /> Pipeline</TabsTrigger>
          <TabsTrigger value="gates" className="text-xs gap-1"><Shield className="w-3 h-3" /> Gates</TabsTrigger>
          <TabsTrigger value="promotion" className="text-xs gap-1"><Rocket className="w-3 h-3" /> Promote</TabsTrigger>
          <TabsTrigger value="github" className="text-xs gap-1"><GitBranch className="w-3 h-3" /> Actions</TabsTrigger>
        </TabsList>

        {/* ─── Pipeline Tab ─── */}
        <TabsContent value="pipeline" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Steps", value: pipelineSteps.length, color: "text-foreground" },
                  { label: "Passed", value: pipelineSteps.filter(s => s.status === "passed").length, color: "text-[hsl(var(--ide-success))]" },
                  { label: "Duration", value: pipelineSteps.reduce((s, p) => s + (p.duration || 0), 0) + "ms", color: "text-primary" },
                ].map(s => (
                  <div key={s.label} className="text-center p-2 rounded-lg bg-card border border-border">
                    <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                {pipelineSteps.map((step, i) => (
                  <PipelineStepRow key={step.stage} step={step} index={i} getIcon={getStepIcon} />
                ))}
              </div>

              {buildId && (
                <p className="text-[10px] text-muted-foreground text-center font-mono">
                  Build: {buildId.slice(0, 8)}
                </p>
              )}

              {lastRunAt && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Last run {formatDistanceToNow(new Date(lastRunAt), { addSuffix: true })}
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ─── Quality Gates Tab ─── */}
        <TabsContent value="gates" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {gateReport && (
                <div className={`p-4 rounded-lg border ${gateReport.passed
                  ? "border-[hsl(var(--ide-success))]/30 bg-[hsl(var(--ide-success))]/5"
                  : "border-destructive/30 bg-destructive/5"
                }`}>
                  <div className="flex items-center gap-3">
                    {gateReport.passed
                      ? <CheckCircle2 className="w-6 h-6 text-[hsl(var(--ide-success))]" />
                      : <XCircle className="w-6 h-6 text-destructive" />
                    }
                    <div>
                      <p className="font-semibold text-sm">
                        {gateReport.passed ? "All Gates Passed" : "Gates Failed — Deploy Blocked"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Score: {gateReport.score}% • {gateReport.blockers} blockers • {gateReport.warnings} warnings
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {gateReport && (
                <div className="space-y-1">
                  {gateReport.results.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
                      r.passed ? "border-border bg-card" : r.severity === "blocker"
                      ? "border-destructive/30 bg-destructive/5" : "border-[hsl(var(--ide-warning))]/30 bg-[hsl(var(--ide-warning))]/5"
                    }`}>
                      {r.passed
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" />
                        : r.severity === "blocker"
                        ? <XCircle className="w-3.5 h-3.5 text-destructive" />
                        : <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--ide-warning))]" />
                      }
                      <span className="flex-1 font-medium">{r.name}</span>
                      <span className="text-muted-foreground">{r.value}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {r.threshold}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {!gateReport && (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Run the pipeline to evaluate quality gates</p>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" /> Gate Configuration
                  <Badge variant="secondary" className="text-[10px] ml-auto">Persisted</Badge>
                </h3>
                <div className="space-y-2">
                  {gates.map((gate) => (
                    <div key={gate.id} className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{gate.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{gate.severity}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{gate.description}</p>
                      </div>
                      <Switch
                        checked={gate.enabled}
                        onCheckedChange={(checked) => {
                          const updated = { ...gate, enabled: checked };
                          setGates(prev => prev.map(g => g.id === gate.id ? updated : g));
                          persistGate(updated);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ─── Promotion Tab ─── */}
        <TabsContent value="promotion" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                {["development", "staging", "production"].map((envName, i) => {
                  const env = environments.find((e: any) => e.name === envName);
                  const isDeployed = !!(env?.html_snapshot?.length > 0);
                  const nextEnv = i === 0 ? "staging" : i === 1 ? "production" : null;
                  const hasRollback = !!(env as any)?.config?.previous_snapshot;

                  return (
                    <div key={envName}>
                      <div className="p-3 rounded-lg border border-border bg-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              isDeployed ? "bg-[hsl(var(--ide-success))]" : "bg-muted-foreground/30"
                            }`} />
                            <span className="text-sm font-medium capitalize">{envName}</span>
                            {env?.is_locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                          </div>
                          <div className="flex items-center gap-2">
                            {hasRollback && (
                              <Button
                                size="sm" variant="ghost"
                                className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                                disabled={promoting}
                                onClick={() => handleRollback(envName)}
                              >
                                <RotateCcw className="w-3 h-3" /> Rollback
                              </Button>
                            )}
                            {isDeployed && (
                              <span className="text-[10px] text-muted-foreground">
                                {env?.deployed_at ? formatDistanceToNow(new Date(env.deployed_at), { addSuffix: true }) : "—"}
                              </span>
                            )}
                            {!isDeployed && <Badge variant="secondary" className="text-[10px]">Empty</Badge>}
                          </div>
                        </div>
                      </div>

                      {nextEnv && (
                        <div className="flex justify-center py-1">
                          <Button
                            size="sm" variant="ghost"
                            className="text-xs gap-1 text-muted-foreground hover:text-primary"
                            disabled={!isDeployed || promoting}
                            onClick={() => handlePromote(envName, nextEnv)}
                          >
                            {promoting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                            Promote to {nextEnv}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {gateReport && !gateReport.passed && (
                <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-xs">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <Shield className="w-3.5 h-3.5" />
                    Promotion blocked — {gateReport.blockers} quality gate(s) failing
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Deploy History
                </h3>
                {deployHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No deployments yet</p>
                ) : (
                  <div className="space-y-1">
                    {deployHistory.map((d: any) => (
                      <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border text-xs">
                        {d.status === "success"
                          ? <CheckCircle2 className="w-3 h-3 text-[hsl(var(--ide-success))]" />
                          : <XCircle className="w-3 h-3 text-destructive" />
                        }
                        <span className="font-medium">{d.from_env} → {d.to_env}</span>
                        <span className="text-muted-foreground flex-1 truncate">{d.notes}</span>
                        <span className="text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ─── GitHub Actions Tab ─── */}
        <TabsContent value="github" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" /> Workflow Configuration
                </h3>
                {[
                  { key: "enableLint" as const, label: "Lint & Format" },
                  { key: "enableTypecheck" as const, label: "TypeScript Check" },
                  { key: "enableTests" as const, label: "Run Tests" },
                  { key: "enableQualityGates" as const, label: "Bundle Size Check" },
                  { key: "enableDeploy" as const, label: "Auto Deploy (main)" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border">
                    <span className="text-xs font-medium">{label}</span>
                    <Switch
                      checked={workflowConfig[key]}
                      onCheckedChange={(checked) =>
                        setWorkflowConfig(prev => ({ ...prev, [key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-border">
                  <span className="text-xs font-medium text-foreground">.github/workflows/ci.yml</span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={handleCopyWorkflow} className="h-7 text-xs gap-1">
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleDownloadWorkflow} className="h-7 text-xs gap-1">
                      <Download className="w-3 h-3" /> Download
                    </Button>
                  </div>
                </div>
                <pre className="p-3 text-[11px] font-mono text-muted-foreground bg-[hsl(var(--ide-panel))] overflow-x-auto max-h-80 leading-relaxed">
                  {workflowYaml}
                </pre>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                Place this file at <code className="bg-secondary px-1 rounded">.github/workflows/ci.yml</code> in your repository
              </p>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Sub-components ───

const PipelineStepRow = ({
  step, index, getIcon,
}: {
  step: PipelineStep;
  index: number;
  getIcon: (s: PipelineStep["status"]) => React.ReactNode;
}) => {
  const [expanded, setExpanded] = useState(step.status === "failed");

  useEffect(() => {
    if (step.status === "failed") setExpanded(true);
  }, [step.status]);

  return (
    <div className={`rounded-lg border overflow-hidden transition-colors ${
      step.status === "failed" ? "border-destructive/30" :
      step.status === "passed" ? "border-[hsl(var(--ide-success))]/20" : "border-border"
    }`}>
      <button
        onClick={() => step.output?.length && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors"
      >
        <span className="text-xs text-muted-foreground w-4 text-center">{index + 1}</span>
        {getIcon(step.status)}
        <span className="text-xs font-medium flex-1 text-left">{step.label}</span>
        {step.duration !== undefined && (
          <span className="text-[10px] text-muted-foreground">{step.duration}ms</span>
        )}
        {step.output?.length ? (
          expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />
        ) : null}
      </button>

      <AnimatePresence>
        {expanded && step.output && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-0.5 border-t border-border pt-2">
              {step.output.map((line, i) => (
                <p key={i} className="text-[10px] font-mono text-muted-foreground">{line}</p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CICDPipeline;

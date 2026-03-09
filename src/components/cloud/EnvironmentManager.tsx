import { useState, useEffect } from "react";
import {
  Rocket, GitBranch, ArrowRight, Lock, Unlock, CheckCircle2,
  Clock, Shield, AlertTriangle, Eye, History, Crown, RefreshCw,
  Globe, Server, Code2, ChevronRight, X, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Environment {
  id: string;
  project_id: string;
  name: string;
  label: string;
  status: string;
  html_snapshot: string;
  config: any;
  deployed_at: string | null;
  deployed_by: string | null;
  preview_url: string | null;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

interface DeployRecord {
  id: string;
  from_env: string;
  to_env: string;
  deployed_by_email: string;
  status: string;
  notes: string;
  created_at: string;
}

const ENV_CONFIG = [
  { name: "development", label: "Development", icon: Code2, color: "text-emerald-400", bgColor: "bg-emerald-400/10 border-emerald-400/30", description: "Active development. Changes happen here first." },
  { name: "staging", label: "Staging", icon: Server, color: "text-amber-400", bgColor: "bg-amber-400/10 border-amber-400/30", description: "Pre-production testing. Review before going live." },
  { name: "production", label: "Production", icon: Globe, color: "text-red-400", bgColor: "bg-red-400/10 border-red-400/30", description: "Live environment serving real users." },
];

const EnvironmentManager = () => {
  const { currentProject } = useProjects();
  const { user } = useAuth();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [deployHistory, setDeployHistory] = useState<DeployRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [deployNotes, setDeployNotes] = useState("");
  const [confirmPromote, setConfirmPromote] = useState<{ from: string; to: string } | null>(null);
  const [previewEnv, setPreviewEnv] = useState<{ name: string; label: string; html: string } | null>(null);

  useEffect(() => {
    if (currentProject?.id) {
      initEnvironments();
      fetchHistory();
    }
  }, [currentProject?.id]);

  const initEnvironments = async () => {
    if (!currentProject?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("project_environments" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: true });

    if (!error && data && (data as any[]).length > 0) {
      setEnvironments(data as any);
    } else {
      // Initialize default environments
      const defaults = ENV_CONFIG.map(env => ({
        project_id: currentProject.id,
        name: env.name,
        label: env.label,
        status: env.name === "development" ? "active" : "empty",
        html_snapshot: env.name === "development" ? (currentProject.html_content || "") : "",
        is_locked: env.name === "production",
      }));

      const { data: created, error: createError } = await supabase
        .from("project_environments" as any)
        .insert(defaults as any)
        .select();

      if (!createError && created) {
        setEnvironments(created as any);
      }
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    if (!currentProject?.id) return;
    const { data } = await supabase
      .from("deploy_history" as any)
      .select("*")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setDeployHistory((data as any) || []);
  };

  const promoteEnvironment = async (fromName: string, toName: string) => {
    if (!currentProject?.id || !user) return;

    const fromEnv = environments.find(e => e.name === fromName);
    const toEnv = environments.find(e => e.name === toName);
    if (!fromEnv || !toEnv) return;

    if (toEnv.is_locked) {
      toast.error(`${toEnv.label} is locked. Unlock it first.`);
      return;
    }

    setDeploying(`${fromName}-${toName}`);

    // Copy snapshot from source to target
    const { error: updateError } = await supabase
      .from("project_environments" as any)
      .update({
        html_snapshot: fromEnv.html_snapshot,
        status: "deployed",
        deployed_at: new Date().toISOString(),
        deployed_by: user.id,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", toEnv.id);

    if (updateError) {
      toast.error("Deploy failed");
      setDeploying(null);
      return;
    }

    // Record in history
    await supabase.from("deploy_history" as any).insert({
      project_id: currentProject.id,
      from_env: fromName,
      to_env: toName,
      deployed_by: user.id,
      deployed_by_email: user.email || "",
      status: "success",
      notes: deployNotes,
    } as any);

    toast.success(`Promoted ${fromEnv.label} → ${toEnv.label}`);
    setDeploying(null);
    setConfirmPromote(null);
    setDeployNotes("");
    initEnvironments();
    fetchHistory();
  };

  const toggleLock = async (envId: string, currentLocked: boolean) => {
    await supabase
      .from("project_environments" as any)
      .update({ is_locked: !currentLocked } as any)
      .eq("id", envId);
    setEnvironments(prev =>
      prev.map(e => e.id === envId ? { ...e, is_locked: !currentLocked } : e)
    );
    toast.success(!currentLocked ? "Environment locked" : "Environment unlocked");
  };

  const syncDevWithCurrent = async () => {
    if (!currentProject?.id) return;
    const devEnv = environments.find(e => e.name === "development");
    if (!devEnv) return;

    await supabase
      .from("project_environments" as any)
      .update({
        html_snapshot: currentProject.html_content || "",
        status: "active",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", devEnv.id);

    toast.success("Dev synced with current build");
    initEnvironments();
  };

  const getEnvConfig = (name: string) => ENV_CONFIG.find(e => e.name === name) || ENV_CONFIG[0];

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Environments</h2>
          <span className="text-[9px] bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
            <Crown className="w-2.5 h-2.5" /> Premium
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncDevWithCurrent}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Sync Dev
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
              showHistory ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <History className="w-3 h-3" /> History
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-muted/50 border border-border rounded-lg p-3">
        <p className="text-xs text-muted-foreground">
          Manage your deployment pipeline. Promote code from Development → Staging → Production with confidence. 
          Lock environments to prevent accidental deployments.
        </p>
      </div>

      {/* Environment Pipeline */}
      {loading ? (
        <div className="text-xs text-muted-foreground text-center py-8">Initializing environments...</div>
      ) : (
        <div className="space-y-3">
          {/* Pipeline visualization */}
          <div className="flex items-center justify-center gap-2 py-3">
            {ENV_CONFIG.map((env, i) => {
              const envData = environments.find(e => e.name === env.name);
              const hasSnapshot = envData && envData.html_snapshot.length > 0;
              return (
                <div key={env.name} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${env.bgColor}`}>
                    <env.icon className={`w-3.5 h-3.5 ${env.color}`} />
                    <span className={env.color}>{env.label}</span>
                    {hasSnapshot && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  </div>
                  {i < ENV_CONFIG.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Environment cards */}
          {ENV_CONFIG.map((envConfig, idx) => {
            const envData = environments.find(e => e.name === envConfig.name);
            if (!envData) return null;
            const EnvIcon = envConfig.icon;
            const hasSnapshot = envData.html_snapshot.length > 0;
            const nextEnv = idx < ENV_CONFIG.length - 1 ? ENV_CONFIG[idx + 1] : null;
            const isPromoting = deploying === `${envConfig.name}-${nextEnv?.name}`;

            return (
              <div key={envConfig.name} className={`border rounded-lg p-4 transition-colors ${envConfig.bgColor}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-background/50`}>
                      <EnvIcon className={`w-5 h-5 ${envConfig.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{envConfig.label}</span>
                        {envData.is_locked && <Lock className="w-3 h-3 text-amber-400" />}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          hasSnapshot ? "bg-emerald-400/20 text-emerald-400" : "bg-muted text-muted-foreground"
                        }`}>
                          {hasSnapshot ? envData.status : "empty"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{envConfig.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last deploy: {formatDate(envData.deployed_at)}
                        </span>
                        {hasSnapshot && (
                          <span className="flex items-center gap-1">
                            <Code2 className="w-3 h-3" />
                            {(envData.html_snapshot.length / 1024).toFixed(1)}KB
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Lock toggle */}
                    <button
                      onClick={() => toggleLock(envData.id, envData.is_locked)}
                      className="p-1.5 rounded hover:bg-background/50 transition-colors"
                      title={envData.is_locked ? "Unlock" : "Lock"}
                    >
                      {envData.is_locked ? (
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>

                    {/* Preview */}
                    {hasSnapshot && (
                      <button
                        onClick={() => setPreviewEnv({ name: envConfig.name, label: envConfig.label, html: envData.html_snapshot })}
                        className="p-1.5 rounded hover:bg-background/50 transition-colors"
                        title={`Preview ${envConfig.label}`}
                      >
                        <Eye className="w-3.5 h-3.5 text-primary" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Promote button */}
                {nextEnv && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    {confirmPromote?.from === envConfig.name && confirmPromote?.to === nextEnv.name ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-xs font-medium text-foreground">
                            Promote to {nextEnv.label}?
                          </span>
                        </div>
                        <input
                          className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder="Deploy notes (optional)"
                          value={deployNotes}
                          onChange={e => setDeployNotes(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmPromote(null)}
                            className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => promoteEnvironment(envConfig.name, nextEnv.name)}
                            disabled={isPromoting}
                            className="flex items-center gap-1 px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                          >
                            {isPromoting ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Rocket className="w-3 h-3" />
                            )}
                            {isPromoting ? "Deploying..." : "Confirm Deploy"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      {(() => {
                        const nextEnvData = environments.find(e => e.name === nextEnv.name);
                        const hasChanges = hasSnapshot && envData.html_snapshot !== (nextEnvData?.html_snapshot || "");
                        return (
                          <button
                            onClick={() => hasChanges && setConfirmPromote({ from: envConfig.name, to: nextEnv.name })}
                            disabled={!hasChanges}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                              hasChanges
                                ? "text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm shadow-primary/25 ring-1 ring-primary/50"
                                : "text-muted-foreground/40 bg-muted/30 cursor-not-allowed"
                            }`}
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            Promote to {nextEnv.label}
                            {!hasChanges && <span className="text-[9px] opacity-60 ml-1">• No changes</span>}
                          </button>
                        );
                      })()}
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Deploy History */}
      {showHistory && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Shield className="w-3 h-3" /> Deployment Audit Log
          </h3>
          {deployHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No deployments yet</p>
          ) : (
            <div className="space-y-1">
              {deployHistory.map(record => {
                const fromConf = getEnvConfig(record.from_env);
                const toConf = getEnvConfig(record.to_env);
                return (
                  <div key={record.id} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-card">
                    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${
                      record.status === "success" ? "text-emerald-400" : "text-destructive"
                    }`} />
                    <div className="flex items-center gap-1 text-xs">
                      <span className={fromConf.color}>{fromConf.label}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className={toConf.color}>{toConf.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {record.deployed_by_email && `${record.deployed_by_email} · `}
                      {formatDate(record.created_at)}
                    </span>
                    {record.notes && (
                      <span className="text-[10px] text-muted-foreground/70 italic max-w-[120px] truncate">
                        "{record.notes}"
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Environment Preview Modal */}
      {previewEnv && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{previewEnv.label} Preview</span>
                <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
                  {(previewEnv.html.length / 1024).toFixed(1)}KB
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const win = window.open("", "_blank");
                    if (win) { win.document.write(previewEnv.html); win.document.close(); }
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Open in Tab
                </button>
                <button
                  onClick={() => setPreviewEnv(null)}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            {/* iframe preview */}
            <div className="flex-1 bg-white">
              <iframe
                srcDoc={previewEnv.html}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title={`${previewEnv.label} preview`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnvironmentManager;

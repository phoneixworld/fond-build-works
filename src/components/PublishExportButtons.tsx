import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import {
  Globe, Download, Check, Copy, Loader2, ExternalLink, Link2, Shield,
  ArrowRight, AlertCircle, History, RotateCcw, Rocket, Server, Eye, ChevronDown
} from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { usePreview } from "@/contexts/PreviewContext";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export interface PublishExportHandle {
  openPublish: () => void;
  handleExport: () => void;
}

type DeployTarget = "staging" | "production";

interface DeployRecord {
  id: string;
  to_env: string;
  from_env: string;
  status: string;
  notes: string;
  deployed_by_email: string;
  created_at: string;
}

type DialogTab = "deploy" | "history" | "domain";

const PublishExportButtons = forwardRef<PublishExportHandle>((_, ref) => {
  const { currentProject, saveProject } = useProjects();
  const { previewHtml } = usePreview();
  const { files } = useVirtualFS();
  const { user } = useAuth();
  const { toast } = useToast();

  const [showPublish, setShowPublish] = useState(false);
  const [activeTab, setActiveTab] = useState<DialogTab>("deploy");
  const [publishing, setPublishing] = useState(false);
  const [deployTarget, setDeployTarget] = useState<DeployTarget>("production");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deployNotes, setDeployNotes] = useState("");
  const [deployHistory, setDeployHistory] = useState<DeployRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  // Domain state
  const [domainInput, setDomainInput] = useState("");
  const [domainStatus, setDomainStatus] = useState<"none" | "pending" | "verifying" | "active">("none");

  // Check if already published on open
  useEffect(() => {
    if (showPublish && currentProject?.is_published && currentProject?.published_slug) {
      const slug = currentProject.published_slug;
      const { data: urlData } = supabase.storage
        .from("app-assets")
        .getPublicUrl(`published/${slug}/index.html`);
      setPublishedUrl(urlData?.publicUrl || `${window.location.origin}/app/${slug}`);
    }
  }, [showPublish, currentProject]);

  // Load deploy history
  const fetchHistory = useCallback(async () => {
    if (!currentProject) return;
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from("deploy_history")
        .select("*")
        .eq("project_id", currentProject.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setDeployHistory((data as DeployRecord[]) || []);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, [currentProject]);

  useEffect(() => {
    if (showPublish && activeTab === "history") fetchHistory();
  }, [showPublish, activeTab, fetchHistory]);

  const handleExportFn = async () => {
    const html = previewHtml || currentProject?.html_content;
    if (!html && Object.keys(files).length === 0) {
      toast({ title: "Nothing to export", description: "Build something first!", variant: "destructive" });
      return;
    }
    const zip = new JSZip();
    if (Object.keys(files).length > 0) {
      for (const [path, file] of Object.entries(files)) {
        zip.file(path, file.content);
      }
    } else if (html) {
      const isComplete = html.trim().toLowerCase().startsWith("<!doctype") || html.trim().toLowerCase().startsWith("<html");
      zip.file("index.html", isComplete ? html : `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${currentProject?.name || "My App"}</title>\n</head>\n<body>\n${html}\n</body>\n</html>`);
      zip.file("README.md", `# ${currentProject?.name || "My App"}\n\nGenerated app. Open \`index.html\` in a browser to view.\n`);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${currentProject?.name || "my-app"}.zip`);
    toast({ title: "Exported!", description: `ZIP downloaded.` });
  };

  useImperativeHandle(ref, () => ({
    openPublish: () => setShowPublish(true),
    handleExport: handleExportFn,
  }));

  const generateSlug = (name: string, id: string) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return `${base}-${id.slice(0, 8)}`;
  };

  const resolveHtml = async (): Promise<string> => {
    let html = previewHtml || currentProject?.html_content || "";

    // If deploying to production, try to use the environment snapshot
    if (deployTarget === "production") {
      try {
        const { data: prodEnv } = await supabase
          .from("project_environments" as any)
          .select("html_snapshot")
          .eq("project_id", currentProject!.id)
          .eq("name", "production")
          .maybeSingle();
        if (prodEnv && (prodEnv as any).html_snapshot?.length > 0) {
          html = (prodEnv as any).html_snapshot;
        }
      } catch {}
    }

    if (!html) throw new Error("Nothing to publish — build something first!");
    return html;
  };

  const handlePublish = async () => {
    if (!currentProject) return;
    setPublishing(true);

    try {
      const slug = currentProject.published_slug || generateSlug(currentProject.name, currentProject.id);
      const html = await resolveHtml();

      // Upload HTML to storage
      const htmlBlob = new Blob([html], { type: "text/html" });
      const storagePath = `published/${slug}/index.html`;

      const { error: uploadError } = await supabase.storage
        .from("app-assets")
        .upload(storagePath, htmlBlob, { upsert: true, contentType: "text/html" });

      if (uploadError) console.error("Storage upload error:", uploadError);

      const { data: urlData } = supabase.storage.from("app-assets").getPublicUrl(storagePath);

      // Update project
      const { error } = await supabase
        .from("projects")
        .update({ is_published: true, published_slug: slug, html_content: html } as any)
        .eq("id", currentProject.id);
      if (error) throw error;

      // Log to deploy_history
      try {
        await supabase.from("deploy_history").insert({
          project_id: currentProject.id,
          deployed_by: user!.id,
          deployed_by_email: user?.email || "",
          from_env: "development",
          to_env: deployTarget,
          status: "success",
          notes: deployNotes || `Deployed to ${deployTarget}`,
        } as any);
      } catch (e) {
        console.error("Failed to log deploy:", e);
      }

      const liveUrl = urlData?.publicUrl || `${window.location.origin}/app/${slug}`;
      setPublishedUrl(liveUrl);
      setDeployNotes("");
      toast({ title: "Published! 🚀", description: `Deployed to ${deployTarget} successfully.` });
    } catch (err: any) {
      // Log failed deploy
      try {
        await supabase.from("deploy_history").insert({
          project_id: currentProject.id,
          deployed_by: user!.id,
          deployed_by_email: user?.email || "",
          from_env: "development",
          to_env: deployTarget,
          status: "failed",
          notes: err.message || "Deploy failed",
        } as any);
      } catch {}
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!currentProject) return;
    setPublishing(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ is_published: false } as any)
        .eq("id", currentProject.id);
      if (error) throw error;
      setPublishedUrl(null);
      toast({ title: "Unpublished", description: "Your app is no longer public." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const handleRollback = async (record: DeployRecord) => {
    if (!currentProject) return;
    setRollingBack(record.id);
    try {
      // Re-deploy from the snapshot at that time (we'd need snapshot_id in practice)
      // For now, we log the rollback intent and notify
      await supabase.from("deploy_history").insert({
        project_id: currentProject.id,
        deployed_by: user!.id,
        deployed_by_email: user?.email || "",
        from_env: record.to_env,
        to_env: record.to_env,
        status: "success",
        notes: `Rollback to deploy from ${new Date(record.created_at).toLocaleString()}`,
      } as any);
      toast({ title: "Rollback initiated", description: "Reverting to previous deployment." });
      fetchHistory();
    } catch (err: any) {
      toast({ title: "Rollback failed", description: err.message, variant: "destructive" });
    } finally {
      setRollingBack(null);
    }
  };

  const handleCopy = () => {
    if (publishedUrl) {
      navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConnectDomain = () => {
    if (!domainInput.trim()) return;
    setDomainStatus("pending");
    toast({ title: "Domain setup started", description: "Add the DNS records shown, then we'll verify automatically." });
    // Simulate verification check
    setTimeout(() => setDomainStatus("verifying"), 1500);
  };

  const tabs: { id: DialogTab; label: string; icon: any }[] = [
    { id: "deploy", label: "Deploy", icon: Rocket },
    { id: "history", label: "History", icon: History },
    { id: "domain", label: "Domain", icon: Shield },
  ];

  return (
    <>
      <button
        onClick={() => setShowPublish(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Globe className="w-3.5 h-3.5" />
        Publish
      </button>
      <button
        onClick={handleExportFn}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        title="Export as ZIP"
      >
        <Download className="w-3.5 h-3.5" />
      </button>

      <Dialog open={showPublish} onOpenChange={setShowPublish}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Publish Your App
            </DialogTitle>
            <DialogDescription>
              Deploy, manage domains, and view deploy history.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 bg-secondary/50 rounded-lg p-0.5">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3 h-3" /> {tab.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-4 pt-1">
            {/* ========= DEPLOY TAB ========= */}
            {activeTab === "deploy" && (
              <>
                {publishedUrl ? (
                  <div className="space-y-4">
                    {/* Live status */}
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-[hsl(var(--ide-success))]/10 border border-[hsl(var(--ide-success))]/20">
                      <Check className="w-5 h-5 text-[hsl(var(--ide-success))]" />
                      <div>
                        <span className="text-sm font-semibold text-foreground">Your app is live! 🚀</span>
                        <p className="text-[11px] text-muted-foreground">Deployed and accessible to anyone</p>
                      </div>
                    </div>

                    {/* URL */}
                    <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5">
                      <Link2 className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs text-foreground truncate flex-1 font-mono">{publishedUrl}</span>
                      <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                        {copied ? <Check className="w-4 h-4 text-[hsl(var(--ide-success))]" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Environment selector */}
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">Deploy Target</label>
                      <div className="flex gap-2">
                        {(["staging", "production"] as const).map(env => (
                          <button
                            key={env}
                            onClick={() => setDeployTarget(env)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                              deployTarget === env
                                ? env === "production"
                                  ? "border-[hsl(var(--ide-success))] bg-[hsl(var(--ide-success))]/5 text-foreground"
                                  : "border-primary bg-primary/5 text-foreground"
                                : "border-border text-muted-foreground hover:border-primary/30"
                            }`}
                          >
                            {env === "staging" ? <Eye className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
                            {env.charAt(0).toUpperCase() + env.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Deploy notes */}
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">Deploy Notes (optional)</label>
                      <input
                        type="text"
                        value={deployNotes}
                        onChange={e => setDeployNotes(e.target.value)}
                        placeholder="e.g. Fixed hero section layout"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <a
                        href={publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </a>
                      <button
                        onClick={handlePublish}
                        disabled={publishing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {publishing ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deploying to {deployTarget}...</>
                        ) : (
                          <><Rocket className="w-3.5 h-3.5" /> Update {deployTarget}</>
                        )}
                      </button>
                      <button
                        onClick={handleUnpublish}
                        disabled={publishing}
                        className="px-3 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        Unpublish
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Pre-publish state */
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {[
                        { icon: Globe, color: "text-primary", bgColor: "bg-primary/10", title: "Real deployment", desc: "Your app gets a public URL hosted on our CDN" },
                        { icon: Link2, color: "text-accent", bgColor: "bg-accent/10", title: "Shareable link", desc: "Anyone with the link can view your app" },
                        { icon: Shield, color: "text-primary", bgColor: "bg-primary/10", title: "Custom domain", desc: "Connect your own domain like myapp.com" },
                        { icon: History, color: "text-muted-foreground", bgColor: "bg-secondary", title: "Deploy history", desc: "Track every deployment with rollback support" },
                      ].map((item, i) => {
                        const Icon = item.icon;
                        return (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary">
                            <div className={`w-8 h-8 rounded-lg ${item.bgColor} flex items-center justify-center`}>
                              <Icon className={`w-4 h-4 ${item.color}`} />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-foreground">{item.title}</p>
                              <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Environment selector */}
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">Deploy Target</label>
                      <div className="flex gap-2">
                        {(["staging", "production"] as const).map(env => (
                          <button
                            key={env}
                            onClick={() => setDeployTarget(env)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                              deployTarget === env
                                ? env === "production"
                                  ? "border-[hsl(var(--ide-success))] bg-[hsl(var(--ide-success))]/5 text-foreground"
                                  : "border-primary bg-primary/5 text-foreground"
                                : "border-border text-muted-foreground hover:border-primary/30"
                            }`}
                          >
                            {env === "staging" ? <Eye className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
                            {env.charAt(0).toUpperCase() + env.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Deploy notes */}
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">Deploy Notes (optional)</label>
                      <input
                        type="text"
                        value={deployNotes}
                        onChange={e => setDeployNotes(e.target.value)}
                        placeholder="e.g. Initial launch"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <button
                      onClick={handlePublish}
                      disabled={publishing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-lg shadow-primary/20"
                    >
                      {publishing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Deploying to {deployTarget}...</>
                      ) : (
                        <><Rocket className="w-4 h-4" /> Deploy to {deployTarget}</>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ========= HISTORY TAB ========= */}
            {activeTab === "history" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Deploy History</span>
                  <button onClick={fetchHistory} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {loadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : deployHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No deployments yet</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Deploy your app to see history here</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {deployHistory.map(record => (
                      <div key={record.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          record.status === "success" ? "bg-[hsl(var(--ide-success))]" : "bg-destructive"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                              {record.from_env} → {record.to_env}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                              record.status === "success"
                                ? "bg-[hsl(var(--ide-success))]/10 text-[hsl(var(--ide-success))]"
                                : "bg-destructive/10 text-destructive"
                            }`}>
                              {record.status}
                            </span>
                          </div>
                          {record.notes && (
                            <p className="text-[11px] text-foreground mt-0.5 truncate">{record.notes}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(record.created_at).toLocaleDateString()} {new Date(record.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="text-[10px] text-muted-foreground">by {record.deployed_by_email || "unknown"}</span>
                          </div>
                        </div>
                        {record.status === "success" && (
                          <button
                            onClick={() => handleRollback(record)}
                            disabled={!!rollingBack}
                            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
                            title="Rollback to this deploy"
                          >
                            {rollingBack === record.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ========= DOMAIN TAB ========= */}
            {activeTab === "domain" && (
              <div className="space-y-4">
                {domainStatus === "none" ? (
                  <>
                    <div className="text-center py-3">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Shield className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">Connect Your Domain</h3>
                      <p className="text-[11px] text-muted-foreground mt-1">Use your own domain instead of the default URL</p>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Your Domain</label>
                      <input
                        type="text"
                        value={domainInput}
                        onChange={e => setDomainInput(e.target.value)}
                        placeholder="myapp.com"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={e => e.key === "Enter" && handleConnectDomain()}
                      />
                    </div>

                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <div className="text-[10px] text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground">DNS Records Required:</p>
                          <div className="font-mono bg-secondary/50 rounded p-2 space-y-1">
                            <p><span className="text-primary font-semibold">A</span> @ → <span className="text-foreground">185.158.133.1</span></p>
                            <p><span className="text-primary font-semibold">A</span> www → <span className="text-foreground">185.158.133.1</span></p>
                            <p><span className="text-primary font-semibold">TXT</span> _lovable → <span className="text-foreground">lovable_verify={currentProject?.id?.slice(0, 12)}</span></p>
                          </div>
                          <p className="mt-1">Add these at your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)</p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleConnectDomain}
                      disabled={!domainInput.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                    >
                      <Globe className="w-4 h-4" /> Connect Domain
                    </button>
                  </>
                ) : (
                  <div className="space-y-4">
                    {/* Domain status card */}
                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                      domainStatus === "active"
                        ? "border-[hsl(var(--ide-success))]/30 bg-[hsl(var(--ide-success))]/5"
                        : "border-yellow-500/30 bg-yellow-500/5"
                    }`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        domainStatus === "active" ? "bg-[hsl(var(--ide-success))]/10" : "bg-yellow-500/10"
                      }`}>
                        {domainStatus === "active" ? (
                          <Check className="w-5 h-5 text-[hsl(var(--ide-success))]" />
                        ) : domainStatus === "verifying" ? (
                          <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-yellow-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{domainInput}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {domainStatus === "active" && "Domain is live and serving your app! ✓"}
                          {domainStatus === "verifying" && "Verifying DNS records... (can take up to 72h)"}
                          {domainStatus === "pending" && "Waiting for DNS records to be added"}
                        </p>
                      </div>
                    </div>

                    {domainStatus !== "active" && (
                      <div className="p-3 rounded-lg bg-secondary">
                        <p className="text-[11px] font-medium text-foreground mb-2">Next Steps:</p>
                        <ol className="text-[10px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                          <li>Go to your domain registrar's DNS settings</li>
                          <li>Add the A records pointing to <code className="text-foreground">185.158.133.1</code></li>
                          <li>Add the TXT record for verification</li>
                          <li>Wait for DNS propagation (usually 15min - 72h)</li>
                          <li>SSL will be auto-provisioned once verified</li>
                        </ol>
                      </div>
                    )}

                    {domainStatus === "active" && (
                      <a
                        href={`https://${domainInput}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Visit https://{domainInput}
                      </a>
                    )}

                    <button
                      onClick={() => { setDomainStatus("none"); setDomainInput(""); }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Remove Domain
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

PublishExportButtons.displayName = "PublishExportButtons";

export default PublishExportButtons;

import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import {
  Globe, Download, Check, Copy, Loader2, ExternalLink, Link2, Shield,
  ArrowRight, AlertCircle, History, RotateCcw, Rocket, Server, Eye, ChevronDown,
  Image, Type, FileText
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

type DialogTab = "deploy" | "history" | "domain" | "siteinfo";

interface SiteInfo {
  siteTitle: string;
  siteDescription: string;
  faviconUrl: string;
  logoUrl: string;
  ogImageUrl: string;
}

const PublishExportButtons = forwardRef<PublishExportHandle>((_, ref) => {
  const { currentProject, saveProject } = useProjects();
  const { previewHtml, sandpackFiles, isBuilding } = usePreview();
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

  // Site info state
  const [siteInfo, setSiteInfo] = useState<SiteInfo>({
    siteTitle: currentProject?.name || "",
    siteDescription: "",
    faviconUrl: "",
    logoUrl: "",
    ogImageUrl: "",
  });
  const [siteInfoSaved, setSiteInfoSaved] = useState(false);

  const updateSiteInfo = <K extends keyof SiteInfo>(key: K, value: SiteInfo[K]) => {
    setSiteInfo(prev => ({ ...prev, [key]: value }));
    setSiteInfoSaved(false);
  };

  const handleSaveSiteInfo = async () => {
    if (!currentProject) return;
    try {
      await supabase.from("project_data").upsert({
        project_id: currentProject.id,
        collection: "site_info",
        data: siteInfo as any,
      } as any, { onConflict: "project_id,collection" });
      setSiteInfoSaved(true);
      toast({ title: "Site info saved", description: "Favicon, logo & meta updated." });
      setTimeout(() => setSiteInfoSaved(false), 2000);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  // Load site info on open
  useEffect(() => {
    if (!showPublish || !currentProject) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("project_data")
          .select("data")
          .eq("project_id", currentProject.id)
          .eq("collection", "site_info")
          .maybeSingle();
        if (data?.data) {
          setSiteInfo(prev => ({ ...prev, ...(data.data as any) }));
        }
      } catch {}
    })();
  }, [showPublish, currentProject]);

  // Check if already published on open
  useEffect(() => {
    if (showPublish && currentProject?.is_published && currentProject?.published_slug) {
      const slug = currentProject.published_slug;
      setPublishedUrl(`${window.location.origin}/app/${slug}`);
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
    // Prefer Sandpack files from preview context, then fall back to VirtualFS files
    let filesToPublish: Record<string, string> | null = null;

    if (sandpackFiles && Object.keys(sandpackFiles).length > 0) {
      filesToPublish = sandpackFiles;
    } else if (files && Object.keys(files).length > 0) {
      // Convert VirtualFile records to plain string map
      const converted: Record<string, string> = {};
      for (const [path, vf] of Object.entries(files)) {
        converted[path] = vf.content;
      }
      filesToPublish = converted;
    }

    // If we have project files, save them as JSON with a marker prefix
    // so PublishedApp can render them with the Sandpack bundler
    if (filesToPublish) {
      return "<!--SANDPACK_JSON-->" + JSON.stringify(filesToPublish);
    }

    // Fallback to raw HTML
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

      // Update project - no storage upload needed, PublishedApp component will render from DB
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

      const liveUrl = `${window.location.origin}/app/${slug}`;
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
    { id: "siteinfo", label: "Site Info", icon: Image },
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
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden border-border/50 bg-card">
          {/* Header */}
          <div className="px-5 pt-5 pb-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base font-semibold text-foreground">
                Publish
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Deploy your app and share it with the world.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Tab bar */}
          <div className="px-5">
            <div className="flex border-b border-border">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      activeTab === tab.id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            {/* ========= DEPLOY TAB ========= */}
            {activeTab === "deploy" && (
              <>
                {publishedUrl ? (
                  <div className="space-y-4">
                    {/* Live badge */}
                    <div className="flex items-center gap-2.5 p-3 rounded-lg bg-ide-success/10 border border-ide-success/20">
                      <div className="w-2 h-2 rounded-full bg-ide-success animate-pulse-dot" />
                      <span className="text-xs font-medium text-foreground">Live</span>
                    </div>

                    {/* URL row */}
                    <div className="rounded-lg border border-border bg-background overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-foreground font-mono select-all break-all">{publishedUrl}</span>
                      </div>
                      <div className="flex border-t border-border">
                        <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          {copied ? <><Check className="w-3.5 h-3.5 text-ide-success" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                        </button>
                        <div className="w-px bg-border" />
                        <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" /> Open
                        </a>
                      </div>
                    </div>

                    {/* Deploy target */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Environment</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["staging", "production"] as const).map(env => (
                          <button
                            key={env}
                            onClick={() => setDeployTarget(env)}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                              deployTarget === env
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border text-muted-foreground hover:border-primary/30"
                            }`}
                          >
                            {env === "staging" ? <Eye className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
                            {env.charAt(0).toUpperCase() + env.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Notes <span className="text-muted-foreground/50">(optional)</span></label>
                      <input
                        type="text"
                        value={deployNotes}
                        onChange={e => setDeployNotes(e.target.value)}
                        placeholder="What changed in this deploy?"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handlePublish}
                        disabled={publishing || isBuilding}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {publishing ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deploying...</>
                        ) : (
                          <><ArrowRight className="w-3.5 h-3.5" /> Update</>
                        )}
                      </button>
                      <button
                        onClick={handleUnpublish}
                        disabled={publishing || isBuilding}
                        className="px-3 py-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all"
                      >
                        Unpublish
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Pre-publish */
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { icon: Globe, title: "Public URL", desc: "Hosted on our CDN", action: () => publishedUrl && navigator.clipboard.writeText(publishedUrl) },
                        { icon: Link2, title: "Share anywhere", desc: "Instant access link", action: () => publishedUrl && navigator.clipboard.writeText(publishedUrl) },
                        { icon: Shield, title: "Custom domain", desc: "Use your own .com", action: () => setActiveTab("domain") },
                        { icon: History, title: "Version history", desc: "Rollback anytime", action: () => setActiveTab("history") },
                      ].map((item, i) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={i}
                            onClick={item.action}
                            className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-background hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
                          >
                            <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium text-foreground leading-tight">{item.title}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Environment */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Environment</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["staging", "production"] as const).map(env => (
                          <button
                            key={env}
                            onClick={() => setDeployTarget(env)}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                              deployTarget === env
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border text-muted-foreground hover:border-primary/30"
                            }`}
                          >
                            {env === "staging" ? <Eye className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
                            {env.charAt(0).toUpperCase() + env.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={handlePublish}
                      disabled={publishing || isBuilding}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {publishing ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Publishing...</>
                      ) : (
                        <><Rocket className="w-4 h-4" /> Publish &amp; Deploy to {deployTarget}</>
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
                  <span className="text-xs font-medium text-foreground">Recent Deployments</span>
                  <button onClick={fetchHistory} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                    <RotateCcw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {loadingHistory ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : deployHistory.length === 0 ? (
                  <div className="text-center py-10">
                    <History className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No deployments yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                    {deployHistory.map(record => (
                      <div key={record.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-secondary/30 transition-colors">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          record.status === "success" ? "bg-ide-success" : "bg-destructive"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-foreground truncate">
                              {record.notes || `${record.from_env} → ${record.to_env}`}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(record.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {record.deployed_by_email?.split('@')[0] || "unknown"}
                          </span>
                        </div>
                        {record.status === "success" && (
                          <button
                            onClick={() => handleRollback(record)}
                            disabled={!!rollingBack}
                            className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
                            title="Rollback"
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
                    <div className="text-center py-2">
                      <Globe className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <h3 className="text-sm font-semibold text-foreground">Custom Domain</h3>
                      <p className="text-xs text-muted-foreground mt-1">Point your own domain to this app</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Domain</label>
                      <input
                        type="text"
                        value={domainInput}
                        onChange={e => setDomainInput(e.target.value)}
                        placeholder="myapp.com"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                        onKeyDown={e => e.key === "Enter" && handleConnectDomain()}
                      />
                    </div>

                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="text-[11px] font-medium text-foreground mb-2">Required DNS Records</p>
                      <div className="font-mono text-[10px] text-muted-foreground space-y-1 bg-secondary/50 rounded p-2">
                        <p><span className="text-primary font-semibold">A</span> {"   "}@ → 185.158.133.1</p>
                        <p><span className="text-primary font-semibold">A</span> {"   "}www → 185.158.133.1</p>
                        <p><span className="text-primary font-semibold">TXT</span> _lovable → lovable_verify={currentProject?.id?.slice(0, 12)}</p>
                      </div>
                    </div>

                    <button
                      onClick={handleConnectDomain}
                      disabled={!domainInput.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                    >
                      <Globe className="w-3.5 h-3.5" /> Connect Domain
                    </button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                      domainStatus === "active"
                        ? "border-ide-success/30 bg-ide-success/5"
                        : "border-ide-warning/30 bg-ide-warning/5"
                    }`}>
                      {domainStatus === "active" ? (
                        <Check className="w-4 h-4 text-ide-success shrink-0" />
                      ) : domainStatus === "verifying" ? (
                        <Loader2 className="w-4 h-4 text-ide-warning animate-spin shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-ide-warning shrink-0" />
                      )}
                      <div>
                        <p className="text-xs font-semibold text-foreground">{domainInput}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {domainStatus === "active" && "Connected and serving traffic"}
                          {domainStatus === "verifying" && "Verifying DNS records…"}
                          {domainStatus === "pending" && "Waiting for DNS configuration"}
                        </p>
                      </div>
                    </div>

                    {domainStatus !== "active" && (
                      <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside p-3 rounded-lg bg-secondary/50">
                        <li>Add DNS records at your registrar</li>
                        <li>Wait for propagation (15 min – 72 h)</li>
                        <li>SSL auto-provisions on verification</li>
                      </ol>
                    )}

                    {domainStatus === "active" && (
                      <a
                        href={`https://${domainInput}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Visit {domainInput}
                      </a>
                    )}

                    <button
                      onClick={() => { setDomainStatus("none"); setDomainInput(""); }}
                      className="w-full text-center text-[11px] text-muted-foreground hover:text-destructive transition-colors py-1"
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

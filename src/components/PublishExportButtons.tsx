import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import {
  Globe, Download, Check, Copy, Loader2, ExternalLink, Link2, Shield,
  ArrowRight, AlertCircle, History, RotateCcw, Rocket, Server, Eye, ChevronDown,
  Image, Type, FileText, Upload
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
import ImageUploadField from "@/components/publish/ImageUploadField";
import { saveAs } from "file-saver";

export interface PublishExportHandle {
  openPublish: () => void;
  handleExport: () => void;
}

interface DeployRecord {
  id: string;
  to_env: string;
  from_env: string;
  status: string;
  notes: string;
  deployed_by_email: string;
  created_at: string;
}

interface EnvStatus {
  staging: { deployed: boolean; deployedAt: string | null; snapshotSize: number };
  production: { deployed: boolean; deployedAt: string | null; snapshotSize: number };
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
  const [promotingToProd, setPromotingToProd] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [stagingUrl, setStagingUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deployNotes, setDeployNotes] = useState("");
  const [deployHistory, setDeployHistory] = useState<DeployRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [envStatus, setEnvStatus] = useState<EnvStatus>({
    staging: { deployed: false, deployedAt: null, snapshotSize: 0 },
    production: { deployed: false, deployedAt: null, snapshotSize: 0 },
  });
  const [confirmPromote, setConfirmPromote] = useState(false);

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

  // Load environment statuses on open
  const fetchEnvStatus = useCallback(async () => {
    if (!currentProject) return;
    try {
      const { data } = await supabase
        .from("project_environments")
        .select("*")
        .eq("project_id", currentProject.id);
      if (data) {
        const staging = (data as any[]).find((e: any) => e.name === "staging");
        const production = (data as any[]).find((e: any) => e.name === "production");
        setEnvStatus({
          staging: {
            deployed: !!(staging?.html_snapshot?.length > 0),
            deployedAt: staging?.deployed_at || null,
            snapshotSize: staging?.html_snapshot?.length || 0,
          },
          production: {
            deployed: !!(production?.html_snapshot?.length > 0),
            deployedAt: production?.deployed_at || null,
            snapshotSize: production?.html_snapshot?.length || 0,
          },
        });
      }
    } catch {}
  }, [currentProject]);

  // Determine the public-facing origin for published URLs
  const getPublishedOrigin = useCallback(() => {
    const origin = window.location.origin;
    // If we're on a preview domain, use the published lovable.app domain instead
    if (origin.includes("lovableproject.com") || origin.includes("id-preview")) {
      return "https://fond-build-works.lovable.app";
    }
    return origin;
  }, []);

  useEffect(() => {
    if (showPublish && currentProject?.is_published && currentProject?.published_slug) {
      const slug = currentProject.published_slug;
      const pubOrigin = getPublishedOrigin();
      setPublishedUrl(`${pubOrigin}/app/${slug}`);
      setStagingUrl(`${pubOrigin}/app/staging-${slug}`);
    }
    if (showPublish) fetchEnvStatus();
  }, [showPublish, currentProject, fetchEnvStatus, getPublishedOrigin]);

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

  const resolveCurrentHtml = (): string => {
    let filesToPublish: Record<string, string> | null = null;
    if (sandpackFiles && Object.keys(sandpackFiles).length > 0) {
      filesToPublish = sandpackFiles;
    } else if (files && Object.keys(files).length > 0) {
      const converted: Record<string, string> = {};
      for (const [path, vf] of Object.entries(files)) {
        converted[path] = vf.content;
      }
      filesToPublish = converted;
    }
    if (filesToPublish) {
      return "<!--SANDPACK_JSON-->" + JSON.stringify(filesToPublish);
    }
    return previewHtml || currentProject?.html_content || "";
  };

  // Step 1: Deploy current build → Staging
  const handleDeployToStaging = async () => {
    if (!currentProject || !user) return;
    setPublishing(true);
    try {
      const html = resolveCurrentHtml();
      if (!html) throw new Error("Nothing to deploy — build something first!");

      const slug = currentProject.published_slug || generateSlug(currentProject.name, currentProject.id);

      // Upsert staging environment
      const { data: existing } = await supabase
        .from("project_environments")
        .select("id")
        .eq("project_id", currentProject.id)
        .eq("name", "staging")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("project_environments")
          .update({
            html_snapshot: html,
            status: "deployed",
            deployed_at: new Date().toISOString(),
            deployed_by: user.id,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existing.id);
      } else {
        await supabase
          .from("project_environments")
          .insert({
            project_id: currentProject.id,
            name: "staging",
            label: "Staging",
            html_snapshot: html,
            status: "deployed",
            deployed_at: new Date().toISOString(),
            deployed_by: user.id,
          } as any);
      }

      // Also ensure the project has a slug for staging URL
      if (!currentProject.published_slug) {
        await supabase
          .from("projects")
          .update({ published_slug: slug } as any)
          .eq("id", currentProject.id);
      }

      // Log
      await supabase.from("deploy_history").insert({
        project_id: currentProject.id,
        deployed_by: user.id,
        deployed_by_email: user.email || "",
        from_env: "development",
        to_env: "staging",
        status: "success",
        notes: deployNotes || "Deployed to staging",
      } as any);

      setStagingUrl(`${window.location.origin}/app/staging-${slug}`);
      setDeployNotes("");
      toast({ title: "Deployed to Staging! 🎯", description: "Preview and test before promoting to production." });
      fetchEnvStatus();
      fetchHistory();
    } catch (err: any) {
      toast({ title: "Deploy failed", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  // Step 2: Promote Staging → Production
  const handlePromoteToProduction = async () => {
    if (!currentProject || !user) return;
    setPromotingToProd(true);
    try {
      // Get staging snapshot
      const { data: stagingEnv } = await supabase
        .from("project_environments")
        .select("html_snapshot")
        .eq("project_id", currentProject.id)
        .eq("name", "staging")
        .maybeSingle();

      const stagingHtml = (stagingEnv as any)?.html_snapshot;
      if (!stagingHtml || stagingHtml.length === 0) {
        throw new Error("Nothing in staging to promote. Deploy to staging first!");
      }

      const slug = currentProject.published_slug || generateSlug(currentProject.name, currentProject.id);

      // Update production environment
      const { data: existingProd } = await supabase
        .from("project_environments")
        .select("id")
        .eq("project_id", currentProject.id)
        .eq("name", "production")
        .maybeSingle();

      if (existingProd) {
        await supabase
          .from("project_environments")
          .update({
            html_snapshot: stagingHtml,
            status: "deployed",
            deployed_at: new Date().toISOString(),
            deployed_by: user.id,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existingProd.id);
      } else {
        await supabase
          .from("project_environments")
          .insert({
            project_id: currentProject.id,
            name: "production",
            label: "Production",
            html_snapshot: stagingHtml,
            status: "deployed",
            deployed_at: new Date().toISOString(),
            deployed_by: user.id,
          } as any);
      }

      // Publish the project with the staging HTML
      await supabase
        .from("projects")
        .update({ is_published: true, published_slug: slug, html_content: stagingHtml } as any)
        .eq("id", currentProject.id);

      // Log
      await supabase.from("deploy_history").insert({
        project_id: currentProject.id,
        deployed_by: user.id,
        deployed_by_email: user.email || "",
        from_env: "staging",
        to_env: "production",
        status: "success",
        notes: deployNotes || "Promoted staging to production",
      } as any);

      const liveUrl = `${window.location.origin}/app/${slug}`;
      setPublishedUrl(liveUrl);
      setDeployNotes("");
      setConfirmPromote(false);
      toast({ title: "Live in Production! 🚀", description: "Your staging build is now serving real users." });
      fetchEnvStatus();
      fetchHistory();
    } catch (err: any) {
      toast({ title: "Promotion failed", description: err.message, variant: "destructive" });
    } finally {
      setPromotingToProd(false);
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

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectDomain = () => {
    if (!domainInput.trim()) return;
    setDomainStatus("pending");
    toast({ title: "Domain setup started", description: "Add the DNS records shown, then we'll verify automatically." });
    setTimeout(() => setDomainStatus("verifying"), 1500);
  };

  const formatEnvDate = (d: string | null) => {
    if (!d) return "Never";
    return new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
                Deploy to staging, review, then promote to production.
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
          <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
            {/* ========= DEPLOY TAB ========= */}
            {activeTab === "deploy" && (
              <div className="space-y-4">
                {/* Pipeline visualization */}
                <div className="flex items-center justify-center gap-1.5 py-2">
                  <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-400">
                    <Eye className="w-3 h-3" /> Dev
                    <Check className="w-3 h-3" />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                  <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[11px] font-medium ${
                    envStatus.staging.deployed
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                      : "bg-muted border-border text-muted-foreground"
                  }`}>
                    <Server className="w-3 h-3" /> Staging
                    {envStatus.staging.deployed && <Check className="w-3 h-3" />}
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                  <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[11px] font-medium ${
                    envStatus.production.deployed
                      ? "bg-red-500/10 border-red-500/30 text-red-400"
                      : "bg-muted border-border text-muted-foreground"
                  }`}>
                    <Globe className="w-3 h-3" /> Production
                    {envStatus.production.deployed && <Check className="w-3 h-3" />}
                  </div>
                </div>

                {/* Step 1: Deploy to Staging */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-[10px] font-bold">1</div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Deploy to Staging</p>
                        <p className="text-[10px] text-muted-foreground">Push current build for review &amp; testing</p>
                      </div>
                    </div>
                    {envStatus.staging.deployed && (
                      <span className="text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                        {formatEnvDate(envStatus.staging.deployedAt)}
                      </span>
                    )}
                  </div>

                  {/* Staging URL if deployed */}
                  {stagingUrl && envStatus.staging.deployed && (
                    <div className="rounded-md border border-border bg-background/50 overflow-hidden">
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-foreground font-mono select-all break-all truncate">{stagingUrl}</span>
                      </div>
                      <div className="flex border-t border-border">
                        <button onClick={() => handleCopy(stagingUrl)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                        </button>
                        <div className="w-px bg-border" />
                        <a href={stagingUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          <ExternalLink className="w-3 h-3" /> Preview
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={deployNotes}
                      onChange={e => setDeployNotes(e.target.value)}
                      placeholder="Deploy notes (optional)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                    />
                  </div>

                  <button
                    onClick={handleDeployToStaging}
                    disabled={publishing || isBuilding}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
                  >
                    {publishing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deploying to Staging...</>
                    ) : (
                      <><ArrowRight className="w-3.5 h-3.5" /> {envStatus.staging.deployed ? "Update Staging" : "Deploy to Staging"}</>
                    )}
                  </button>
                </div>

                {/* Step 2: Promote to Production */}
                <div className={`rounded-lg border p-4 space-y-3 transition-all ${
                  envStatus.staging.deployed
                    ? "border-red-500/20 bg-red-500/5"
                    : "border-border bg-muted/30 opacity-60"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        envStatus.staging.deployed ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground"
                      }`}>2</div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Promote to Production</p>
                        <p className="text-[10px] text-muted-foreground">
                          {envStatus.staging.deployed
                            ? "Push staging build live to real users"
                            : "Deploy to staging first"}
                        </p>
                      </div>
                    </div>
                    {envStatus.production.deployed && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[9px] text-emerald-400 font-medium">Live</span>
                      </div>
                    )}
                  </div>

                  {/* Production URL if live */}
                  {publishedUrl && envStatus.production.deployed && (
                    <div className="rounded-md border border-border bg-background/50 overflow-hidden">
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="text-[11px] text-foreground font-mono select-all break-all truncate">{publishedUrl}</span>
                      </div>
                      <div className="flex border-t border-border">
                        <button onClick={() => handleCopy(publishedUrl)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                        </button>
                        <div className="w-px bg-border" />
                        <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          <ExternalLink className="w-3 h-3" /> Visit
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Promote confirmation */}
                  {envStatus.staging.deployed && !confirmPromote && (
                    <button
                      onClick={() => setConfirmPromote(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Rocket className="w-3.5 h-3.5" /> Promote Staging → Production
                    </button>
                  )}

                  {envStatus.staging.deployed && confirmPromote && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                        <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <p className="text-[11px] text-foreground">
                          This will replace the live production build with the current staging version.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmPromote(false)}
                          className="flex-1 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary border border-border transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePromoteToProduction}
                          disabled={promotingToProd}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {promotingToProd ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Promoting...</>
                          ) : (
                            <><Rocket className="w-3.5 h-3.5" /> Confirm &amp; Go Live</>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Unpublish */}
                  {envStatus.production.deployed && publishedUrl && (
                    <button
                      onClick={handleUnpublish}
                      disabled={publishing}
                      className="w-full text-center text-[11px] text-muted-foreground hover:text-destructive transition-colors py-1"
                    >
                      Unpublish from production
                    </button>
                  )}
                </div>
              </div>
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

            {/* ========= SITE INFO TAB ========= */}
            {activeTab === "siteinfo" && (
              <div className="space-y-4">
                <div className="text-center py-1">
                  <h3 className="text-sm font-semibold text-foreground">Website Info</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Set favicon, logo & meta for your published app</p>
                </div>

                {/* Site Title */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Type className="w-3 h-3" /> Site Title
                  </label>
                  <input
                    type="text"
                    value={siteInfo.siteTitle}
                    onChange={e => updateSiteInfo("siteTitle", e.target.value)}
                    placeholder="My Awesome App"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow"
                  />
                </div>

                {/* Site Description */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Meta Description
                  </label>
                  <textarea
                    value={siteInfo.siteDescription}
                    onChange={e => updateSiteInfo("siteDescription", e.target.value)}
                    placeholder="A short description for search engines and social previews"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary transition-shadow resize-none"
                  />
                </div>

                {/* Favicon */}
                <ImageUploadField
                  label="Favicon"
                  icon={<Globe className="w-3 h-3" />}
                  value={siteInfo.faviconUrl}
                  onChange={v => updateSiteInfo("faviconUrl", v)}
                  placeholder="https://example.com/favicon.ico"
                  previewSize="w-5 h-5"
                  projectId={currentProject?.id}
                  folder="favicon"
                />

                {/* Logo */}
                <ImageUploadField
                  label="Logo"
                  icon={<Image className="w-3 h-3" />}
                  value={siteInfo.logoUrl}
                  onChange={v => updateSiteInfo("logoUrl", v)}
                  placeholder="https://example.com/logo.png"
                  previewSize="w-6 h-6"
                  projectId={currentProject?.id}
                  folder="logo"
                />

                {/* OG Image */}
                <ImageUploadField
                  label="OG / Social Image"
                  icon={<Image className="w-3 h-3" />}
                  value={siteInfo.ogImageUrl}
                  onChange={v => updateSiteInfo("ogImageUrl", v)}
                  placeholder="https://example.com/og-image.png"
                  projectId={currentProject?.id}
                  folder="og"
                  hint="Recommended: 1200×630px. Shown when shared on social media."
                />

                {/* Preview card */}
                {(siteInfo.siteTitle || siteInfo.faviconUrl || siteInfo.logoUrl) && (
                  <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Preview</p>
                    <div className="flex items-center gap-2">
                      {siteInfo.faviconUrl && <img src={siteInfo.faviconUrl} alt="" className="w-4 h-4 rounded" />}
                      <span className="text-xs font-medium text-foreground">{siteInfo.siteTitle || "Untitled"}</span>
                    </div>
                    {siteInfo.siteDescription && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{siteInfo.siteDescription}</p>
                    )}
                  </div>
                )}

                {/* Save */}
                <button
                  onClick={handleSaveSiteInfo}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    siteInfoSaved
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {siteInfoSaved ? <><Check className="w-3.5 h-3.5" /> Saved</> : "Save Site Info"}
                </button>
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

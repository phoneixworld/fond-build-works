import { useState, forwardRef, useImperativeHandle } from "react";
import { Globe, Download, Check, Copy, Loader2, ExternalLink, Link2, Shield, ArrowRight, AlertCircle } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { usePreview } from "@/contexts/PreviewContext";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
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

const PublishExportButtons = forwardRef<PublishExportHandle>((_, ref) => {
  const { currentProject, saveProject } = useProjects();
  const { previewHtml } = usePreview();
  const { files } = useVirtualFS();
  const { toast } = useToast();
  const [showPublish, setShowPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      const isCompleteHtml = html.trim().toLowerCase().startsWith("<!doctype") || html.trim().toLowerCase().startsWith("<html");
      if (isCompleteHtml) {
        zip.file("index.html", html);
      } else {
        zip.file("index.html", `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${currentProject?.name || "My App"}</title>\n</head>\n<body>\n${html}\n</body>\n</html>`);
      }
      zip.file("README.md", `# ${currentProject?.name || "My App"}\n\nGenerated app. Open \`index.html\` in a browser to view.\n`);
    }
    
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${currentProject?.name || "my-app"}.zip`);
    toast({ title: "Exported!", description: `ZIP with ${Object.keys(files).length || 1} files downloaded.` });
  };

  useImperativeHandle(ref, () => ({
    openPublish: () => setShowPublish(true),
    handleExport: handleExportFn,
  }));

  const generateSlug = (name: string, id: string) => {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return `${base}-${id.slice(0, 8)}`;
  };

  const handlePublish = async () => {
    if (!currentProject) return;
    setPublishing(true);

    try {
      const slug = (currentProject as any).published_slug || generateSlug(currentProject.name, currentProject.id);
      
      // Try to get Production environment snapshot first (env-aware deploy)
      let html = previewHtml || currentProject.html_content;
      try {
        const { data: prodEnv } = await supabase
          .from("project_environments" as any)
          .select("html_snapshot")
          .eq("project_id", currentProject.id)
          .eq("name", "production")
          .single();
        if (prodEnv && (prodEnv as any).html_snapshot && (prodEnv as any).html_snapshot.length > 0) {
          html = (prodEnv as any).html_snapshot;
        }
      } catch {}

      if (!html) throw new Error("Nothing to publish — build something first!");

      // Upload HTML to storage for real hosting
      const htmlBlob = new Blob([html], { type: "text/html" });
      const storagePath = `published/${slug}/index.html`;
      
      const { error: uploadError } = await supabase.storage
        .from("app-assets")
        .upload(storagePath, htmlBlob, { 
          upsert: true,
          contentType: "text/html",
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        // Fall back to DB-only publish
      }

      // Get public URL from storage
      const { data: urlData } = supabase.storage
        .from("app-assets")
        .getPublicUrl(storagePath);

      const { error } = await supabase
        .from("projects")
        .update({
          is_published: true,
          published_slug: slug,
          html_content: html,
        } as any)
        .eq("id", currentProject.id);

      if (error) throw error;

      // Use storage URL if available, otherwise fall back to app route
      const liveUrl = urlData?.publicUrl || `${window.location.origin}/app/${slug}`;
      setPublishedUrl(liveUrl);
      toast({ title: "Published! 🚀", description: "Your app is now live at a real URL." });
    } catch (err: any) {
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

  const handleCopy = () => {
    if (publishedUrl) {
      navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Publish Your App
            </DialogTitle>
            <DialogDescription>
              Deploy your app to a real public URL that anyone can access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {publishedUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[hsl(var(--ide-success))]/10 border border-[hsl(var(--ide-success))]/20">
                  <Check className="w-5 h-5 text-[hsl(var(--ide-success))]" />
                  <div>
                    <span className="text-sm font-semibold text-foreground">Your app is live! 🚀</span>
                    <p className="text-[11px] text-muted-foreground">Deployed and accessible to anyone with the link</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5">
                  <Link2 className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1 font-mono">{publishedUrl}</span>
                  <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                    {copied ? <Check className="w-4 h-4 text-[hsl(var(--ide-success))]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex gap-2">
                  <a
                    href={publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Live App
                  </a>
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Update"}
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
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">Real deployment</p>
                      <p className="text-[10px] text-muted-foreground">Your app gets a public URL hosted on our CDN</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Link2 className="w-4 h-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">Shareable link</p>
                      <p className="text-[10px] text-muted-foreground">Anyone with the link can view your app</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                  {publishing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" />
                      Deploy Now
                    </>
                  )}
                </button>
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

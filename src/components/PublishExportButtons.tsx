import { useState } from "react";
import { Globe, Download, Check, Copy, Loader2 } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { usePreview } from "@/contexts/PreviewContext";
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

const PublishExportButtons = () => {
  const { currentProject, saveProject } = useProjects();
  const { previewHtml } = usePreview();
  const { toast } = useToast();
  const [showPublish, setShowPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

      const { error } = await supabase
        .from("projects")
        .update({
          is_published: true,
          published_slug: slug,
          html_content: previewHtml || currentProject.html_content,
        } as any)
        .eq("id", currentProject.id);

      if (error) throw error;

      const url = `${window.location.origin}/app/${slug}`;
      setPublishedUrl(url);
      toast({ title: "Published!", description: "Your app is now live." });
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

  const handleExport = async () => {
    const html = previewHtml || currentProject?.html_content;
    if (!html) {
      toast({ title: "Nothing to export", description: "Build something first!", variant: "destructive" });
      return;
    }

    const zip = new JSZip();
    zip.file("index.html", `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${currentProject?.name || "My App"}</title>\n</head>\n<body>\n${html}\n</body>\n</html>`);
    zip.file("README.md", `# ${currentProject?.name || "My App"}\n\nGenerated app. Open \`index.html\` in a browser to view.\n\nTo deploy:\n- Upload to any static hosting (Netlify, Vercel, GitHub Pages)\n- Or simply open index.html locally\n`);

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${currentProject?.name || "my-app"}.zip`);
    toast({ title: "Exported!", description: "ZIP file downloaded." });
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
        onClick={handleExport}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        title="Export as ZIP"
      >
        <Download className="w-3.5 h-3.5" />
      </button>

      <Dialog open={showPublish} onOpenChange={setShowPublish}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Your App</DialogTitle>
            <DialogDescription>
              Make your app available at a public URL that anyone can access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {publishedUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-foreground">Your app is live!</span>
                </div>
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">{publishedUrl}</span>
                  <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground shrink-0">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <a
                    href={publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Open App
                  </a>
                  <button
                    onClick={handleUnpublish}
                    disabled={publishing}
                    className="px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    Unpublish
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Publishing creates a shareable link to your app. Anyone with the link can view it.
                </p>
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {publishing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" />
                      Publish Now
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
};

export default PublishExportButtons;

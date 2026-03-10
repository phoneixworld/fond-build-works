import { useState } from "react";
import { Settings, Copy, Check, Trash2, GitFork, Eye, EyeOff, Calendar, User, Hash, Globe, MessageCircle, Download } from "lucide-react";
import { useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProjectSettingsProps {
  onRenameClick?: () => void;
  onClone?: () => void;
}

const ProjectSettings = ({ onRenameClick, onClone }: ProjectSettingsProps) => {
  const { currentProject, deleteProject, saveProject, cloneProject } = useProjects();
  const { user } = useAuth();
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!currentProject) return null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({ title: "Copied", description: `${field} copied to clipboard` });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleClone = async () => {
    await cloneProject(currentProject.id);
    onClone?.();
  };

  const handleDelete = async () => {
    await deleteProject(currentProject.id);
    setDeleteOpen(false);
  };

  const togglePublish = async () => {
    await saveProject({ } as any);
    // This would need a dedicated publish toggle — for now it's display-only
  };

  const shortId = currentProject.id.slice(0, 8).toUpperCase();
  const createdAt = new Date(currentProject.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const updatedAt = new Date(currentProject.updated_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const chatCount = currentProject.chat_history?.length || 0;

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="ml-2 p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
      title={`Copy ${field}`}
    >
      {copiedField === field ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-ide-panel-header">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Project Settings</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Manage project details, visibility, and preferences.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Overview Card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Overview</h3>
          <div className="grid grid-cols-2 gap-y-4 gap-x-6">
            {/* Project Name */}
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Project Name</p>
              <p className="text-sm font-medium text-foreground">{currentProject.name}</p>
            </div>

            {/* Project ID */}
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Project ID</p>
              <div className="flex items-center">
                <code className="text-sm font-mono text-foreground bg-secondary px-2 py-0.5 rounded">{shortId}</code>
                <CopyButton text={currentProject.id} field="Project ID" />
              </div>
            </div>

            {/* Owner */}
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Owner</p>
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-sm text-foreground">{user?.email || "Unknown"}</p>
              </div>
            </div>

            {/* Created At */}
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Created</p>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-sm text-foreground">{createdAt}</p>
              </div>
            </div>


            {/* Messages Count */}
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Messages</p>
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{chatCount}</p>
              </div>
            </div>

            {/* Last Updated */}
            <div className="col-span-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Last Updated</p>
              <p className="text-sm text-foreground">{updatedAt}</p>
            </div>
          </div>
        </div>

        {/* Published Status */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Published</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentProject.is_published ? "Your app is live and accessible." : "Your app is not published yet."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {currentProject.is_published ? (
                <Eye className="w-4 h-4 text-green-500" />
              ) : (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${currentProject.is_published ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
                {currentProject.is_published ? "Live" : "Draft"}
              </span>
            </div>
          </div>
          {currentProject.published_slug && (
            <div className="mt-3 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <code className="text-xs font-mono text-muted-foreground">{currentProject.published_slug}.lovable.app</code>
              <CopyButton text={`${currentProject.published_slug}.lovable.app`} field="Published URL" />
            </div>
          )}
        </div>

        <Separator />

        {/* Actions */}
        <div className="space-y-1">
          {/* Rename */}
          <button
            onClick={onRenameClick}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-secondary/50 transition-colors text-left group"
          >
            <div>
              <p className="text-sm font-medium text-foreground">Rename project</p>
              <p className="text-xs text-muted-foreground">Update your project's title.</p>
            </div>
            <span className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              Rename
            </span>
          </button>

          {/* Clone */}
          <button
            onClick={handleClone}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-secondary/50 transition-colors text-left group"
          >
            <div>
              <p className="text-sm font-medium text-foreground">Clone project</p>
              <p className="text-xs text-muted-foreground">Duplicate this project with a new ID.</p>
            </div>
            <span className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              <GitFork className="w-3.5 h-3.5 inline mr-1" /> Clone
            </span>
          </button>

          <Separator />

          {/* Danger Zone */}
          <div className="pt-2">
            <p className="text-[11px] text-destructive uppercase tracking-wider font-medium mb-2 px-4">Danger Zone</p>
            <button
              onClick={() => setDeleteOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-destructive/10 transition-colors text-left group"
            >
              <div>
                <p className="text-sm font-medium text-destructive">Delete project</p>
                <p className="text-xs text-muted-foreground">Permanently delete this project and all its data.</p>
              </div>
              <span className="text-xs font-medium px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Delete
              </span>
            </button>
          </div>
        </div>

        {/* Support Reference */}
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">
            <Hash className="w-3 h-3 inline mr-1" />
            When contacting support, reference your Project ID: <code className="font-mono font-medium text-foreground">{shortId}</code>
          </p>
          <button
            onClick={() => copyToClipboard(`Project: ${currentProject.name}\nID: ${currentProject.id}\nOwner: ${user?.email}`, "Support Info")}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Copy full support info
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{currentProject.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All project data, chat history, and published content will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectSettings;

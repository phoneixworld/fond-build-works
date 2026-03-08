import { useState, useEffect, useCallback, useRef } from "react";
import { HardDrive, Upload, FolderOpen, Loader2, Trash2, Download, FileIcon, Image, File } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  metadata: { size: number; mimetype: string } | null;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) return Image;
  return File;
};

const CloudStorage = () => {
  const { currentProject } = useProjects();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const folderPath = currentProject ? `${currentProject.id}` : "";

  const fetchFiles = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    const { data, error } = await supabase.storage
      .from("app-assets")
      .list(folderPath, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
    if (error) {
      console.error("Storage list error:", error);
      setFiles([]);
    } else {
      setFiles((data || []).filter(f => f.name !== ".emptyFolderPlaceholder") as unknown as StorageFile[]);
    }
    setLoading(false);
  }, [currentProject, folderPath]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || !currentProject) return;
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(selectedFiles)) {
      const path = `${folderPath}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("app-assets").upload(path, file);
      if (error) {
        toast({ title: "Upload failed", description: `${file.name}: ${error.message}`, variant: "destructive" });
      } else {
        uploaded++;
      }
    }
    if (uploaded > 0) toast({ title: "Uploaded", description: `${uploaded} file(s) uploaded` });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchFiles();
  };

  const handleDelete = async (fileName: string) => {
    const { error } = await supabase.storage.from("app-assets").remove([`${folderPath}/${fileName}`]);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setFiles(prev => prev.filter(f => f.name !== fileName));
    }
  };

  const handleDownload = (fileName: string) => {
    const { data } = supabase.storage.from("app-assets").getPublicUrl(`${folderPath}/${fileName}`);
    window.open(data.publicUrl, "_blank");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Storage</span>
          <span className="text-xs text-muted-foreground">({files.length})</span>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload
        </button>
        <input ref={fileInputRef} type="file" multiple accept="image/*,application/*" onChange={handleUpload} className="hidden" />
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No files uploaded yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Upload files and media for your app</p>
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => {
              const Icon = getFileIcon(file.name);
              return (
                <div key={file.id || file.name} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-primary/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {file.metadata?.size ? formatSize(file.metadata.size) : "—"} · {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleDownload(file.name)} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(file.name)} className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-secondary transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CloudStorage;

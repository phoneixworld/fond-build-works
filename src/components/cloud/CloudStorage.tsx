import { HardDrive, Upload, FolderOpen } from "lucide-react";

const CloudStorage = () => {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-border bg-ide-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Storage</span>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Upload className="w-3.5 h-3.5" />
          Upload
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <FolderOpen className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No files uploaded yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Upload files and media for your app's storage
        </p>
      </div>
    </div>
  );
};

export default CloudStorage;

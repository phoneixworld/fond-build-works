import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FileType,
  Image,
} from "lucide-react";
import { useVirtualFS, FileNode } from "@/contexts/VirtualFSContext";

const getFileIcon = (name: string) => {
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return <FileCode className="w-3.5 h-3.5 text-[hsl(var(--ide-chat-user))]" />;
  if (name.endsWith(".jsx") || name.endsWith(".js")) return <FileCode className="w-3.5 h-3.5 text-[hsl(var(--ide-warning))]" />;
  if (name.endsWith(".json")) return <FileJson className="w-3.5 h-3.5 text-[hsl(var(--ide-warning))]" />;
  if (name.endsWith(".css")) return <FileCode className="w-3.5 h-3.5 text-accent" />;
  if (name.endsWith(".html")) return <FileType className="w-3.5 h-3.5 text-[hsl(var(--ide-chat-user))]" />;
  if (name.endsWith(".md")) return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
  if (name.endsWith(".svg") || name.endsWith(".png") || name.endsWith(".jpg")) return <Image className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" />;
  return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
};

const TreeItem = ({
  node,
  depth,
  activePath,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  activePath: string;
  onSelect: (path: string) => void;
}) => {
  const [open, setOpen] = useState(depth < 2);

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 w-full py-[3px] text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-sm transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
          {open ? (
            <FolderOpen className="w-3.5 h-3.5 text-[hsl(var(--ide-warning))] shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-[hsl(var(--ide-warning))] shrink-0" />
          )}
          <span className="ml-0.5 truncate">{node.name}</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} activePath={activePath} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  const isSelected = activePath === node.path;
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1 w-full py-[3px] text-[12px] rounded-sm transition-colors ${
        isSelected ? "bg-primary/15 text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {getFileIcon(node.name)}
      <span className="ml-0.5 truncate">{node.name}</span>
    </button>
  );
};

const FileTree = () => {
  const { fileTree, activeFile, setActiveFile } = useVirtualFS();

  if (fileTree.length === 0) {
    return (
      <div className="h-full bg-[hsl(var(--ide-panel))] flex items-center justify-center p-4">
        <p className="text-xs text-muted-foreground text-center">
          Build something to see the file tree
        </p>
      </div>
    );
  }

  return (
    <div className="h-full bg-[hsl(var(--ide-panel))] overflow-y-auto py-1.5">
      <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
        Explorer
      </div>
      {fileTree.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} activePath={activeFile} onSelect={setActiveFile} />
      ))}
    </div>
  );
};

export default FileTree;

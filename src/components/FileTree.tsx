import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";

type FileNode = {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
};

const mockFiles: FileNode[] = [
  {
    name: "src",
    type: "folder",
    children: [
      {
        name: "components",
        type: "folder",
        children: [
          { name: "App.tsx", type: "file" },
          { name: "Header.tsx", type: "file" },
          { name: "ChatPanel.tsx", type: "file" },
        ],
      },
      {
        name: "pages",
        type: "folder",
        children: [
          { name: "Index.tsx", type: "file" },
          { name: "Dashboard.tsx", type: "file" },
        ],
      },
      { name: "main.tsx", type: "file" },
      { name: "index.css", type: "file" },
    ],
  },
  {
    name: "public",
    type: "folder",
    children: [
      { name: "favicon.ico", type: "file" },
      { name: "robots.txt", type: "file" },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "tsconfig.json", type: "file" },
  { name: "vite.config.ts", type: "file" },
];

const getFileIcon = (name: string) => {
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return <FileCode className="w-4 h-4 text-ide-chat-user" />;
  if (name.endsWith(".json")) return <FileJson className="w-4 h-4 text-ide-warning" />;
  if (name.endsWith(".css")) return <FileCode className="w-4 h-4 text-accent" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
};

const TreeItem = ({
  node,
  depth,
  selectedFile,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  selectedFile: string;
  onSelect: (name: string) => void;
}) => {
  const [open, setOpen] = useState(depth === 0);

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 w-full px-2 py-1 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded-sm transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {open ? (
            <FolderOpen className="w-4 h-4 text-ide-warning" />
          ) : (
            <Folder className="w-4 h-4 text-ide-warning" />
          )}
          <span className="ml-1">{node.name}</span>
        </button>
        {open && node.children?.map((child) => (
          <TreeItem key={child.name} node={child} depth={depth + 1} selectedFile={selectedFile} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  const isSelected = selectedFile === node.name;
  return (
    <button
      onClick={() => onSelect(node.name)}
      className={`flex items-center gap-1 w-full px-2 py-1 text-sm rounded-sm transition-colors ${
        isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {getFileIcon(node.name)}
      <span className="ml-1">{node.name}</span>
    </button>
  );
};

const FileTree = ({
  selectedFile,
  onSelectFile,
}: {
  selectedFile: string;
  onSelectFile: (name: string) => void;
}) => {
  return (
    <div className="h-full bg-sidebar overflow-y-auto py-2">
      <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        Explorer
      </div>
      {mockFiles.map((node) => (
        <TreeItem key={node.name} node={node} depth={0} selectedFile={selectedFile} onSelect={onSelectFile} />
      ))}
    </div>
  );
};

export default FileTree;

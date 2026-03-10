import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

export interface VirtualFile {
  path: string;
  content: string;
  language: string;
}

export interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileNode[];
}

interface VirtualFSContextType {
  files: Record<string, VirtualFile>;
  fileTree: FileNode[];
  setFiles: (files: Record<string, VirtualFile>) => void;
  updateFile: (path: string, content: string) => void;
  addFile: (path: string, content: string) => void;
  removeFile: (path: string) => void;
  getFile: (path: string) => VirtualFile | null;
  activeFile: string;
  setActiveFile: (path: string) => void;
}

const VirtualFSContext = createContext<VirtualFSContextType | null>(null);

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    tsx: "typescript", ts: "typescript", jsx: "javascript", js: "javascript",
    css: "css", html: "html", json: "json", md: "markdown", svg: "svg",
    py: "python", go: "go", rs: "rust", rb: "ruby", java: "java",
    sh: "bash", bash: "bash", yml: "yaml", yaml: "yaml", toml: "toml",
    sql: "sql", graphql: "graphql", dockerfile: "dockerfile",
    mod: "go", sum: "text", txt: "text", env: "text",
    gitignore: "text", dockerignore: "text",
  };
  const filename = path.split("/").pop()?.toLowerCase() || "";
  if (filename === "dockerfile") return "dockerfile";
  if (filename === "makefile") return "makefile";
  if (filename.startsWith("requirements")) return "text";
  return map[ext] || "text";
}

function buildTree(files: Record<string, VirtualFile>): FileNode[] {
  const root: FileNode[] = [];
  const paths = Object.keys(files).sort();

  for (const path of paths) {
    const parts = path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;

      let existing = current.find(n => n.name === name);
      if (!existing) {
        existing = {
          name,
          type: isFile ? "file" : "folder",
          path: fullPath,
          children: isFile ? undefined : [],
        };
        if (isFile) {
          current.push(existing);
        } else {
          const firstFileIdx = current.findIndex(n => n.type === "file");
          if (firstFileIdx === -1) current.push(existing);
          else current.splice(firstFileIdx, 0, existing);
        }
      }
      if (!isFile && existing.children) {
        current = existing.children;
      }
    }
  }
  return root;
}

export const VirtualFSProvider = ({ children }: { children: ReactNode }) => {
  const [files, setFilesState] = useState<Record<string, VirtualFile>>({});
  const [activeFile, setActiveFile] = useState("src/App.tsx");

  const setFiles = useCallback((newFiles: Record<string, VirtualFile>) => {
    setFilesState(newFiles);
  }, []);

  const updateFile = useCallback((path: string, content: string) => {
    setFilesState(prev => ({
      ...prev,
      [path]: { ...prev[path], content, path, language: detectLanguage(path) },
    }));
  }, []);

  const getFile = useCallback((path: string) => files[path] || null, [files]);

  const addFile = useCallback((path: string, content: string) => {
    setFilesState(prev => ({
      ...prev,
      [path]: { path, content, language: detectLanguage(path) },
    }));
  }, []);

  const removeFile = useCallback((path: string) => {
    setFilesState(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const fileTree = useMemo(() => buildTree(files), [files]);

  return (
    <VirtualFSContext.Provider value={{ files, fileTree, setFiles, updateFile, addFile, removeFile, getFile, activeFile, setActiveFile }}>
      {children}
    </VirtualFSContext.Provider>
  );
};

export const useVirtualFS = () => {
  const ctx = useContext(VirtualFSContext);
  if (!ctx) throw new Error("useVirtualFS must be used within VirtualFSProvider");
  return ctx;
};

// Re-export from multiFileParser for backward compatibility
export { parseMultiFileOutput } from "@/lib/multiFileParser";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { FileCode, Copy, Check, WrapText, Search, Save, Play, SplitSquareHorizontal, X, Server, Monitor } from "lucide-react";
import RefactorMenu from "@/components/RefactorMenu";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import FileTree from "@/components/FileTree";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useToast } from "@/hooks/use-toast";

function colorize(line: string, lang: string): string {
  let escaped = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (lang === "html") {
    escaped = escaped
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="text-[hsl(var(--ide-chat-user))]">$2</span>')
      .replace(/\b(class|id|href|src|rel|type|name|content|style|alt|width|height|placeholder|data-[\w-]+)=/g, '<span class="text-[hsl(var(--ide-warning))]">$1</span>=');
  }

  if (lang === "css") {
    escaped = escaped
      .replace(/([\w-]+)\s*:/g, '<span class="text-[hsl(var(--ide-chat-ai))]">$1</span>:');
  }

  if (lang === "python") {
    escaped = escaped
      .replace(/\b(def|class|import|from|return|if|elif|else|for|while|with|as|try|except|finally|raise|pass|break|continue|yield|lambda|and|or|not|in|is|None|True|False|self|async|await)\b/g, '<span class="text-accent">$1</span>')
      .replace(/(#.*)/g, '<span class="text-muted-foreground">$1</span>')
      .replace(/(".*?"|'.*?')/g, '<span class="text-[hsl(var(--ide-success))]">$1</span>');
    return escaped;
  }

  if (lang === "go") {
    escaped = escaped
      .replace(/\b(func|package|import|return|if|else|for|range|switch|case|default|defer|go|chan|select|struct|interface|map|type|var|const|nil|true|false|make|append|len|cap|new|delete|close|panic|recover)\b/g, '<span class="text-accent">$1</span>')
      .replace(/(\/\/.*)/g, '<span class="text-muted-foreground">$1</span>')
      .replace(/(".*?")/g, '<span class="text-[hsl(var(--ide-success))]">$1</span>');
    return escaped;
  }

  // JS/TS/default
  escaped = escaped
    .replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="text-[hsl(var(--ide-success))]">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|default|from|class|new|this|async|await|try|catch|interface|type|extends|implements|readonly|public|private|protected|static|enum|typeof|keyof|as|in|of|switch|case|break|continue|throw|yield|void|null|undefined|true|false)\b/g, '<span class="text-accent">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="text-muted-foreground">$1</span>');

  return escaped;
}

const LANG_ICONS: Record<string, { color: string; label: string }> = {
  typescript: { color: "text-[hsl(var(--ide-chat-user))]", label: "TS" },
  javascript: { color: "text-[hsl(var(--ide-warning))]", label: "JS" },
  python: { color: "text-[hsl(var(--ide-success))]", label: "PY" },
  go: { color: "text-accent", label: "GO" },
  html: { color: "text-destructive", label: "HTML" },
  css: { color: "text-accent", label: "CSS" },
  json: { color: "text-[hsl(var(--ide-warning))]", label: "JSON" },
  markdown: { color: "text-muted-foreground", label: "MD" },
  yaml: { color: "text-destructive", label: "YML" },
};

const CodeEditor = () => {
  const { files, activeFile, setActiveFile, getFile, updateFile } = useVirtualFS();
  const { previewHtml, setPreviewHtml } = usePreview();
  const { currentProject, saveProject } = useProjects();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "frontend" | "backend">("all");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentFile = getFile(activeFile);
  const code = editing ? editContent : (currentFile?.content || "// Select a file from the explorer");
  const lang = currentFile?.language || "text";
  const lines = code.split("\n");

  // Determine if project has backend files
  const hasBackend = useMemo(() => 
    Object.keys(files).some(p => p.startsWith("server/") || p.startsWith("api/") || p.startsWith("pages/api/")),
    [files]
  );

  // Filter files by view mode
  const filteredFiles = useMemo(() => {
    if (viewMode === "all") return files;
    const filtered: Record<string, typeof files[string]> = {};
    for (const [path, file] of Object.entries(files)) {
      const isBackend = path.startsWith("server/") || path.startsWith("api/") || path.startsWith("pages/api/");
      if (viewMode === "backend" && isBackend) filtered[path] = file;
      if (viewMode === "frontend" && !isBackend) filtered[path] = file;
    }
    return filtered;
  }, [files, viewMode]);

  // Open file tabs
  const openTabs = useMemo(() => {
    const allPaths = Object.keys(filteredFiles);
    const important = allPaths.filter(p =>
      p === activeFile ||
      p === "index.html" ||
      p === "src/App.tsx" || p === "src/App.jsx" ||
      p === "src/main.tsx" || p === "src/main.js" ||
      p === "server/index.js" || p === "server/main.py" || p === "server/main.go" ||
      p === "package.json"
    );
    return [...new Set([activeFile, ...important])].filter(p => p in filteredFiles).slice(0, 8);
  }, [filteredFiles, activeFile]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditing = useCallback(() => {
    if (!currentFile) return;
    setEditing(true);
    setEditContent(currentFile.content);
    setDirty(false);
  }, [currentFile]);

  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
    setDirty(true);
  }, []);

  const saveEdit = useCallback(() => {
    if (!dirty || !currentFile) return;
    updateFile(activeFile, editContent);
    
    // If editing index.html, update preview live
    if (activeFile === "index.html") {
      setPreviewHtml(editContent);
      if (currentProject) {
        saveProject({ html_content: editContent });
      }
    }
    
    setDirty(false);
    toast({ title: "Saved", description: `${activeFile} updated` });
  }, [dirty, editContent, activeFile, currentFile, updateFile, setPreviewHtml, currentProject, saveProject, toast]);

  const stopEditing = useCallback(() => {
    if (dirty) saveEdit();
    setEditing(false);
    setEditContent("");
    setDirty(false);
  }, [dirty, saveEdit]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editing && dirty) saveEdit();
      }
      if (e.key === "Escape" && editing) {
        stopEditing();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editing, dirty, saveEdit, stopEditing]);

  const runPreview = useCallback(() => {
    const htmlFile = files["index.html"];
    if (htmlFile) {
      setPreviewHtml(htmlFile.content);
      toast({ title: "Preview updated", description: "Running latest code" });
    }
  }, [files, setPreviewHtml, toast]);

  const getTabColor = (path: string) => {
    const ext = path.split(".").pop() || "";
    const langKey = { css: "css", js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", go: "go", json: "json", html: "html", md: "markdown", yml: "yaml", yaml: "yaml" }[ext] || "text";
    return LANG_ICONS[langKey]?.color || "text-muted-foreground";
  };

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const results: { path: string; line: number; text: string }[] = [];
    const q = searchQuery.toLowerCase();
    for (const [path, file] of Object.entries(filteredFiles)) {
      const fileLines = file.content.split("\n");
      fileLines.forEach((line, i) => {
        if (line.toLowerCase().includes(q)) {
          results.push({ path, line: i + 1, text: line.trim().slice(0, 80) });
        }
      });
    }
    return results.slice(0, 50);
  }, [searchQuery, filteredFiles]);

  const langInfo = LANG_ICONS[lang] || { color: "text-muted-foreground", label: lang.toUpperCase() };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
        <ResizablePanelGroup direction="horizontal">
          {/* File tree sidebar */}
          <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
            <div className="flex flex-col h-full">
              {/* View mode switcher for multi-language */}
              {hasBackend && (
                <div className="flex items-center gap-0.5 p-1.5 border-b border-border bg-[hsl(var(--ide-panel-header))]">
                  {[
                    { id: "all" as const, label: "All", icon: SplitSquareHorizontal },
                    { id: "frontend" as const, label: "Frontend", icon: Monitor },
                    { id: "backend" as const, label: "Backend", icon: Server },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setViewMode(id)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                        viewMode === id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-auto">
                <FileTree />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle className="w-px bg-border hover:bg-primary transition-colors" />
          
          {/* Code panel */}
          <ResizablePanel defaultSize={75}>
            <div className="flex flex-col h-full">
              {/* Tabs + Actions */}
              <div className="flex items-center border-b border-border bg-[hsl(var(--ide-panel-header))]">
                <div className="flex items-center flex-1 overflow-x-auto">
                  {openTabs.map((path) => {
                    const fileName = path.split("/").pop() || path;
                    const isActive = activeFile === path;
                    const isBackendFile = path.startsWith("server/") || path.startsWith("api/");
                    return (
                      <button
                        key={path}
                        onClick={() => { setActiveFile(path); if (editing) stopEditing(); }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs border-r border-border transition-colors shrink-0 ${
                          isActive
                            ? "bg-[hsl(var(--ide-panel))] text-foreground border-t-2 border-t-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <FileCode className={`w-3 h-3 ${getTabColor(path)}`} />
                        <span>{fileName}</span>
                        {isBackendFile && (
                          <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-accent/10 text-accent">API</span>
                        )}
                        {isActive && dirty && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--ide-warning))]" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1 px-2 shrink-0">
                  {!editing ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={startEditing}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">Edit file</TooltipContent>
                    </Tooltip>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={saveEdit}
                            disabled={!dirty}
                            className={`p-1.5 rounded transition-colors ${dirty ? "text-primary bg-primary/10" : "text-muted-foreground/30"}`}
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Save (⌘S)</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={stopEditing}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">Stop editing (Esc)</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={runPreview}
                        className="p-1.5 rounded text-[hsl(var(--ide-success))] hover:bg-[hsl(var(--ide-success))]/10 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Run preview</TooltipContent>
                  </Tooltip>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <RefactorMenu
                    currentFile={activeFile}
                    onRefactorAction={(action, prompt) => {
                      // Dispatch refactor prompt to chat panel
                      const event = new CustomEvent("refactor-action", { detail: { action, prompt } });
                      window.dispatchEvent(event);
                      toast({ title: "Refactor", description: `Sent "${action}" to chat editor` });
                    }}
                    disabled={!currentFile}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setSearchOpen(!searchOpen)}
                        className={`p-1.5 rounded transition-colors ${searchOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Search files (⌘⇧F)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setWordWrap(!wordWrap)}
                        className={`p-1.5 rounded transition-colors ${wordWrap ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <WrapText className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Toggle word wrap</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleCopy}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{copied ? "Copied!" : "Copy code"}</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Search panel */}
              {searchOpen && (
                <div className="border-b border-border bg-[hsl(var(--ide-panel-header))] p-2 space-y-2">
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search in files..."
                    className="w-full bg-secondary text-foreground text-xs rounded px-2 py-1.5 border border-border focus:border-primary outline-none"
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                      {searchResults.map((r, i) => (
                        <button
                          key={i}
                          onClick={() => { setActiveFile(r.path); setSearchOpen(false); }}
                          className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-secondary transition-colors"
                        >
                          <span className="text-primary font-medium">{r.path}</span>
                          <span className="text-muted-foreground">:{r.line}</span>
                          <span className="text-foreground ml-2 truncate">{r.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Breadcrumb */}
              <div className="flex items-center gap-1 px-3 py-1 border-b border-border bg-[hsl(var(--ide-panel-header))] text-[10px] text-muted-foreground">
                <span className={`px-1 py-0.5 rounded font-bold ${langInfo.color} bg-secondary text-[9px]`}>{langInfo.label}</span>
                {activeFile.split("/").map((part, i, arr) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-0.5 opacity-50">/</span>}
                    <span className={i === arr.length - 1 ? "text-foreground font-medium" : ""}>{part}</span>
                  </span>
                ))}
                {editing && (
                  <span className="ml-auto text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    EDITING {dirty && "• UNSAVED"}
                  </span>
                )}
              </div>

              {/* Code area */}
              <div className="flex-1 overflow-auto font-mono text-xs leading-6 relative">
                {editing ? (
                  <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={handleEditChange}
                    spellCheck={false}
                    className="w-full h-full bg-transparent text-foreground outline-none resize-none p-3 pl-14 leading-6 font-mono text-xs"
                    style={{ tabSize: 2 }}
                    onKeyDown={(e) => {
                      // Tab support
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const start = e.currentTarget.selectionStart;
                        const end = e.currentTarget.selectionEnd;
                        const val = editContent;
                        setEditContent(val.substring(0, start) + "  " + val.substring(end));
                        requestAnimationFrame(() => {
                          if (textareaRef.current) {
                            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
                          }
                        });
                      }
                    }}
                  />
                ) : (
                  lines.map((line, i) => (
                    <div key={i} className="flex hover:bg-[hsl(var(--ide-line-highlight))]">
                      <span className="w-12 text-right pr-4 text-[hsl(var(--ide-gutter))] select-none shrink-0">
                        {i + 1}
                      </span>
                      <pre className={`text-foreground ${wordWrap ? "whitespace-pre-wrap break-all" : ""}`}>
                        <code dangerouslySetInnerHTML={{ __html: colorize(line, lang) }} />
                      </pre>
                    </div>
                  ))
                )}
              </div>

              {/* Status bar */}
              <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-[hsl(var(--ide-panel-header))] text-[10px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>{lines.length} lines</span>
                  <span>{Object.keys(files).length} files</span>
                  {hasBackend && (
                    <span className="flex items-center gap-1 text-accent">
                      <Server className="w-2.5 h-2.5" />
                      Full-stack
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {dirty && <span className="text-[hsl(var(--ide-warning))]">● Modified</span>}
                  <span className={langInfo.color}>{langInfo.label}</span>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
};

export default CodeEditor;

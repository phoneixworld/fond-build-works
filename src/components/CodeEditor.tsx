import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { FileCode, Copy, Check, Search, Save, Play, SplitSquareHorizontal, X, Server, Monitor } from "lucide-react";
import Editor, { type Monaco } from "@monaco-editor/react";
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

/** Map our internal language names to Monaco language IDs */
function getMonacoLanguage(lang: string, filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescriptreact",
    js: "javascript", jsx: "javascript",
    html: "html", css: "css", json: "json",
    md: "markdown", yaml: "yaml", yml: "yaml",
    py: "python", go: "go",
  };
  return map[ext] || lang || "plaintext";
}

const CodeEditor = () => {
  const { files, activeFile, setActiveFile, getFile, updateFile } = useVirtualFS();
  const { previewHtml, setPreviewHtml } = usePreview();
  const { currentProject, saveProject } = useProjects();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "frontend" | "backend">("all");
  const editorRef = useRef<any>(null);

  const currentFile = getFile(activeFile);
  const code = editing ? editContent : (currentFile?.content || "// Select a file from the explorer");
  const lang = currentFile?.language || "text";

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

  const handleEditorChange = useCallback((value: string | undefined) => {
    setEditContent(value || "");
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
  const monacoLang = getMonacoLanguage(lang, activeFile);
  const lineCount = code.split("\n").length;

  const handleEditorMount = useCallback((editor: any, monaco: Monaco) => {
    editorRef.current = editor;

    // Configure editor theme to match IDE
    monaco.editor.defineTheme("phoenix-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6b7280", fontStyle: "italic" },
        { token: "keyword", foreground: "c084fc" },
        { token: "string", foreground: "34d399" },
        { token: "number", foreground: "f59e0b" },
        { token: "type", foreground: "60a5fa" },
      ],
      colors: {
        "editor.background": "#0c0c0c",
        "editor.foreground": "#e2e8f0",
        "editor.lineHighlightBackground": "#1e293b40",
        "editor.selectionBackground": "#3b82f640",
        "editorLineNumber.foreground": "#475569",
        "editorLineNumber.activeForeground": "#94a3b8",
        "editor.inactiveSelectionBackground": "#3b82f620",
        "editorIndentGuide.background": "#1e293b",
        "editorIndentGuide.activeBackground": "#334155",
        "editorCursor.foreground": "#3b82f6",
        "editorWhitespace.foreground": "#1e293b",
        "editorWidget.background": "#0f172a",
        "editorWidget.border": "#1e293b",
        "editorSuggestWidget.background": "#0f172a",
        "editorSuggestWidget.border": "#1e293b",
        "editorSuggestWidget.selectedBackground": "#1e293b",
        "minimap.background": "#0c0c0c",
      },
    });
    monaco.editor.setTheme("phoenix-dark");
  }, []);

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

              {/* Monaco Editor */}
              <div className="flex-1 min-h-0">
                <Editor
                  height="100%"
                  language={monacoLang}
                  value={code}
                  onChange={editing ? handleEditorChange : undefined}
                  onMount={handleEditorMount}
                  theme="phoenix-dark"
                  options={{
                    readOnly: !editing,
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
                    fontLigatures: true,
                    lineNumbers: "on",
                    minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    tabSize: 2,
                    insertSpaces: true,
                    automaticLayout: true,
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    cursorSmoothCaretAnimation: "on",
                    renderWhitespace: "selection",
                    padding: { top: 8, bottom: 8 },
                    suggest: {
                      showKeywords: true,
                      showSnippets: true,
                    },
                    quickSuggestions: editing,
                    folding: true,
                    foldingStrategy: "indentation",
                    showFoldingControls: "mouseover",
                    renderLineHighlight: "all",
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    scrollbar: {
                      verticalScrollbarSize: 6,
                      horizontalScrollbarSize: 6,
                      verticalSliderSize: 6,
                    },
                  }}
                  loading={
                    <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                      Loading editor...
                    </div>
                  }
                />
              </div>

              {/* Status bar */}
              <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-[hsl(var(--ide-panel-header))] text-[10px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>{lineCount} lines</span>
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
                  <span>Monaco</span>
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

import { useState, useMemo } from "react";
import { FileCode, Copy, Check, WrapText, Search } from "lucide-react";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import FileTree from "@/components/FileTree";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

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

  // Common: strings, keywords, comments
  escaped = escaped
    .replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="text-[hsl(var(--ide-success))]">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|default|from|class|new|this|async|await|try|catch|interface|type|extends|implements|readonly|public|private|protected|static|enum|typeof|keyof|as|in|of|switch|case|break|continue|throw|yield|void|null|undefined|true|false)\b/g, '<span class="text-accent">$1</span>')
    .replace(/(\/\/.*)/g, '<span class="text-muted-foreground">$1</span>');

  return escaped;
}

const CodeEditor = () => {
  const { files, activeFile, setActiveFile, getFile } = useVirtualFS();
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const currentFile = getFile(activeFile);
  const code = currentFile?.content || "// Select a file from the explorer";
  const lang = currentFile?.language || "text";
  const lines = code.split("\n");

  // Open file tabs — show recently viewed files
  const openTabs = useMemo(() => {
    const allPaths = Object.keys(files);
    // Always show active file + any files that are important
    const important = allPaths.filter(p =>
      p === activeFile ||
      p === "index.html" ||
      p === "src/App.tsx" || p === "src/App.jsx" ||
      p === "src/main.tsx" || p === "src/main.js" ||
      p === "package.json"
    );
    // Dedupe and limit
    return [...new Set([activeFile, ...important])].slice(0, 6);
  }, [files, activeFile]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTabColor = (path: string) => {
    if (path.endsWith(".css")) return "text-accent";
    if (path.endsWith(".js") || path.endsWith(".jsx")) return "text-[hsl(var(--ide-warning))]";
    if (path.endsWith(".tsx") || path.endsWith(".ts")) return "text-[hsl(var(--ide-chat-user))]";
    if (path.endsWith(".json")) return "text-[hsl(var(--ide-warning))]";
    return "text-muted-foreground";
  };

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const results: { path: string; line: number; text: string }[] = [];
    const q = searchQuery.toLowerCase();
    for (const [path, file] of Object.entries(files)) {
      const fileLines = file.content.split("\n");
      fileLines.forEach((line, i) => {
        if (line.toLowerCase().includes(q)) {
          results.push({ path, line: i + 1, text: line.trim().slice(0, 80) });
        }
      });
    }
    return results.slice(0, 50);
  }, [searchQuery, files]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
        <ResizablePanelGroup direction="horizontal">
          {/* File tree sidebar */}
          <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
            <FileTree />
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
                    return (
                      <button
                        key={path}
                        onClick={() => setActiveFile(path)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs border-r border-border transition-colors shrink-0 ${
                          isActive
                            ? "bg-[hsl(var(--ide-panel))] text-foreground border-t-2 border-t-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <FileCode className={`w-3 h-3 ${getTabColor(path)}`} />
                        {fileName}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1 px-2 shrink-0">
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
                {activeFile.split("/").map((part, i, arr) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-0.5 opacity-50">/</span>}
                    <span className={i === arr.length - 1 ? "text-foreground" : ""}>{part}</span>
                  </span>
                ))}
              </div>

              {/* Code area */}
              <div className="flex-1 overflow-auto font-mono text-xs leading-6">
                {lines.map((line, i) => (
                  <div key={i} className="flex hover:bg-[hsl(var(--ide-line-highlight))]">
                    <span className="w-12 text-right pr-4 text-[hsl(var(--ide-gutter))] select-none shrink-0">
                      {i + 1}
                    </span>
                    <pre className={`text-foreground ${wordWrap ? "whitespace-pre-wrap break-all" : ""}`}>
                      <code dangerouslySetInnerHTML={{ __html: colorize(line, lang) }} />
                    </pre>
                  </div>
                ))}
              </div>

              {/* Status bar */}
              <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-[hsl(var(--ide-panel-header))] text-[10px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>{lines.length} lines</span>
                  <span>{Object.keys(files).length} files</span>
                </div>
                <span>{lang.toUpperCase()}</span>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
};

export default CodeEditor;

import { useState, useMemo } from "react";
import { FileCode, Copy, Check, WrapText } from "lucide-react";
import { usePreview } from "@/contexts/PreviewContext";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

/** Parse generated HTML into virtual file structure */
function parseHtmlToFiles(html: string): Record<string, string> {
  if (!html) return { "index.html": "<!-- No content generated yet -->" };

  const files: Record<string, string> = {};

  // Extract inline <style> blocks
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const styles: string[] = [];
  let styleMatch;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    styles.push(styleMatch[1].trim());
  }
  if (styles.length > 0) {
    files["styles.css"] = styles.join("\n\n");
  }

  // Extract inline <script> blocks (non-src)
  const scriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts: string[] = [];
  let scriptMatch;
  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const content = scriptMatch[1].trim();
    if (content) scripts.push(content);
  }
  if (scripts.length > 0) {
    files["script.js"] = scripts.join("\n\n");
  }

  // Full HTML
  files["index.html"] = html;

  return files;
}

function colorize(line: string): string {
  return line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // HTML tags
    .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="text-[hsl(var(--ide-chat-user))]">$2</span>')
    // Attributes
    .replace(/\b(class|id|href|src|rel|type|name|content|charset|lang|style|alt|width|height|placeholder|value|data-[\w-]+)=/g, '<span class="text-[hsl(var(--ide-warning))]">$1</span>=')
    // Strings
    .replace(/(".*?"|'.*?')/g, '<span class="text-[hsl(var(--ide-success))]">$1</span>')
    // CSS properties
    .replace(/([\w-]+)\s*:/g, '<span class="text-[hsl(var(--ide-chat-ai))]">$1</span>:')
    // JS keywords
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|default|from|class|new|this|async|await|try|catch)\b/g, '<span class="text-accent">$1</span>')
    // Comments
    .replace(/(\/\/.*)/g, '<span class="text-muted-foreground">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-muted-foreground">$1</span>');
}

const CodeEditor = ({ selectedFile }: { selectedFile: string }) => {
  const { previewHtml } = usePreview();
  const files = useMemo(() => parseHtmlToFiles(previewHtml), [previewHtml]);
  const fileNames = Object.keys(files);

  const [activeTab, setActiveTab] = useState("index.html");
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);

  // Ensure active tab exists
  const currentTab = files[activeTab] ? activeTab : fileNames[0] || "index.html";
  const code = files[currentTab] || "// No content";
  const lines = code.split("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith(".css")) return "text-accent";
    if (name.endsWith(".js")) return "text-[hsl(var(--ide-warning))]";
    return "text-[hsl(var(--ide-chat-user))]";
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-[hsl(var(--ide-panel))]">
        {/* Tabs + Actions */}
        <div className="flex items-center border-b border-border bg-[hsl(var(--ide-panel-header))]">
          <div className="flex items-center flex-1 overflow-x-auto">
            {fileNames.map((name) => (
              <button
                key={name}
                onClick={() => setActiveTab(name)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs border-r border-border transition-colors shrink-0 ${
                  currentTab === name
                    ? "bg-[hsl(var(--ide-panel))] text-foreground border-t-2 border-t-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileCode className={`w-3 h-3 ${getFileIcon(name)}`} />
                {name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 px-2 shrink-0">
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

        {/* Code area */}
        <div className="flex-1 overflow-auto font-mono text-xs leading-6">
          {lines.map((line, i) => (
            <div
              key={i}
              className="flex hover:bg-[hsl(var(--ide-line-highlight))]"
            >
              <span className="w-12 text-right pr-4 text-[hsl(var(--ide-gutter))] select-none shrink-0">
                {i + 1}
              </span>
              <pre className={`text-foreground ${wordWrap ? "whitespace-pre-wrap break-all" : ""}`}>
                <code dangerouslySetInnerHTML={{ __html: colorize(line) }} />
              </pre>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-[hsl(var(--ide-panel-header))] text-[10px] text-muted-foreground">
          <span>{lines.length} lines</span>
          <span>{currentTab.split('.').pop()?.toUpperCase()}</span>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default CodeEditor;

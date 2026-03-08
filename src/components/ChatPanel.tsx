import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Version } from "@/components/VersionHistory";
import { Send, Bot, User, ChevronDown, Sparkles, AlertTriangle, Wand2, ImagePlus, X, Palette, ArrowDown, Clock, Zap, Trash2, ShieldCheck, MessageSquareMore, CheckCircle2, Pencil, RotateCcw, Upload } from "lucide-react";
import VoiceInput from "@/components/VoiceInput";
import { streamChat } from "@/lib/streamChat";
import { validateAndFixHtml } from "@/lib/htmlValidator";
import { matchTemplate, PAGE_TEMPLATES, type PageTemplate } from "@/lib/pageTemplates";
import { COMPONENT_SNIPPETS } from "@/lib/componentSnippets";
import { AI_MODELS, DEFAULT_MODEL, PROMPT_SUGGESTIONS, QUICK_ACTIONS, DESIGN_THEMES, type AIModelId } from "@/lib/aiModels";
import { motion, AnimatePresence } from "framer-motion";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS, parseMultiFileOutput } from "@/contexts/VirtualFSContext";
import { supabase } from "@/integrations/supabase/client";
import ChatMessage from "@/components/chat/ChatMessage";
import BuildPipelineCard from "@/components/chat/BuildPipelineCard";
import ReactMarkdown from "react-markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

type MsgContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number };

function getTextContent(content: MsgContent): string {
  if (typeof content === "string") return content;
  return content.filter((p): p is { type: "text"; text: string } => p.type === "text").map(p => p.text).join("\n");
}

function getImageUrls(content: MsgContent): string[] {
  if (typeof content === "string") return [];
  return content.filter((p): p is { type: "image_url"; image_url: { url: string } } => p.type === "image_url").map(p => p.image_url.url);
}

function parseResponse(text: string): [string, string | null] {
  let fenceStart = text.indexOf("```html-preview");
  if (fenceStart === -1) fenceStart = text.indexOf("```html");
  if (fenceStart === -1) return [text, null];
  const chatPart = text.slice(0, fenceStart).trim();
  const codeStart = text.indexOf("\n", fenceStart) + 1;
  const fenceEnd = text.indexOf("```", codeStart);
  const htmlCode = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  return [chatPart, htmlCode.trim()];
}

// Allowed packages in Sandpack — anything else gets stripped
const ALLOWED_PACKAGES = new Set([
  "react", "react-dom", "react/jsx-runtime",
  "lucide-react", "framer-motion", "date-fns", "recharts",
  "react-router-dom", "clsx", "tailwind-merge",
  "react-intersection-observer", "zustand", "zod", "axios",
  "@tanstack/react-query", "react-hook-form", "sonner",
]);

function isAllowedImport(pkg: string): boolean {
  if (pkg.startsWith(".") || pkg.startsWith("/")) return true; // relative imports OK
  // Check exact match or scope match (e.g. "lucide-react/icons/X")
  const base = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("/")[0];
  return ALLOWED_PACKAGES.has(base);
}

/**
 * Comprehensive import/require sanitizer.
 * Handles: single-line imports, multi-line imports, side-effect imports,
 * re-exports (export ... from), dynamic import(), and require().
 */
function sanitizeImports(code: string): string {
  // 1. Strip multi-line and single-line: import ... from 'pkg'
  //    Handles: import X from 'pkg', import { A, B } from 'pkg', import type { X } from 'pkg'
  code = code.replace(
    /^\s*import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped import from: ${pkg}`);
        return `// [STRIPPED] ${pkg}`;
      }
      return match;
    }
  );

  // 2. Strip side-effect imports: import 'pkg' or import "pkg"
  code = code.replace(
    /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped side-effect import: ${pkg}`);
        return `// [STRIPPED] ${pkg}`;
      }
      return match;
    }
  );

  // 3. Strip re-exports: export { X } from 'pkg' or export * from 'pkg'
  code = code.replace(
    /^\s*export\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped re-export from: ${pkg}`);
        return `// [STRIPPED] ${pkg}`;
      }
      return match;
    }
  );

  // 4. Strip require() calls for unknown packages
  code = code.replace(
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped require: ${pkg}`);
        return `undefined /* STRIPPED: ${pkg} */`;
      }
      return match;
    }
  );

  // 5. Strip dynamic import() for unknown packages  
  code = code.replace(
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped dynamic import: ${pkg}`);
        return `Promise.resolve({}) /* STRIPPED: ${pkg} */`;
      }
      return match;
    }
  );

  // 6. Final pass: catch any remaining multi-line imports that span lines
  //    Pattern: line starting with `import` ... eventually `from 'pkg'` across multiple lines
  code = code.replace(
    /^\s*import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm,
    (match, pkg) => {
      if (!isAllowedImport(pkg)) {
        console.warn(`[Import Sanitizer] Stripped multi-line import: ${pkg}`);
        return `// [STRIPPED] ${pkg}`;
      }
      return match;
    }
  );

  // 7. Fix invalid JSX: <array[index].prop /> → assign to variable first
  // Pattern: <identifier[expression].property ... />
  // Replace with: (() => { const _C = identifier[expression].property; return <_C ... />; })()
  code = code.replace(
    /<(\w+)\[([^\]]+)\]\.(\w+)(\s[^>]*)?\s*\/>/g,
    (match, arr, idx, prop, attrs) => {
      // Replace the JSX tag with a self-invoking function that assigns to a variable
      const cleanAttrs = (attrs || '').trim();
      return `{(() => { const _DynComp = ${arr}[${idx}].${prop}; return <_DynComp ${cleanAttrs} />; })()}`;
    }
  );
  
  // Also fix: <array[index].property> ... </array[index].property>
  code = code.replace(
    /<(\w+)\[([^\]]+)\]\.(\w+)(\s[^>]*)?>([^]*?)<\/\1\[\2\]\.\3>/g,
    (match, arr, idx, prop, attrs, children) => {
      const cleanAttrs = (attrs || '').trim();
      return `{(() => { const _DynComp = ${arr}[${idx}].${prop}; return <_DynComp ${cleanAttrs}>${children}</_DynComp>; })()}`;
    }
  );

  return code;
}

/** Parse react/jsx code fences into a file map for Sandpack */
function parseReactFiles(text: string): { chatText: string; files: Record<string, string> | null; deps: Record<string, string> } {
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};

  // Try multiple fence formats the AI might use — order matters (most specific first)
  const fencePatterns = [
    "```react-preview",
    "```jsx-preview", 
    "```react",
    "```jsx",
  ];
  
  let fenceStart = -1;
  let matchedPattern = "";
  for (const pattern of fencePatterns) {
    fenceStart = text.indexOf(pattern);
    if (fenceStart !== -1) {
      matchedPattern = pattern;
      break;
    }
  }
  
  // Fallback: check if any code fence contains --- /App.jsx pattern
  if (fenceStart === -1) {
    const genericFence = text.match(/```\w*\n[\s\S]*?---\s+\/?(App\.jsx|App\.js)/);
    if (genericFence) {
      fenceStart = text.indexOf(genericFence[0]);
      matchedPattern = "generic-with-app";
    }
  }
  
  if (fenceStart === -1) {
    return { chatText: text, files: null, deps };
  }

  const chatText = text.slice(0, fenceStart).trim();
  const codeStart = text.indexOf("\n", fenceStart) + 1;
  
  // Find closing fence — must be ``` on its own line (not ```react or ```jsx etc.)
  // Search for \n``` followed by end-of-string, newline, or whitespace (not more word chars)
  let fenceEnd = -1;
  let searchFrom = codeStart;
  while (searchFrom < text.length) {
    const candidate = text.indexOf("\n```", searchFrom);
    if (candidate === -1) break;
    // Check what follows the ``` — must be end of string, newline, or space (not another fence tag)
    const afterFence = candidate + 4;
    if (afterFence >= text.length || text[afterFence] === '\n' || text[afterFence] === '\r' || text[afterFence] === ' ') {
      fenceEnd = candidate;
      break;
    }
    searchFrom = candidate + 4;
  }
  
  const block = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  
  if (block.trim().length === 0) {
    return { chatText: text, files: null, deps };
  }
  
  // Parse files using multiple format strategies
  const parsedFiles = parseFileSections(block);
  
  if (parsedFiles.fileCount === 0) {
    // No file separators found — treat the whole block as /App.jsx
    console.log(`[parseReactFiles] Single-file mode: treating block as /App.jsx (${block.length} chars)`);
    files["/App.jsx"] = sanitizeImports(block.trim());
    return { chatText, files, deps };
  }
  
  // Copy parsed files
  for (const [fname, code] of Object.entries(parsedFiles.files)) {
    files[fname] = fname.match(/\.(jsx?|tsx?)$/) ? sanitizeImports(code) : code;
  }
  for (const [pkg, ver] of Object.entries(parsedFiles.deps)) {
    if (ALLOWED_PACKAGES.has(pkg)) deps[pkg] = ver;
  }

  return {
    chatText,
    files: Object.keys(files).length > 0 ? files : null,
    deps,
  };
}

/** Parse file sections from a code block, handling multiple separator formats */
function parseFileSections(block: string): { files: Record<string, string>; deps: Record<string, string>; fileCount: number } {
  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};
  
  // Strategy 1: "--- /filename" on same line (original format)
  if (/^---\s+\/?\w[\w/.-]*\.(jsx?|tsx?|css)$/m.test(block)) {
    const sections = block.split(/^---\s+/m).filter(Boolean);
    for (const section of sections) {
      const lines = section.split("\n");
      const firstLine = lines[0].trim();
      if (firstLine.match(/^\/?\w[\w/.-]*\.(jsx?|tsx?|css)$/)) {
        let filename = firstLine.startsWith("/") ? firstLine : `/${firstLine}`;
        filename = filename.replace(/^\/src\//, "/");
        files[filename] = lines.slice(1).join("\n").trim();
      } else if (firstLine === "dependencies") {
        try { Object.assign(deps, JSON.parse(lines.slice(1).join("\n").trim())); } catch {}
      }
    }
    if (Object.keys(files).length > 0) {
      return { files, deps, fileCount: Object.keys(files).length };
    }
  }
  
  // Strategy 2: "---\n/filename\n---\ncode" (frontmatter-style separators)
  // Pattern: --- on its own line, then filename on next line, then --- on next line, then code until next ---
  const frontmatterRegex = /^---\s*\n\s*(\/?\w[\w/.-]*\.(?:jsx?|tsx?|css))\s*\n---\s*\n/gm;
  const matches: { filename: string; start: number }[] = [];
  let m;
  while ((m = frontmatterRegex.exec(block)) !== null) {
    matches.push({ filename: m[1], start: m.index + m[0].length });
  }
  
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].start;
      // Find the end: either next --- separator or end of block
      let end = block.length;
      if (i + 1 < matches.length) {
        // Find the --- before the next file's frontmatter
        const nextMatch = block.lastIndexOf("\n---", matches[i + 1].start - 1);
        if (nextMatch > start) end = nextMatch;
      }
      let filename = matches[i].filename;
      if (!filename.startsWith("/")) filename = "/" + filename;
      filename = filename.replace(/^\/src\//, "/");
      const code = block.slice(start, end).trim();
      if (code.length > 0) files[filename] = code;
    }
    // Check for dependencies section
    const depsMatch = block.match(/^---\s*\ndependencies\s*\n---\s*\n([\s\S]*?)(?:\n---|\n*$)/m);
    if (depsMatch) {
      try { Object.assign(deps, JSON.parse(depsMatch[1].trim())); } catch {}
    }
    if (Object.keys(files).length > 0) {
      return { files, deps, fileCount: Object.keys(files).length };
    }
  }
  
  // Strategy 3: Just "--- /filename" or "---\n/filename" without closing ---
  // More lenient: split on lines that look like filenames preceded by ---
  const lenientRegex = /^---\s*\n?\s*(\/?\w[\w/.-]*\.(?:jsx?|tsx?|css))\s*$/gm;
  const lenientMatches: { filename: string; endOfHeader: number }[] = [];
  while ((m = lenientRegex.exec(block)) !== null) {
    lenientMatches.push({ filename: m[1], endOfHeader: m.index + m[0].length });
  }
  
  if (lenientMatches.length > 0) {
    for (let i = 0; i < lenientMatches.length; i++) {
      let start = lenientMatches[i].endOfHeader;
      // Skip optional --- line after filename
      const afterHeader = block.slice(start, start + 10);
      const dashLine = afterHeader.match(/^\s*\n---\s*\n/);
      if (dashLine) start += dashLine[0].length;
      else if (afterHeader.startsWith("\n")) start += 1;
      
      const end = i + 1 < lenientMatches.length ? lenientMatches[i + 1].endOfHeader - (block.slice(0, lenientMatches[i + 1].endOfHeader).match(/---\s*\n?\s*[\w/][\w/.-]*\.\w+\s*$/)?.[0]?.length || 0) : block.length;
      
      let filename = lenientMatches[i].filename;
      if (!filename.startsWith("/")) filename = "/" + filename;
      filename = filename.replace(/^\/src\//, "/");
      
      // Find the actual end by looking for the next --- line
      let codeEnd = block.length;
      if (i + 1 < lenientMatches.length) {
        const nextSep = block.lastIndexOf("\n---", lenientMatches[i + 1].endOfHeader);
        if (nextSep > start) codeEnd = nextSep;
      }
      
      const code = block.slice(start, codeEnd).trim();
      if (code.length > 0) files[filename] = code;
    }
    return { files, deps, fileCount: Object.keys(files).length };
  }
  
  return { files, deps, fileCount: 0 };
}

function postProcessHtml(html: string): string {
  if (!html) return html;
  
  const validation = validateAndFixHtml(html);
  html = validation.html;
  
  if (validation.issues.length > 0) {
    console.log(`[HTML Validator] Score: ${validation.score}/100, Issues: ${validation.issues.length}`, 
      validation.issues.map(i => `${i.fixed ? '✅' : '⚠️'} [${i.category}] ${i.message}`));
  }
  
  const injections: string[] = [];
  if (!html.includes('scroll-behavior')) {
    injections.push('<style>html{scroll-behavior:smooth}*{-webkit-tap-highlight-color:transparent}::selection{background:rgba(99,102,241,0.2)}img{max-width:100%;height:auto}img.img-error{display:none!important}</style>');
  }
  if (!html.includes('__safeQuery')) {
    injections.push(`<script>
window.__safeQuery=function(s){try{return document.querySelector(s)}catch(e){return null}};
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('img').forEach(function(img){
    img.addEventListener('error',function(){this.style.display='none';this.classList.add('img-error')});
  });
  document.addEventListener('click',function(e){
    var link=e.target.closest('a[href^="#"]');
    if(!link)return;
    var hash=link.getAttribute('href');
    if(!hash||hash==='#')return;
    e.preventDefault();
    var target=document.querySelector(hash);
    if(target){
      target.scrollIntoView({behavior:'smooth',block:'start'});
      history.replaceState(null,null,hash);
    }
    var mobileMenu=document.querySelector('[data-mobile-menu],.mobile-menu,.nav-menu.open,.menu-open');
    if(mobileMenu){mobileMenu.classList.remove('open','active','show','menu-open');mobileMenu.style.display='none';}
  });
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    var hash=a.getAttribute('href');
    if(!hash||hash==='#')return;
    a.style.cursor='pointer';
  });
});
</script>`);
  }
  if (!html.includes('favicon') && !html.includes('rel="icon"')) {
    injections.push('<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'><rect width=\'32\' height=\'32\' rx=\'8\' fill=\'%236366f1\'/><text x=\'50%25\' y=\'55%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-size=\'18\' fill=\'white\'>⚡</text></svg>" type="image/svg+xml">');
  }
  if (html.includes('fonts.googleapis.com') && !html.includes('preconnect')) {
    injections.push('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  }
  if (!html.includes('theme-color')) {
    injections.push('<meta name="theme-color" content="#6366f1">');
  }
  if (injections.length === 0) return html;
  const headIdx = html.indexOf('<head>');
  if (headIdx !== -1) {
    const insertPos = headIdx + '<head>'.length;
    return html.slice(0, insertPos) + '\n  ' + injections.join('\n  ') + html.slice(insertPos);
  }
  return html;
}

const TIER_COLORS: Record<string, string> = {
  fast: "text-[hsl(var(--ide-success))]",
  pro: "text-primary",
  premium: "text-[hsl(var(--ide-warning))]",
};

const TIER_LABELS: Record<string, string> = {
  fast: "Fast",
  pro: "Pro",
  premium: "Premium",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

export interface ChatPanelHandle {
  clearChat: () => void;
}

const ChatPanel = forwardRef<ChatPanelHandle, { initialPrompt?: string; onVersionCreated?: (version: Version) => void }>(({ initialPrompt, onVersionCreated }, ref) => {
  const { currentProject, saveProject } = useProjects();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModelId>(DEFAULT_MODEL);
  const [selectedTheme, setSelectedTheme] = useState<string>("minimal");
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [buildStreamContent, setBuildStreamContent] = useState("");
  // Self-healing state
  const [healAttempts, setHealAttempts] = useState(0);
  const [isHealing, setIsHealing] = useState(false);
  const [healingStatus, setHealingStatus] = useState<string>("");
  // Follow-up questions state
  const [followUpQuestions, setFollowUpQuestions] = useState<any[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingFollowUpPrompt, setPendingFollowUpPrompt] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setPreviewHtml, setIsBuilding, setBuildStep, setSandpackFiles, setSandpackDeps, setPreviewMode } = usePreview();
  const { setFiles: setVirtualFiles } = useVirtualFS();
  const lastProjectIdRef = useRef<string | null>(null);
  const hasProcessedInitialRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_HEAL_ATTEMPTS = 3;
  // Edit/regenerate state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<PageTemplate | null>(null);
  
  // FIX: Use refs to avoid stale closures in sendMessage
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;
  // FIX: Abort controller for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);
  // FIX: Guard against duplicate sends
  const isSendingRef = useRef(false);

  // Elapsed time timer during loading
  useEffect(() => {
    if (isLoading) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isLoading]);

  // Scroll detection for scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setShowScrollBtn(!atBottom);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "preview-error") {
        const errorType = event.data.errorType || "unknown";
        const msg = event.data.message || "Unknown error";
        const enriched = `[${errorType}] ${msg}`;
        setPreviewErrors((prev) => {
          if (prev.includes(enriched)) return prev;
          return [...prev.slice(-9), enriched];
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // FIX: Self-healing with proper guards — only trigger once per error batch, never during loading
  // Self-healing DISABLED — was causing unwanted auto-fix loops
  // Users can manually ask the AI to fix issues instead

  const triggerSelfHeal = useCallback(() => {
    if (isLoadingRef.current || isHealing || isSendingRef.current || healAttempts >= MAX_HEAL_ATTEMPTS || previewErrors.length === 0) return;
    setIsHealing(true);
    setHealAttempts(prev => prev + 1);
    const attempt = healAttempts + 1;
    setHealingStatus(`Self-healing attempt ${attempt}/${MAX_HEAL_ATTEMPTS}...`);
    const errorSummary = previewErrors.join("\n");
    const healPrompt = `🔧 AUTO-FIX (attempt ${attempt}/${MAX_HEAL_ATTEMPTS}): The preview detected these errors:\n${errorSummary}\n\nPlease fix ALL these errors. Make sure the app works correctly without any console errors or broken functionality.`;
    setPreviewErrors([]);
    sendMessage(healPrompt).finally(() => {
      setIsHealing(false);
      setHealingStatus("");
    });
  }, [isHealing, healAttempts, previewErrors]);

  // Analyze prompt for follow-up questions
  const analyzePrompt = useCallback(async (prompt: string): Promise<boolean> => {
    if (messagesRef.current.length > 0 || prompt.length < 20) return false;
    
    setIsAnalyzing(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ prompt }),
      });
      if (!resp.ok) return false;
      const result = await resp.json();
      setAnalysisResult(result);
      if (result.action === "ask" && result.questions?.length > 0) {
        setFollowUpQuestions(result.questions);
        setPendingFollowUpPrompt(prompt);
        setIsAnalyzing(false);
        return true;
      }
      setIsAnalyzing(false);
      return false;
    } catch {
      setIsAnalyzing(false);
      return false;
    }
  }, []);

  const handleFollowUpAnswer = (questionId: string, value: string) => {
    setFollowUpAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const submitFollowUpAnswers = useCallback(() => {
    const answersText = followUpQuestions.map(q => {
      const answer = followUpAnswers[q.id];
      const option = q.options.find((o: any) => o.value === answer);
      return `${q.text} → ${option?.label || answer || "Not specified"}`;
    }).join("\n");
    
    const enrichedPrompt = `${pendingFollowUpPrompt}\n\n--- Additional Requirements ---\n${answersText}`;
    
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setPendingFollowUpPrompt("");
    setAnalysisResult(null);
    sendMessage(enrichedPrompt);
  }, [followUpQuestions, followUpAnswers, pendingFollowUpPrompt]);

  const skipFollowUpQuestions = useCallback(() => {
    const prompt = pendingFollowUpPrompt;
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setPendingFollowUpPrompt("");
    setAnalysisResult(null);
    sendMessage(prompt);
  }, [pendingFollowUpPrompt]);

  useEffect(() => {
    if (initialPrompt && !hasProcessedInitialRef.current) {
      hasProcessedInitialRef.current = true;
      setPendingPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (currentProject && currentProject.id !== lastProjectIdRef.current) {
      lastProjectIdRef.current = currentProject.id;
      const history = currentProject.chat_history ?? [];
      setMessages(history);
      setPreviewHtml(currentProject.html_content || "");
      setPreviewErrors([]);
      setAttachedImages([]);
      // Reset healing state on project switch
      setHealAttempts(0);
      setIsHealing(false);
    } else if (!currentProject) {
      lastProjectIdRef.current = null;
      setMessages([]);
      setPreviewHtml("");
      setPreviewErrors([]);
      setAttachedImages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, setPreviewHtml]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) addImageFile(file);
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  const addImageFile = async (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setAttachedImages((prev) => [...prev.slice(0, 3), dataUrl]);
    } catch {}
  };

  const uploadAppAsset = async (file: File): Promise<string | null> => {
    if (!currentProject) return null;
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${currentProject.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("app-assets").upload(path, file, { upsert: true });
      if (error) { console.error("Upload error:", error); return null; }
      const { data } = supabase.storage.from("app-assets").getPublicUrl(path);
      return data?.publicUrl || null;
    } catch { return null; }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) await addImageFile(file);
    }
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) await addImageFile(file);
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const buildMessageContent = (text: string, images: string[]): MsgContent => {
    if (images.length === 0) return text;
    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
    parts.push({ type: "text", text });
    for (const img of images) {
      parts.push({ type: "image_url", image_url: { url: img } });
    }
    return parts;
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const clearChat = useCallback(() => {
    if (!currentProject || isLoading) return;
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setPreviewHtml("");
    setSandpackFiles(null);
    setSandpackDeps({});
    setPreviewMode("html");
    setPreviewErrors([]);
    setHealAttempts(0);
    setIsHealing(false);
    isSendingRef.current = false;
    saveProject({ chat_history: [], html_content: "" });
  }, [currentProject, isLoading, setPreviewHtml, saveProject]);

  useImperativeHandle(ref, () => ({ clearChat }), [clearChat]);

  const sendMessage = useCallback(async (text: string, images: string[] = []) => {
    if (!text || !currentProject) return;
    
    // FIX: Guard against duplicate concurrent sends
    if (isSendingRef.current || isLoadingRef.current) {
      console.warn("[ChatPanel] Blocked duplicate send while already sending");
      return;
    }
    isSendingRef.current = true;

    // Reset self-healing counter on manual user messages (not auto-fix)
    if (!text.startsWith("🔧 AUTO-FIX")) {
      setHealAttempts(0);
    }

    const content = buildMessageContent(text, images);
    const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
    setInput("");
    setAttachedImages([]);
    setPreviewErrors([]);
    if (inputRef.current) inputRef.current.style.height = "36px";
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setBuildStreamContent("");
    setIsBuilding(true);
    setBuildStep(images.length > 0 ? "Analyzing your image..." : "Understanding your request...");

    // FIX: Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let fullResponse = "";
    let hasSetAnalyzing = false;
    let hasSetBuilding = false;

    let streamParseCount = 0;
    const upsert = (chunk: string) => {
      if (abortController.signal.aborted) return;
      fullResponse += chunk;
      setBuildStreamContent(fullResponse);
      
      // Try React files first, then HTML
      const reactResult = parseReactFiles(fullResponse);
      const [chatText, htmlCode] = reactResult.files ? [reactResult.chatText, null] : parseResponse(fullResponse);
      const displayChat = reactResult.files ? reactResult.chatText : chatText;

      if (!hasSetAnalyzing && fullResponse.length > 20) {
        setBuildStep("Generating components...");
        hasSetAnalyzing = true;
      }
      
      if (reactResult.files) {
        if (!hasSetBuilding) {
          const fileNames = Object.keys(reactResult.files);
          const totalChars = Object.values(reactResult.files).join('').length;
          console.log(`[upsert] ✅ First React parse success: files=${fileNames.join(',')}, chars=${totalChars}`);
          setBuildStep("Bundling React app...");
          hasSetBuilding = true;
        }
        streamParseCount++;
        setSandpackFiles(reactResult.files);
        if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);
        setPreviewMode("sandpack");
      } else if (htmlCode) {
        if (!hasSetBuilding) {
          setBuildStep("Building your app...");
          hasSetBuilding = true;
        }
        setPreviewHtml(postProcessHtml(htmlCode));
        setPreviewMode("html");
      }

      setMessages((prev) => {
        const text = displayChat || "Building...";
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: text } : m));
        }
        return [...prev, { role: "assistant", content: text, timestamp: Date.now() }];
      });
    };

    try {
      let schemas: any[] = [];
      try {
        const { data } = await supabase
          .from("project_schemas" as any)
          .select("collection_name, schema")
          .eq("project_id", currentProject.id);
        schemas = data || [];
      } catch {}

      // Fetch Project Brain knowledge
      let knowledge: string[] = [];
      try {
        const { data } = await supabase
          .from("project_knowledge" as any)
          .select("title, content")
          .eq("project_id", currentProject.id)
          .eq("is_active", true);
        knowledge = (data || []).map((k: any) => `[${k.title}]: ${k.content}`);
      } catch {}

      // Fetch Project Memory decisions
      try {
        const { data } = await supabase
          .from("project_decisions" as any)
          .select("category, title, description")
          .eq("project_id", currentProject.id)
          .eq("is_active", true);
        if (data && data.length > 0) {
          knowledge.push("[PROJECT DECISIONS - Follow these architectural decisions]:");
          (data as any[]).forEach((d: any) => {
            knowledge.push(`  [${d.category}] ${d.title}${d.description ? ': ' + d.description : ''}`);
          });
        }
      } catch {}

      // Fetch Governance rules
      try {
        const { data } = await supabase
          .from("project_governance_rules" as any)
          .select("category, name, description, severity")
          .eq("project_id", currentProject.id)
          .eq("is_active", true);
        if (data && data.length > 0) {
          knowledge.push("[GOVERNANCE RULES - Enforce these standards in generated code]:");
          (data as any[]).forEach((r: any) => {
            knowledge.push(`  [${r.severity.toUpperCase()}] ${r.name}${r.description ? ': ' + r.description : ''}`);
          });
        }
      } catch {}

      // FIX: Read messages from ref to avoid stale closures
      const currentMessages = messagesRef.current;
      const apiMessages = [...currentMessages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const themeInfo = DESIGN_THEMES.find(t => t.id === selectedTheme);
      
      const userText = typeof text === "string" ? text : "";
      const template = selectedTemplate || (currentMessages.length === 0 ? matchTemplate(userText) : null);
      let templateCtx = "";
      if (template) {
        templateCtx = `## MATCHED TEMPLATE: ${template.name}\n\nUse this as your structural blueprint:\n${template.blueprint}\n\nCustomize the content, colors, and details based on the user's specific request. Do NOT copy the blueprint literally — adapt it creatively.`;
        console.log(`[Template Matched] ${template.emoji} ${template.name}`);
        setSelectedTemplate(null);
      }
      
      await streamChat({
        messages: apiMessages,
        projectId: currentProject.id,
        techStack: currentProject.tech_stack || "html-tailwind",
        schemas,
        model: selectedModel,
        designTheme: themeInfo?.prompt,
        knowledge,
        templateContext: templateCtx || undefined,
        onDelta: upsert,
        onDone: async () => {
          if (abortController.signal.aborted) return;
          
          // Debug: log response details
          console.log(`[ChatPanel:onDone] Response length: ${fullResponse.length}`);
          console.log(`[ChatPanel:onDone] Has react-preview fence:`, fullResponse.includes('```react-preview'));
          console.log(`[ChatPanel:onDone] Has react fence:`, fullResponse.includes('```react'));
          console.log(`[ChatPanel:onDone] First 200 chars of code area:`, fullResponse.slice(fullResponse.indexOf('```'), fullResponse.indexOf('```') + 200));
          
          // Check for React file output first
          const reactResult = parseReactFiles(fullResponse);
          let finalHtml: string | null = null;
          
          if (reactResult.files) {
            // React/Sandpack mode
            const fileNames = Object.keys(reactResult.files);
            console.log(`[ChatPanel:onDone] ✅ React files found:`, fileNames, `Total code: ${Object.values(reactResult.files).join('').length} chars`);
            setSandpackFiles(reactResult.files);
            if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);
            setPreviewMode("sandpack");
          } else {
            console.log("[ChatPanel:onDone] ❌ No React files parsed — falling back to HTML mode");
            // Legacy HTML mode
            const { files: parsedFiles, html: htmlCode, chatText } = parseMultiFileOutput(fullResponse);
            
            if (Object.keys(parsedFiles).length > 0) {
              setVirtualFiles(parsedFiles);
            }
            
            if (htmlCode) setPreviewHtml(postProcessHtml(htmlCode));

            // Self-review pass for first-time generations
            finalHtml = htmlCode;
            if (htmlCode && htmlCode.length > 200 && currentMessages.length === 0) {
              setBuildStep("Reviewing & polishing...");
              try {
                const reviewResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/review-code`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  },
                  body: JSON.stringify({ html: htmlCode }),
                });
                if (reviewResp.ok) {
                  const reviewData = await reviewResp.json();
                  if (reviewData.reviewed && reviewData.html && reviewData.html.length > 200) {
                    finalHtml = reviewData.html;
                    setPreviewHtml(postProcessHtml(finalHtml));
                    console.log("[Phase 3] Self-review pass applied improvements");
                  }
                }
              } catch (e) {
                console.warn("[Phase 3] Review pass skipped:", e);
              }
            }
          }

          console.log(`[ChatPanel:onDone] Stream parse count: ${streamParseCount}, hasSetBuilding: ${hasSetBuilding}`);
          
          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");
          isSendingRef.current = false;
          setTimeout(() => setBuildStreamContent(""), 3000);

          const processedHtml = finalHtml ? postProcessHtml(finalHtml) : null;

          // Auto-sync to Dev environment
          if (processedHtml && currentProject?.id) {
            supabase
              .from("project_environments" as any)
              .update({
                html_snapshot: processedHtml,
                status: "active",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("project_id", currentProject.id)
              .eq("name", "development")
              .then(() => {});
          }

          // Create version snapshot
          if (processedHtml && onVersionCreated) {
            const userPrompt = getTextContent(userMsg.content);
            onVersionCreated({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              label: userPrompt.slice(0, 60) || "Build update",
              html: processedHtml,
              messageIndex: currentMessages.length,
            });
          }

          // Extract final chat text for persistence
          const finalChatText = reactResult.files ? reactResult.chatText : (() => {
            const { chatText: ct } = parseMultiFileOutput(fullResponse);
            return ct;
          })();

          setMessages((prev) => {
            const final = finalChatText
              ? prev.map((m, i) => (i === prev.length - 1 && m.role === "assistant" ? { ...m, content: finalChatText } : m))
              : prev;

            const persistMessages = final.map(m => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : getTextContent(m.content),
            }));

            const isFirstMessage = persistMessages.filter(m => m.role === "user").length === 1;
            
            if (isFirstMessage && currentProject.name === "Untitled Project") {
              const userPromptText = persistMessages[0]?.content || "";
              fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/project-name`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
                body: JSON.stringify({ prompt: userPromptText }),
              })
                .then(r => r.json())
                .then(({ name, emoji }) => {
                  const fullName = emoji ? `${emoji} ${name}` : name;
                  supabase
                    .from("projects")
                    .update({ name: fullName, updated_at: new Date().toISOString() } as any)
                    .eq("id", currentProject.id)
                    .then(() => {
                      saveProject({ name: fullName } as any);
                    });
                })
                .catch(() => {});
            }

            saveProject({
              chat_history: persistMessages,
              html_content: finalHtml || currentProject.html_content || "",
            });

            return final;
          });
        },
        onError: (err) => {
          if (abortController.signal.aborted) return;
          setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, timestamp: Date.now() }]);
          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");
          isSendingRef.current = false;
        },
      });
    } catch (e) {
      console.error("[ChatPanel] sendMessage error:", e);
      setIsLoading(false);
      setIsBuilding(false);
      setBuildStep("");
      isSendingRef.current = false;
    }
  }, [currentProject, saveProject, setPreviewHtml, setIsBuilding, setBuildStep, selectedModel, selectedTheme, onVersionCreated, setVirtualFiles]);

  // Edit a previous user message and regenerate from that point
  const handleEditMessage = useCallback((index: number) => {
    const msg = messagesRef.current[index];
    if (msg?.role !== "user") return;
    setEditingIndex(index);
    setEditText(getTextContent(msg.content));
  }, []);

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditText("");
  };

  const handleSubmitEdit = useCallback(() => {
    if (editingIndex === null || !editText.trim() || isLoadingRef.current || !currentProject) return;
    const truncated = messagesRef.current.slice(0, editingIndex);
    setMessages(truncated);
    setEditingIndex(null);
    setEditText("");
    // Small delay to let state update before sending
    setTimeout(() => sendMessage(editText.trim()), 50);
  }, [editingIndex, editText, currentProject, sendMessage]);

  const handleRegenerate = useCallback((index: number) => {
    if (isLoadingRef.current || !currentProject) return;
    const msgs = messagesRef.current;
    let userMsgIndex = index - 1;
    while (userMsgIndex >= 0 && msgs[userMsgIndex].role !== "user") userMsgIndex--;
    if (userMsgIndex < 0) return;
    const userText = getTextContent(msgs[userMsgIndex].content);
    const truncated = msgs.slice(0, index);
    setMessages(truncated);
    setTimeout(() => sendMessage(userText), 50);
  }, [currentProject, sendMessage]);

  // FIX: pendingPrompt effect — use isSendingRef to prevent double-fire
  useEffect(() => {
    if (pendingPrompt && currentProject && !isLoadingRef.current && !isSendingRef.current && messagesRef.current.length === 0) {
      const prompt = pendingPrompt;
      setPendingPrompt(null);
      sendMessage(prompt);
    }
  }, [pendingPrompt, currentProject, sendMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSmartSend = useCallback(async (text: string, images: string[] = []) => {
    if (!text && images.length === 0) return;
    if (isSendingRef.current || isLoadingRef.current) return; // FIX: guard
    const finalText = text || "Replicate this design";
    
    if (messagesRef.current.length === 0 && images.length === 0 && finalText.length >= 20) {
      const needsQuestions = await analyzePrompt(finalText);
      if (needsQuestions) return;
    }
    
    sendMessage(finalText, images);
  }, [analyzePrompt, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || attachedImages.length > 0) {
        handleSmartSend(input.trim(), attachedImages);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "36px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleAutoFix = () => {
    setHealAttempts(0);
    const errorSummary = previewErrors.join("\n");
    sendMessage(`The app preview has these errors, please fix them:\n${errorSummary}`);
  };

  const handleSendClick = () => {
    if (input.trim() || attachedImages.length > 0) {
      handleSmartSend(input.trim(), attachedImages);
    }
  };

  const currentModelInfo = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];
  const charCount = input.length;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`flex flex-col h-full bg-[hsl(var(--ide-panel))] relative ${isDragOver ? "ring-2 ring-primary ring-inset" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        <AnimatePresence>
          {isDragOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center rounded-lg"
            >
              <div className="flex flex-col items-center gap-3 text-primary">
                <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                  <ImagePlus className="w-12 h-12" />
                </motion.div>
                <span className="text-sm font-semibold">Drop image here</span>
                <span className="text-xs text-muted-foreground">PNG, JPG, or WebP up to 4MB</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-6 scroll-smooth">
          {messages.length === 0 && !pendingPrompt && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 flex items-center justify-center shadow-lg shadow-primary/5">
                  <Sparkles className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">What do you want to build?</h3>
                <p className="text-xs text-muted-foreground text-center max-w-[260px]">
                  Pick a suggestion below, describe your app, or paste a screenshot to get started
                </p>
              </motion.div>

              {/* Prompt suggestions */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="w-full max-w-sm space-y-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  {PROMPT_SUGGESTIONS.map((s, i) => (
                    <motion.button
                      key={s.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
                      onClick={() => handleSmartSend(s.prompt)}
                      className="text-left px-3 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 hover:shadow-md hover:shadow-primary/5 transition-all group"
                    >
                      <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{s.label}</span>
                    </motion.button>
                  ))}
                </div>

                {/* Template selector */}
                <div className="mt-3">
                  <p className="text-[10px] text-muted-foreground/40 font-medium mb-1.5 text-center">Or start with a template:</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {PAGE_TEMPLATES.slice(0, 6).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(selectedTemplate?.id === t.id ? null : t)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                          selectedTemplate?.id === t.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                        }`}
                      >
                        <span>{t.emoji}</span>
                        <span>{t.name}</span>
                      </button>
                    ))}
                  </div>
                  {PAGE_TEMPLATES.length > 6 && (
                    <details className="mt-1.5">
                      <summary className="text-[10px] text-muted-foreground/30 cursor-pointer hover:text-muted-foreground/50 text-center">
                        +{PAGE_TEMPLATES.length - 6} more templates
                      </summary>
                      <div className="flex flex-wrap gap-1.5 justify-center mt-1.5">
                        {PAGE_TEMPLATES.slice(6).map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTemplate(selectedTemplate?.id === t.id ? null : t)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                              selectedTemplate?.id === t.id
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            }`}
                          >
                            <span>{t.emoji}</span>
                            <span>{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </motion.div>

              {/* Keyboard hint */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5"
              >
                <kbd className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px] font-mono">Enter</kbd>
                to send
                <span className="mx-1">·</span>
                <kbd className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px] font-mono">Shift+Enter</kbd>
                new line
              </motion.p>
            </div>
          )}

          {pendingPrompt && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                <Zap className="w-8 h-8 text-primary" />
              </motion.div>
              <p className="text-xs font-medium">Starting build...</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const isEditing = editingIndex === i;

              if (isEditing) {
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/15 ring-1 ring-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full bg-secondary rounded-xl px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-primary/30 resize-none leading-[1.7]"
                        rows={Math.min(editText.split("\n").length + 1, 6)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitEdit(); }
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSubmitEdit}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          Save & Regenerate
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              }

              return (
                <ChatMessage
                  key={i}
                  content={msg.content}
                  role={msg.role}
                  timestamp={msg.timestamp}
                  isLoading={isLoading}
                  onEdit={isUser ? () => handleEditMessage(i) : undefined}
                  onRegenerate={!isUser ? () => handleRegenerate(i) : undefined}
                  showActions={!isLoading}
                />
              );
            })}
          </AnimatePresence>

          {/* Build Pipeline Progress Card */}
          {buildStreamContent.length > 0 && (buildStreamContent.includes("```html") || isLoading) && (
            <BuildPipelineCard
              isBuilding={isLoading}
              streamContent={buildStreamContent}
              elapsed={elapsedTime}
            />
          )}

          {/* Follow-up questions UI */}
          <AnimatePresence>
            {followUpQuestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-accent/15 ring-1 ring-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquareMore className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <p className="text-[13px] text-foreground leading-[1.7]">Before I build this, a few quick questions to make sure I get it right:</p>
                    
                    {analysisResult?.analysis && (
                      <div className="flex gap-2 flex-wrap">
                        {analysisResult.analysis.needsBackend && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                            <Zap className="w-2.5 h-2.5" /> Backend detected
                          </span>
                        )}
                        {analysisResult.analysis.needsAuth && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent">
                            <ShieldCheck className="w-2.5 h-2.5" /> Auth needed
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground">
                          {analysisResult.analysis.complexity || "medium"} complexity
                        </span>
                      </div>
                    )}

                    {followUpQuestions.map((q: any) => (
                      <div key={q.id} className="space-y-2">
                        <p className="text-[12px] font-medium text-foreground">{q.text}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map((opt: any) => (
                            <button
                              key={opt.value}
                              onClick={() => handleFollowUpAnswer(q.id, opt.value)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                                followUpAnswers[q.id] === opt.value
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={submitFollowUpAnswers}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Build with these preferences
                      </button>
                      <button
                        onClick={skipFollowUpQuestions}
                        className="px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        Skip, just build
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Analyzing prompt indicator */}
          <AnimatePresence>
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex gap-3 items-center"
              >
                <div className="w-7 h-7 rounded-lg bg-accent/15 ring-1 ring-accent/20 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-accent" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="text-[11px] text-muted-foreground">Analyzing your request...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick actions */}
          {messages.length > 0 && !isLoading && followUpQuestions.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-wrap gap-1.5 pt-2"
            >
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => handleSmartSend(a.prompt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-secondary/50 transition-all"
                >
                  <Wand2 className="w-3 h-3" />
                  {a.label}
                </button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Scroll-to-bottom FAB */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToBottom}
              className="absolute right-4 bottom-36 z-40 w-8 h-8 rounded-full bg-secondary border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all"
            >
              <ArrowDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Self-healing status */}
        <AnimatePresence>
          {isHealing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-primary/30 bg-primary/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-primary animate-pulse shrink-0" />
                <span className="text-xs text-primary font-medium">{healingStatus}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error banner */}
        <AnimatePresence>
          {previewErrors.length > 0 && !isLoading && !isHealing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-destructive/30 bg-destructive/5 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  <span className="text-xs text-destructive truncate">
                    {previewErrors.length} error{previewErrors.length > 1 ? "s" : ""} detected
                    {healAttempts > 0 && healAttempts < MAX_HEAL_ATTEMPTS && (
                      <span className="ml-1 text-muted-foreground">· auto-fixing in 5s ({healAttempts}/{MAX_HEAL_ATTEMPTS} attempts)</span>
                    )}
                    {healAttempts >= MAX_HEAL_ATTEMPTS && (
                      <span className="ml-1 text-muted-foreground">· max retries reached</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {healAttempts >= MAX_HEAL_ATTEMPTS && (
                    <button
                      onClick={() => { setHealAttempts(0); handleAutoFix(); }}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      Retry
                    </button>
                  )}
                  <button
                    onClick={handleAutoFix}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    <Wand2 className="w-3 h-3" />
                    Fix now
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected template chip */}
        <AnimatePresence>
          {selectedTemplate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border px-3 py-1.5"
            >
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-medium">
                <span>{selectedTemplate.emoji}</span>
                <span>Template: {selectedTemplate.name}</span>
                <button onClick={() => setSelectedTemplate(null)} className="ml-1 hover:text-primary/70 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attached images preview */}
        <AnimatePresence>
          {attachedImages.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-border px-3 py-2"
            >
              <div className="flex gap-2 flex-wrap">
                {attachedImages.map((img, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group"
                  >
                    <img src={img} alt="Attached" className="w-16 h-16 object-cover rounded-xl border border-border shadow-sm" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="p-3 border-t border-border">
          <div className={`flex items-end gap-2 bg-secondary/80 rounded-xl px-3 py-2.5 ring-1 transition-all ${
            input ? "ring-primary/30" : "ring-transparent"
          }`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors pb-0.5"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Attach image <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Ctrl+V</kbd>
              </TooltipContent>
            </Tooltip>
            <VoiceInput
              onTranscript={(text) => {
                setInput(prev => prev ? prev + " " + text : text);
                if (inputRef.current) {
                  inputRef.current.style.height = "auto";
                  inputRef.current.style.height = inputRef.current.scrollHeight + "px";
                }
              }}
              disabled={isLoading}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={attachedImages.length > 0 ? "Describe what to build from this image..." : "Describe what you want to build..."}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none resize-none leading-[1.4]"
              style={{ height: "36px", maxHeight: "120px" }}
              disabled={isLoading}
              rows={1}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSendClick}
                  disabled={isLoading || (!input.trim() && attachedImages.length === 0)}
                  className="text-primary hover:text-primary/80 disabled:text-muted-foreground/30 transition-colors pb-0.5"
                >
                  <Send className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Send <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Model + Theme + Actions bar */}
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <Sparkles className={`w-3 h-3 ${TIER_COLORS[currentModelInfo.tier]}`} />
                    <span>{currentModelInfo.label}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[240px]">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Model</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {AI_MODELS.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`flex items-center justify-between gap-3 ${selectedModel === model.id ? "text-primary font-medium" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className={`w-3 h-3 ${TIER_COLORS[model.tier]}`} />
                        <div>
                          <span className="text-xs">{model.label}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">{model.description}</span>
                        </div>
                      </div>
                      <span className={`text-[9px] uppercase font-bold tracking-wider ${TIER_COLORS[model.tier]}`}>
                        {TIER_LABELS[model.tier]}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-3 bg-border" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <Palette className="w-3 h-3 text-accent" />
                    <span>{DESIGN_THEMES.find(t => t.id === selectedTheme)?.emoji} {DESIGN_THEMES.find(t => t.id === selectedTheme)?.label}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[240px]">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Design Theme</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {DESIGN_THEMES.map((theme) => (
                    <DropdownMenuItem
                      key={theme.id}
                      onClick={() => setSelectedTheme(theme.id)}
                      className={`flex items-center gap-2 ${selectedTheme === theme.id ? "text-primary font-medium" : ""}`}
                    >
                      <span className="text-sm">{theme.emoji}</span>
                      <div>
                        <span className="text-xs">{theme.label}</span>
                        <span className="text-[10px] text-muted-foreground ml-1.5">{theme.description}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {messages.length > 0 && (
                <>
                  <div className="w-px h-3 bg-border" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={clearChat}
                        disabled={isLoading}
                        className="text-muted-foreground/50 hover:text-destructive disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Clear conversation</TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {charCount > 0 && (
                <span className={`text-[10px] transition-colors ${charCount > 2000 ? "text-destructive" : "text-muted-foreground/40"}`}>
                  {charCount.toLocaleString()}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/40">
                {messages.filter(m => m.role === "user").length} msg{messages.filter(m => m.role === "user").length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
});

ChatPanel.displayName = "ChatPanel";

export default ChatPanel;

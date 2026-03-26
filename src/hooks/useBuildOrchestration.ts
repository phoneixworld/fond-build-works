/**
 * useBuildOrchestration — Manages build engine invocation, streaming, retries, safety timeouts.
 * Extracted from ChatPanel to reduce monolith complexity.
 *
 * Sub-hooks:
 * - useChatAgent: chat-only agent flow (no code generation)
 * - useInstantBuild: instant template detection, hydration, and AI polish
 *
 * Responsibilities:
 * - sendMessage: core build agent flow (context fetch, streaming, onDone, retries)
 * - handleSmartSend: intent routing (fast-classify → chat or build)
 * - clearChat: full state reset
 * - Safety timeout (300s)
 * - Abort controller management
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { type AgentIntent, type PipelineStep } from "@/lib/agentPipeline";
import { compile, type CompileOptions, type CompileCallbacks, type BuildResult } from "@/lib/compiler";
import { matchTemplate, type PageTemplate } from "@/lib/pageTemplates";
import { getSnippetsPromptContext } from "@/lib/componentSnippets";
import { DESIGN_THEMES, type AIModelId } from "@/lib/aiModels";
import { clientRouteModel } from "@/lib/costRouter";
import { supabase } from "@/integrations/supabase/client";
import { toExportPath } from "@/lib/pathNormalizer";
import { StreamingPreviewController } from "@/lib/streamingPreview";
import { type MsgContent, getTextContent } from "@/lib/codeParser";
import { useChatAgent, type ChatAgentConfig } from "@/hooks/useChatAgent";
import { useInstantBuild, type InstantBuildConfig } from "@/hooks/useInstantBuild";
import { executeEdit, type EditResult } from "@/lib/editEngine";
import { Workspace } from "@/lib/compiler/workspace";
import { repairMissingModules } from "@/lib/compiler/missingModuleGen";
import { fixMissingImports } from "@/lib/compiler/missingImportFixer";
import { fixExportMismatches } from "@/lib/compiler/exportMismatchFixer";
import { deduplicateFiles } from "@/lib/compiler/deduplicator";
import { normalizeGeneratedStructure } from "@/lib/compiler/structureNormalizer";
import { classifyIntentGate, parseConfirmationReply, type GuardRouteHint } from "@/lib/intentGate";
import {
  indexFilesIntoAST,
  buildProvenanceMap,
  startBuildManifest,
  recordFileInManifest,
  completeBuildManifest,
  resetASTWorkspace,
  clearProvenance,
  clearBuildHistory,
} from "@/lib/buildEngine";
import { extractUrlFromMessage, analyzeUrl } from "@/lib/urlAnalyzer";

/** Phase 3: Normalize task labels for user display */
function normalizeTaskLabel(raw: string): string {
  if (!raw || raw.trim().length === 0) return "Application Setup";
  
  const LABEL_MAP: Record<string, string> = {
    infra: "Infrastructure",
    auth: "Authentication",
    routing: "Routing & Navigation",
    shell: "Application Shell",
    layout: "Layout & Structure",
    nav: "Navigation",
    sidebar: "Sidebar Navigation",
    dashboard: "Dashboard",
    db: "Database Schema",
    schema: "Database Schema",
    api: "API Integration",
    styles: "Styling & Theme",
    theme: "Styling & Theme",
    config: "Configuration",
    setup: "Project Setup",
  };

  // Handle "page:PageName" format
  const pageMatch = raw.match(/^page:(.+)$/i);
  if (pageMatch) return `${pageMatch[1].trim()} Page`;
  
  // Handle "component:Name" format  
  const compMatch = raw.match(/^component:(.+)$/i);
  if (compMatch) return `${compMatch[1].trim()} Component`;

  // Check direct map
  const lower = raw.toLowerCase().trim();
  if (LABEL_MAP[lower]) return LABEL_MAP[lower];

  // If it's a single generic word, try to capitalize nicely
  if (/^[a-z_-]+$/.test(lower) && lower.length < 20) {
    return lower.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  // Already reasonable — just ensure first letter is capitalized
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function generatePreviewHtmlForBuild(files: Record<string, string>): string {
  const cssFiles = Object.entries(files)
    .filter(([p]) => p.endsWith(".css"))
    .map(([, c]) => c)
    .join("\n");

  const componentCode = Object.entries(files)
    .filter(([p]) => p.match(/\.(jsx|tsx|js|ts)$/) && !p.includes("vite.config"))
    .sort(([a], [b]) => {
      if (a.includes("App.")) return 1;
      if (b.includes("App.")) return -1;
      return a.localeCompare(b);
    })
    .map(([path, code]) => {
      const cleaned = code
        .replace(/^import\s+.*$/gm, "// [import removed]")
        .replace(/^export\s+default\s+/gm, "window.__default_export__ = ")
        .replace(/^export\s+/gm, "");
      return `// === ${path} ===\n${cleaned}`;
    })
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Build Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>${cssFiles}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${componentCode}
    const rootEl = document.getElementById('root');
    const AppComponent = typeof App !== 'undefined' ? App : (window.__default_export__ || (() => React.createElement('div', null, 'Preview')));
    ReactDOM.createRoot(rootEl).render(React.createElement(AppComponent));
  <\/script>
</body>
</html>`;
}

type MsgMeta = { tokens?: number; durationMs?: number; model?: string };
type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number; meta?: MsgMeta };

type PendingExecutionRequest = {
  prompt: string;
  images: string[];
  routeHint: GuardRouteHint;
  needsHighImpactConfirm: boolean;
  awaitingHighImpactConfirm: boolean;
};

export interface BuildOrchestrationConfig {
  // Project
  currentProject: any;
  saveProject: (data: any) => void;
  onVersionCreated?: (version: any) => void;

  // Preview context setters
  setPreviewHtml: (html: string) => void;
  setIsBuilding: (v: boolean) => void;
  setBuildStep: (s: string) => void;
  setSandpackFiles: (f: any) => void;
  setSandpackDeps: (d: any) => void;
  setPreviewMode: (m: string) => void;
  setBuildMetrics: (m: any) => void;
  saveSnapshot: (label: string) => void;
  currentPreviewHtml: string;
  currentSandpackFiles: Record<string, string> | null;

  // VirtualFS
  setVirtualFiles: (f: any) => void;

  // Messages
  messages: Msg[];
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;

  // UI state
  setInput: (s: string) => void;
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>;
  previewErrors: string[];
  setPreviewErrors: React.Dispatch<React.SetStateAction<string[]>>;
  setHealAttempts: (n: number) => void;
  resetHealing: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;

  // Model/theme
  selectedModel: AIModelId;
  selectedTheme: string;

  // Hooks
  fetchProjectContext: (pid: string) => Promise<{ schemas: any[]; knowledge: string[]; irContext: string }>;
  classifyUserIntent: (prompt: string) => Promise<{ intent: AgentIntent; questions?: any[] } | null>;
  fastClassifyLocal: (text: string) => AgentIntent | null;

  // Conversation state machine
  conversationAnalyzeAsync?: (
    text: string,
    hasImages: boolean,
    hasExistingCode: boolean,
  ) => Promise<{ action: "gather" | "build" | "edit" | "chat" | "continue"; reason: string }>;
  conversationAddPhase?: (text: string, hasImages: boolean, imageUrls?: string[]) => any;
  conversationGetRequirements?: () => Promise<string> | string;
  conversationStartBuilding?: () => void;
  conversationStartEditing?: (
    instruction: string,
    targetFiles: string[],
    beforeSnapshots: Record<string, string>,
  ) => Promise<void>;
  conversationCompleteEdit?: (
    instruction: string,
    targetFiles: string[],
    beforeSnapshots: Record<string, string>,
    afterSnapshots: Record<string, string>,
    explanation: string,
  ) => Promise<any>;
  conversationCompleteBuild?: (result: any) => void;
  conversationGenerateAck?: (phase: any) => string;
  conversationMode?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const NOISE =
  /^(yes|yep|yeah|go ahead|proceed|do it|ok|okay|sure|continue|start|build it|just do it|fuck off|go away|rubbish|on)\b/i;
const COMPLAINT_NOISE =
  /\b(what happened|still blank|blank screen|not working|doesn't work|don't see|i don't see|nothing in the preview|nothing showing|still nothing|where is|why is it|is it broken|it's broken|same error|try again|timeout|timed out)\b/i;
const META_NOISE =
  /^(what was built|what happened|what's wrong|why|how|when|who|can you|could you|please|help|thanks|thank you)\b/i;
const DUPLICATE_TRIGGER = /^(build|create|generate|scaffold)\s+(a\s+)?(hr|crm|erp|portal|app|dashboard|system)\b/i;

const buildCodeSummary = (
  sandpackFiles: Record<string, string> | null | undefined,
  currentPreviewHtml: string,
  budgetChars = 16000,
): string => {
  if (!sandpackFiles || Object.keys(sandpackFiles).length === 0) {
    if (currentPreviewHtml && currentPreviewHtml.length > 0) {
      return currentPreviewHtml.length < budgetChars
        ? currentPreviewHtml
        : currentPreviewHtml.slice(0, Math.floor(budgetChars * 0.75)) +
            `\n...[truncated — ${Math.round(currentPreviewHtml.length / 1000)}k chars total]`;
    }
    return "";
  }

  const fileEntries = Object.entries(sandpackFiles);
  const totalChars = fileEntries.reduce((sum, [, code]) => sum + code.length, 0);
  if (totalChars <= budgetChars) {
    return fileEntries.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
  }

  const ENTRY_PATTERNS = ["/App.jsx", "/App.tsx", "/App.js"];
  const keyFiles = fileEntries.filter(([p]) => ENTRY_PATTERNS.some((k) => p.endsWith(k)));
  const otherFiles = fileEntries.filter(([p]) => !ENTRY_PATTERNS.some((k) => p.endsWith(k)));
  const keyCode = keyFiles.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
  let remainingBudget = Math.max(2000, budgetChars - keyCode.length);
  const otherCode = otherFiles
    .map(([path, code]) => {
      if (remainingBudget <= 0) return `--- ${path} (${code.length} chars — omitted for token budget)`;
      if (code.length <= remainingBudget) {
        remainingBudget -= code.length;
        return `--- ${path}\n${code}`;
      }
      const snippet = code.slice(0, Math.max(200, Math.floor(remainingBudget * 0.6)));
      remainingBudget = 0;
      return `--- ${path} (${code.length} chars)\n${snippet}\n...[truncated]`;
    })
    .join("\n\n");
  return `${keyCode}\n\n${otherCode}`;
};

export function useBuildOrchestration(config: BuildOrchestrationConfig) {
  const {
    currentProject,
    saveProject,
    onVersionCreated,
    setPreviewHtml,
    setIsBuilding,
    setBuildStep,
    setSandpackFiles,
    setSandpackDeps,
    setPreviewMode,
    setBuildMetrics,
    saveSnapshot,
    currentPreviewHtml,
    currentSandpackFiles,
    setVirtualFiles,
    messages,
    setMessages,
    setInput,
    setAttachedImages,
    previewErrors,
    setPreviewErrors,
    setHealAttempts,
    resetHealing,
    inputRef,
    selectedModel,
    selectedTheme,
    fetchProjectContext,
    classifyUserIntent,
    fastClassifyLocal,
    conversationAnalyzeAsync,
    conversationAddPhase,
    conversationGetRequirements,
    conversationStartBuilding,
    conversationStartEditing,
    conversationCompleteEdit,
    conversationCompleteBuild,
    conversationGenerateAck,
    conversationMode,
  } = config;

  const [buildStreamContent, setBuildStreamContent] = useState("");
  const [buildRetryCount, setBuildRetryCount] = useState(0);
  const buildRetryCountRef = useRef(0);
  const [currentAgent, setCurrentAgent] = useState<AgentIntent | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const [pendingBuildPrompt, setPendingBuildPrompt] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [totalPlanTasks, setTotalPlanTasks] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PageTemplate | null>(null);
  const [compilerTasks, setCompilerTasks] = useState<
    Array<{ id: string; label: string; status: "pending" | "in_progress" | "done" }>
  >([]);
  const [pendingExecution, setPendingExecution] = useState<PendingExecutionRequest | null>(null);
  const planLabelsRef = useRef<string[]>([]);
  const lastVerificationOkRef = useRef<boolean | null>(null);

  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const buildSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sandpackFilesRef = useRef<Record<string, string> | null>(null);
  sandpackFilesRef.current = currentSandpackFiles;
  const streamingControllerRef = useRef<StreamingPreviewController | null>(null);
  const lastProjectIdRef = useRef<string | null>(null);
  const deferredPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildRunTokenRef = useRef(0);

  useEffect(() => {
    buildRetryCountRef.current = buildRetryCount;
  }, [buildRetryCount]);

  useEffect(() => {
    if (!isLoading && buildSafetyTimeoutRef.current) {
      clearTimeout(buildSafetyTimeoutRef.current);
      buildSafetyTimeoutRef.current = null;
    }
  }, [isLoading]);

  useEffect(() => {
    return () => {
      if (deferredPreviewTimerRef.current) {
        clearTimeout(deferredPreviewTimerRef.current);
        deferredPreviewTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (buildSafetyTimeoutRef.current) {
        clearTimeout(buildSafetyTimeoutRef.current);
        buildSafetyTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Pre-scaffolded UI component paths — now visible in the tree.
  const SCAFFOLDED_UI_PATHS = new Set<string>();

  const normalizeVirtualPath = (value: string) => {
    const parts = value.split("/");
    const stack: string[] = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") {
        stack.pop();
        continue;
      }
      stack.push(part);
    }
    return `/${stack.join("/")}`;
  };

  const sanitizeWorkspaceForPreview = useCallback((files: Record<string, string> | null | undefined) => {
    if (!files) return {} as Record<string, string>;

    const sanitized: Record<string, string> = {};
    for (const [rawPath, rawContent] of Object.entries(files)) {
      if (typeof rawPath !== "string") continue;
      const trimmedPath = rawPath.trim();
      if (!trimmedPath) continue;
      if (/^(null|undefined)$/i.test(trimmedPath) || /\/(?:null|undefined)$/i.test(trimmedPath)) {
        console.warn(`[BuildOrch] Skipping invalid preview file path: ${trimmedPath}`);
        continue;
      }
      if (typeof rawContent !== "string") {
        console.warn(`[BuildOrch] Skipping non-string file content for ${trimmedPath}`);
        continue;
      }

      const cleanedContent = rawContent
        .split("\n")
        .filter((line) => {
          const t = line.trim();
          if (/^-{3}\s+\/?.+?\.(?:jsx?|tsx?|css|js|ts)\b/i.test(t)) return false;
          if (/^-{3}\s+\/?dependencies\b/i.test(t)) return false;
          return true;
        })
        .join("\n");

      const normalizedPath = normalizeVirtualPath(trimmedPath);
      sanitized[normalizedPath] = cleanedContent;
    }

    try {
      const DOMAIN_NAMES = new Set([
        "ActivityFeed",
        "NotificationBell",
        "PageHeader",
        "QuickActions",
        "SearchFilterBar",
        "StatCard",
        "StatusBadge",
        "ProtectedRoute",
      ]);
      const moves: Array<[string, string]> = [];
      for (const p of Object.keys(sanitized)) {
        if (!p.startsWith("/components/ui/")) continue;
        const fn = p.split("/").pop() || "";
        const bn = fn.replace(/\.(tsx?|jsx?)$/, "");
        if (DOMAIN_NAMES.has(bn)) moves.push([p, `/components/${fn}`]);
      }
      for (const [from, to] of moves) {
        if (!sanitized[to]) sanitized[to] = sanitized[from];
        delete sanitized[from];
      }
      delete sanitized["/utils/cn.ts"];
      delete sanitized["/utils/cn.tsx"];
      if (!sanitized["/lib/utils.ts"]) {
        sanitized["/lib/utils.ts"] =
          `import { clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\n` +
          `export function cn(...inputs: (string | undefined | null | false)[]) { return twMerge(clsx(inputs)); }\n`;
      }
    } catch (e) {
      console.warn("[BuildOrch] Normalization pass failed, continuing:", e);
    }

    return sanitized;
  }, []);

  const IMPORT_RESOLVE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css", ".json"];

  const resolveExistingVirtualModulePath = (basePath: string, fileLookup: Set<string>) => {
    const cleanBasePath = basePath.replace(/[?#].*$/, "");
    if (fileLookup.has(cleanBasePath)) return cleanBasePath;

    for (const ext of IMPORT_RESOLVE_EXTENSIONS) {
      const withExt = `${cleanBasePath}${ext}`;
      if (fileLookup.has(withExt)) return withExt;
    }

    for (const ext of IMPORT_RESOLVE_EXTENSIONS) {
      const asIndex = `${cleanBasePath}/index${ext}`;
      if (fileLookup.has(asIndex)) return asIndex;
    }

    return null;
  };

  const resolveVirtualImportPath = (importPath: string, importerPath: string) => {
    if (!importPath) return null;

    if (importPath.startsWith("@/")) {
      return normalizeVirtualPath(`/${importPath.slice(2)}`);
    }

    if (importPath.startsWith("/")) {
      return normalizeVirtualPath(importPath);
    }

    if (importPath.startsWith(".")) {
      const importerDir = importerPath.slice(0, importerPath.lastIndexOf("/") + 1);
      return normalizeVirtualPath(`${importerDir}${importPath}`);
    }

    if (importPath.startsWith("components/") || importPath.startsWith("src/")) {
      return normalizeVirtualPath(`/${importPath.replace(/^src\//, "")}`);
    }

    return null;
  };

  const extractImportSpecifiers = (code: string) => {
    const specifiers: string[] = [];
    const importRegex =
      /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match: RegExpExecArray | null = null;

    while ((match = importRegex.exec(code)) !== null) {
      const specifier = match[1] || match[2];
      if (specifier) specifiers.push(specifier);
    }

    return specifiers;
  };

  const syncSandpackToVirtualFS = useCallback(
    (sandpackFiles: Record<string, string>) => {
      const normalizedEntries = Object.entries(sandpackFiles).map(
        ([path, content]) => [normalizeVirtualPath(path), content] as const,
      );
      const normalizedFileLookup = new Set(normalizedEntries.map(([path]) => path));

      const referencedScaffoldedUiPaths = new Set<string>();
      const queue: string[] = [];

      const enqueueIfScaffolded = (candidatePath: string | null) => {
        if (!candidatePath || !SCAFFOLDED_UI_PATHS.has(candidatePath) || referencedScaffoldedUiPaths.has(candidatePath))
          return;
        referencedScaffoldedUiPaths.add(candidatePath);
        queue.push(candidatePath);
      };

      for (const [path, content] of normalizedEntries) {
        if (SCAFFOLDED_UI_PATHS.has(path)) continue;

        for (const specifier of extractImportSpecifiers(content)) {
          const resolvedImportBasePath = resolveVirtualImportPath(specifier, path);
          const resolvedImportPath = resolvedImportBasePath
            ? resolveExistingVirtualModulePath(resolvedImportBasePath, normalizedFileLookup)
            : null;
          enqueueIfScaffolded(resolvedImportPath);
        }
      }

      while (queue.length > 0) {
        const currentPath = queue.pop();
        if (!currentPath) continue;
        const currentContent = sandpackFiles[currentPath] ?? sandpackFiles[currentPath.slice(1)] ?? "";

        for (const specifier of extractImportSpecifiers(currentContent)) {
          const resolvedImportBasePath = resolveVirtualImportPath(specifier, currentPath);
          const resolvedImportPath = resolvedImportBasePath
            ? resolveExistingVirtualModulePath(resolvedImportBasePath, normalizedFileLookup)
            : null;
          enqueueIfScaffolded(resolvedImportPath);
        }
      }

      const virtualFiles: Record<string, { path: string; content: string; language: string }> = {};
      for (const [path, content] of normalizedEntries) {
        if (SCAFFOLDED_UI_PATHS.has(path) && !referencedScaffoldedUiPaths.has(path)) continue;

        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        const displayPath = toExportPath(cleanPath);
        const ext = displayPath.split(".").pop()?.toLowerCase() || "";
        const langMap: Record<string, string> = {
          tsx: "typescript",
          ts: "typescript",
          jsx: "javascript",
          js: "javascript",
          css: "css",
          html: "html",
          json: "json",
        };
        virtualFiles[displayPath] = { path: displayPath, content, language: langMap[ext] || "text" };
      }

      setVirtualFiles(virtualFiles);
    },
    [setVirtualFiles],
  );

  const buildMessageContent = useCallback((text: string, images: string[]): MsgContent => {
    if (images.length === 0) return text;
    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
    parts.push({ type: "text", text });
    for (const img of images) {
      parts.push({ type: "image_url", image_url: { url: img } });
    }
    return parts;
  }, []);

  const appendConversationTurn = useCallback(
    (userText: string, images: string[], assistantText: string) => {
      const content = buildMessageContent(userText, images);
      const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
      const assistantMsg: Msg = { role: "assistant", content: assistantText, timestamp: Date.now() };

      setInput("");
      setAttachedImages([]);
      setMessages((prev) => {
        const updated = [...prev, userMsg, assistantMsg];
        saveProject({ chat_history: updated.map((m) => ({ role: m.role, content: m.content })) });
        return updated;
      });
    },
    [buildMessageContent, setInput, setAttachedImages, setMessages, saveProject],
  );

  const handleOnError = useCallback(
    (err: string) => {
      setMessages((prev) => [...prev, { role: "assistant" as const, content: `⚠️ ${err}`, timestamp: Date.now() }]);
      setIsLoading(false);
      setIsBuilding(false);
      setBuildStep("");
      setPipelineStep("error");
      setCurrentAgent(null);
      isSendingRef.current = false;
      void conversationCompleteBuild?.({
        filesChanged: [],
        totalFiles: 0,
        chatSummary: `Build failed: ${err}`,
        timestamp: Date.now(),
        verificationOk: false,
      });
    },
    [setMessages, setIsBuilding, setBuildStep, conversationCompleteBuild],
  );

  const { sendChatMessage } = useChatAgent({
    currentProject,
    saveProject,
    setMessages,
    setInput,
    setAttachedImages,
    setBuildStep,
    setPipelineStep,
    setCurrentAgent,
    setPendingBuildPrompt,
    setIsLoading,
    messagesRef,
    isSendingRef,
    isLoadingRef,
    buildMessageContent,
    sandpackFilesRef,
    previewErrors,
  } as ChatAgentConfig);

  const { tryInstantBuild } = useInstantBuild({
    currentProject,
  } as InstantBuildConfig);

  /** Extract the original user intent from an internal requirement envelope */
  const extractUserIntentFromPrompt = (prompt: string): string => {
    // Try to extract the BUILD TRIGGER section (contains original user text)
    const triggerMatch = prompt.match(/## BUILD TRIGGER\n(.+?)$/ms);
    if (triggerMatch) return triggerMatch[1].trim();
    
    // Try to extract content after APPLICATION REQUIREMENTS header
    const reqMatch = prompt.match(/# APPLICATION REQUIREMENTS\n\n(.+?)(?:\n\nBuild (?:EXACTLY|a complete))/s);
    if (reqMatch) return reqMatch[1].trim();
    
    // Fallback: strip the envelope markers and return first meaningful line
    const lines = prompt.split("\n").filter(l => 
      l.trim() && 
      !l.startsWith("#") && 
      !l.startsWith("Build EXACTLY") && 
      !l.startsWith("Build a complete") &&
      !l.startsWith("Do NOT add")
    );
    return lines[0]?.trim() || "Building application...";
  };

  const sendMessage = useCallback(
    async (text: string, images: string[] = [], displayText?: string) => {
      if (!text || !currentProject) return;

      if (isSendingRef.current || isLoadingRef.current) {
        console.warn("[BuildOrch] Blocked duplicate send while already sending");
        return;
      }

      const buildProjectId = currentProject.id;
      const runToken = buildRunTokenRef.current + 1;
      buildRunTokenRef.current = runToken;
      const isStaleBuild = () =>
        runToken !== buildRunTokenRef.current ||
        !currentProject ||
        currentProject.id !== buildProjectId ||
        (lastProjectIdRef.current !== null && lastProjectIdRef.current !== buildProjectId);

      isSendingRef.current = true;

      if (!text.startsWith("🔧 AUTO-FIX")) {
        setHealAttempts(0);
      }

      // Phase 1: Separate display text from execution prompt
      // Never persist internal requirement envelopes as user chat messages
      const isInternalPrompt = text.includes("# APPLICATION REQUIREMENTS") || text.includes("## BUILD TRIGGER");
      const safeDisplayText = displayText || (isInternalPrompt ? extractUserIntentFromPrompt(text) : text);
      const content = buildMessageContent(safeDisplayText, images);
      const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
      setInput("");
      setAttachedImages([]);
      setPreviewErrors([]);
      if (inputRef.current) inputRef.current.style.height = "60px";
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setBuildStreamContent("");
      setIsBuilding(true);
      setBuildStep(images.length > 0 ? "🖼️ Analyzing image..." : "🏗️ Build agent generating code...");
      setPipelineStep("generating");

      const BUILD_TIMEOUT_MS = 600_000;
      const resetBuildSafetyTimeout = () => {
        if (buildSafetyTimeoutRef.current) clearTimeout(buildSafetyTimeoutRef.current);
        buildSafetyTimeoutRef.current = setTimeout(() => {
          if (isStaleBuild()) return;
          console.warn("[BuildOrch] Build safety timeout — forcing isBuilding=false");
          setIsBuilding(false);
          setIsLoading(false);
          setBuildStep("");
          setPipelineStep(null);
          setCurrentAgent(null);
          isSendingRef.current = false;
          void conversationCompleteBuild?.({
            filesChanged: [],
            totalFiles: 0,
            chatSummary: "Build timed out after 10 minutes",
            timestamp: Date.now(),
            verificationOk: false,
          });
          setMessages((prev) => {
            const msg =
              "⚠️ Build timed out after 10 minutes without progress. The AI model may be under heavy load — please try again, or break the request into smaller steps.";
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
            }
            return [...prev, { role: "assistant", content: msg, timestamp: Date.now() }];
          });
        }, BUILD_TIMEOUT_MS);
      };

      resetBuildSafetyTimeout();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const { schemas, knowledge, irContext } = await fetchProjectContext(currentProject.id);

        if (isStaleBuild()) {
          console.warn("[BuildOrch] Project switched during context fetch, aborting");
          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");
          isSendingRef.current = false;
          return;
        }

        const liveSandpackFilesForContext = sandpackFilesRef.current;
        const hasAnyFiles = !!liveSandpackFilesForContext && Object.keys(liveSandpackFilesForContext).length > 0;

        const safeSandpackFiles = sandpackFilesRef.current;
        const currentCodeSummary = buildCodeSummary(
          hasAnyFiles ? safeSandpackFiles : null,
          hasAnyFiles ? "" : currentPreviewHtml,
        );

        const currentMessages = messagesRef.current;

        const themeInfo = DESIGN_THEMES.find((t) => t.id === selectedTheme);
        const userText = typeof text === "string" ? text : "";
        const snippetsContext = getSnippetsPromptContext(userText);

        // Bug B fix: always allow template matching
        const template = selectedTemplate || matchTemplate(userText);

        let templateCtx = "";
        if (template) {
          templateCtx = `## MATCHED TEMPLATE: ${template.name}\n\nUse this as your structural blueprint:\n${template.blueprint}\n\nCustomize the content, colors, and details based on the user's specific request. Do NOT copy the blueprint literally — adapt it creatively.`;
          console.log(`[Template Matched] ${template.emoji} ${template.name}`);
          setSelectedTemplate(null);
        }

        setCurrentAgent("build");
        setPipelineStep("planning");

        const liveSandpackFiles = sandpackFilesRef.current || {};

        // Bug A fix: first-build based on user files, not scaffolded UI
        const userFileCount = Object.keys(liveSandpackFiles).filter((p) => !p.startsWith("/components/ui/")).length;
        const isFirstBuild = userFileCount === 0;

        if (!isFirstBuild && !text.startsWith("🔧 AUTO-FIX") && !text.includes("# APPLICATION REQUIREMENTS")) {
          console.log(
            `[BuildOrch] Workspace has ${Object.keys(liveSandpackFiles).length} files (${userFileCount} user files) — routing to edit pipeline instead of rebuild`,
          );
          setCurrentAgent("edit");
          setPipelineStep("resolving");
          await sendEditMessage(text, images);
          return;
        }

        const isSimpleBuild = isFirstBuild && !!template;
        let templateFiles: Record<string, string> | null = null;
        let templateName = "";

        if (isSimpleBuild || isFirstBuild) {
          const instantResult = await tryInstantBuild(template, userText);
          if (instantResult) {
            const finalFiles = instantResult.files;
            setSandpackFiles(finalFiles);
            syncSandpackToVirtualFS(finalFiles);
            if (Object.keys(instantResult.deps).length > 0) setSandpackDeps(instantResult.deps);
            setPreviewMode("sandpack");

            // Pillar 2: Index into AST + provenance
            try {
              const manifest = startBuildManifest(userText, "template");
              indexFilesIntoAST(finalFiles);
              buildProvenanceMap();
              for (const [fp, content] of Object.entries(finalFiles)) {
                recordFileInManifest(fp, content, { origin: "template", taskLabel: instantResult.templateName });
              }
              completeBuildManifest(true);
            } catch (e) { console.warn("[Pillar2] AST indexing failed (non-blocking):", e); }

            const fileCount = Object.keys(finalFiles).length;
            const msg = `✅ **${instantResult.templateName}** — ${fileCount} files rendered instantly!\n\nYour app is ready with API-wired data hooks and fallback demo data. Backend schema included.`;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
              }
              return [...prev, { role: "assistant", content: msg, timestamp: Date.now() }];
            });

            if (currentProject?.id) {
              const payload = { files: finalFiles, deps: instantResult.deps };
              supabase
                .from("project_data")
                .upsert(
                  {
                    project_id: currentProject.id,
                    collection: "sandpack_state",
                    data: payload as any,
                  },
                  { onConflict: "project_id,collection" },
                )
                .then(({ error: err }) => {
                  if (err) console.warn("[InstantBuild] Failed to persist sandpack state:", err);
                  else console.log("[InstantBuild] ✅ Sandpack state persisted");
                });
            }

            const totalSizeBytes = Object.values(finalFiles).reduce((sum, code) => sum + (code?.length || 0), 0);
            supabase.auth
              .getUser()
              .then(async ({ data: authData }) => {
                const userId = authData?.user?.id;
                if (!userId) return;

                const buildId = crypto.randomUUID();
                const storagePath = `${currentProject.id}/${buildId}`;
                const previewHtml = generatePreviewHtmlForBuild(finalFiles);
                const previewPath = `${storagePath}/preview/index.html`;

                await supabase.storage
                  .from("build-artifacts")
                  .upload(previewPath, new Blob([previewHtml], { type: "text/html" }), {
                    contentType: "text/html",
                    upsert: true,
                  });

                const { data: publicUrlData } = supabase.storage.from("build-artifacts").getPublicUrl(previewPath);
                const previewUrl = publicUrlData?.publicUrl || null;

                supabase
                  .from("build_jobs")
                  .insert({
                    project_id: currentProject.id,
                    user_id: userId,
                    status: "complete",
                    file_count: fileCount,
                    total_size_bytes: totalSizeBytes,
                    build_duration_ms: 0,
                    build_config: {
                      model: "instant-template",
                      techStack: "react-cdn",
                      template: instantResult.templateName,
                    } as any,
                    validation_results: { valid: true, errors: [], warnings: [] } as any,
                    build_log: [
                      `[${new Date().toISOString()}] Instant template: ${instantResult.templateName}`,
                      `[${new Date().toISOString()}] Files: ${fileCount}`,
                      `[${new Date().toISOString()}] Build complete (instant)`,
                    ],
                    source_files: {} as any,
                    output_files: {} as any,
                    dependencies: instantResult.deps as any,
                    artifact_path: storagePath,
                    preview_url: previewUrl,
                    error: null,
                    started_at: new Date().toISOString(),
                    completed_at: new Date().toISOString(),
                  })
                  .then(({ error: buildErr }) => {
                    if (buildErr) console.error("[InstantBuild] build_jobs insert failed:", buildErr.message);
                    else {
                      console.log("[InstantBuild] ✅ Build recorded");
                      if (previewUrl) {
                        window.dispatchEvent(new CustomEvent("build-preview-url", { detail: previewUrl }));
                      }
                    }
                  });
              })
              .catch(() => {});

            const persistMessages = messagesRef.current.map((m) => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : getTextContent(m.content),
            }));
            saveProject({
              chat_history: persistMessages,
              html_content: currentProject.html_content || "",
            });

            if (onVersionCreated) {
              onVersionCreated({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                label: userText.slice(0, 60) || "Instant build",
                html: "",
                messageIndex: currentMessages.length,
              });
            }

            setIsLoading(false);
            setIsBuilding(false);
            setBuildStep("");
            setPipelineStep("complete");
            setCurrentAgent(null);
            isSendingRef.current = false;
            setBuildRetryCount(0);
            setTimeout(() => setBuildStreamContent(""), 1000);
            console.log(`[InstantBuild] ⚡ Complete — skipped compile() pipeline entirely`);
            return;
          }
        }

        let domainModel: any = null;
        if (currentProject.ir_state) {
          try {
            const { irToDomainModel } = await import("@/lib/irToDomain");
            domainModel = irToDomainModel(currentProject.ir_state);
            if (domainModel?.entities?.length > 0) {
              console.log(`[BuildOrch] IR → DomainModel: ${domainModel.entities.length} entities`);
            } else {
              domainModel = null;
            }
          } catch {
            domainModel = null;
          }
        }

        if (!domainModel && isFirstBuild) {
          try {
            setBuildStep("🧠 Analyzing domain requirements...");
            const { matchDomainTemplate, serializeDomainModel } = await import("@/lib/domainTemplates");
            const templateMatch = matchDomainTemplate(userText);

            if (templateMatch.template) {
              console.log(
                `[BuildOrch] Domain template matched: ${templateMatch.template.name} (confidence: ${templateMatch.confidence}, keywords: ${templateMatch.matchedKeywords.join(
                  ", ",
                )})`,
              );

              const reqResp = await fetch(`${SUPABASE_URL}/functions/v1/requirements-agent`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_KEY}`,
                },
                body: JSON.stringify({
                  prompt: userText,
                  matchedTemplate: templateMatch.template.model,
                  existingSchemas: schemas,
                }),
              });

              if (reqResp.ok) {
                domainModel = await reqResp.json();
                console.log(
                  `[BuildOrch] ✅ Domain model extracted: ${
                    domainModel.entities?.length || 0
                  } entities, auth: ${domainModel.requiresAuth}`,
                );
              } else {
                console.warn("[BuildOrch] Requirements agent failed, using template directly");
                domainModel = templateMatch.template.model;
              }
            } else {
              console.log("[BuildOrch] No domain template matched, using direct build");
            }
          } catch (err) {
            console.warn("[BuildOrch] Requirements agent error, proceeding without domain model:", err);
          }
        }

        if (isStaleBuild()) {
          console.warn("[BuildOrch] Project switched during build setup, aborting");
          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");
          isSendingRef.current = false;
          return;
        }

        const safeExistingFiles =
          hasAnyFiles && liveSandpackFiles && Object.keys(liveSandpackFiles).length > 0 ? liveSandpackFiles : undefined;

        const fileCount = safeExistingFiles ? Object.keys(safeExistingFiles).length : 0;
        const fullPromptForScoring = currentCodeSummary ? `${userText}\n\n${currentCodeSummary}` : userText;
        const isComplexBuild =
          fullPromptForScoring.length > 2000 || /Phase \d+/gi.test(userText) || userText.length > 500;
        const modelOverride = isComplexBuild
          ? undefined
          : selectedModel !== "google/gemini-2.5-pro"
            ? selectedModel
            : undefined;
        const routedModel = clientRouteModel(fullPromptForScoring, "build", fileCount, modelOverride);
        if (isComplexBuild) {
          console.log(
            `[BuildOrch] Complex build detected (${userText.length} chars) — CostRouter will select model (no user override)`,
          );
        }

        saveSnapshot(`Pre-build: ${userText.slice(0, 50)}`);

        const compileOptions: CompileOptions = {
          rawRequirements: templateFiles
            ? `${userText}\n\n## TEMPLATE CONTEXT\n${templateCtx}\nCustomize the existing ${templateName} template files based on the user request above.`
            : userText,
          existingWorkspace: templateFiles || safeExistingFiles || {},
          projectId: buildProjectId,
          techStack: currentProject.tech_stack || "react-cdn",
          schemas: schemas.length > 0 ? schemas : undefined,
          knowledge: knowledge.length > 0 ? knowledge : undefined,
          designTheme: themeInfo?.prompt,
          model: routedModel,
        };

        setCompilerTasks([{ id: "planning", label: "Planning task graph", status: "in_progress" }]);

        const compileCallbacks: CompileCallbacks = {
          onPhase: (phase, detail) => {
            if (isStaleBuild()) return;
            resetBuildSafetyTimeout();
            setBuildStep(detail);
            if (phase === "planning") setPipelineStep("planning");
            else if (phase === "executing") setPipelineStep("generating");
            else if (phase === "verifying") setPipelineStep("validating");
            else if (phase === "repairing") setPipelineStep("retrying");
            else if (phase === "complete") setPipelineStep("complete");
          },
          onPlanReady: (tasks) => {
            if (isStaleBuild()) return;
            planLabelsRef.current = tasks.map((t) => normalizeTaskLabel(t.label));
            setCompilerTasks(
              tasks.map((t, i) => ({
                id: `task-${i}`,
                label: normalizeTaskLabel(t.label),
                status: "pending" as const,
              })),
            );
          },
          onTaskStart: (task, index, total) => {
            if (isStaleBuild()) return;
            resetBuildSafetyTimeout();
            setCurrentTaskIndex(index);
            setTotalPlanTasks(total);
            const normalizedLabel = normalizeTaskLabel(task.label);
            setBuildStep(`🔨 Task ${index + 1}/${total}: ${normalizedLabel}`);

            setCompilerTasks((prev) =>
              prev.map((t, i) => ({
                ...t,
                label: i === index ? normalizedLabel : t.label,
                status: i < index ? "done" : i === index ? "in_progress" : t.status,
              })),
            );

            const labels = planLabelsRef.current;
            const progressMsg = `📋 **Building** (${total} tasks)\n\n${Array.from({ length: total }, (_, i) => {
              const status = i < index ? "✅" : i === index ? "🔨" : "⏳";
              const label = labels[i] || normalizedLabel;
              return `${status} ${i + 1}. ${label}`;
            }).join("\n")}`;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: progressMsg } : m));
              }
              return [...prev, { role: "assistant", content: progressMsg, timestamp: Date.now() }];
            });
          },
          onTaskDelta: (task, chunk) => {
            if (isStaleBuild()) return;
            resetBuildSafetyTimeout();
            setBuildStreamContent((prev) => prev + chunk);
          },
          onTaskDone: (task, files) => {
            if (isStaleBuild()) {
              console.warn("[Compiler] ⛔ Ignored stale task output from cancelled/superseded build");
              return;
            }
            resetBuildSafetyTimeout();
            if (lastProjectIdRef.current !== null && lastProjectIdRef.current !== buildProjectId) {
              console.warn(`[Compiler] ⛔ Blocked cross-project file injection`);
              return;
            }
            const doneLabel = normalizeTaskLabel(task.label);
            setCompilerTasks((prev) =>
              prev.map((t) => (t.label === doneLabel ? { ...t, status: "done" as const } : t)),
            );

            if (Object.keys(files).length > 0) {
              const currentFiles = sandpackFilesRef.current || {};
              const mergedFiles = sanitizeWorkspaceForPreview({
                ...currentFiles,
                ...files,
              });
              sandpackFilesRef.current = mergedFiles;
              syncSandpackToVirtualFS(mergedFiles);
              console.log(
                `[Compiler] Buffered task output (${Object.keys(mergedFiles).length} files) — preview will update on build completion`,
              );

              if (currentProject?.id) {
                const incrementalPayload = {
                  files: mergedFiles,
                  deps: {},
                  partial: true,
                };
                supabase
                  .from("project_data")
                  .upsert(
                    {
                      project_id: currentProject.id,
                      collection: "sandpack_state",
                      data: incrementalPayload as any,
                    },
                    { onConflict: "project_id,collection" },
                  )
                  .then(({ error }) => {
                    if (error) console.warn("[Compiler] Incremental persist failed:", error);
                    else console.log(`[Compiler] 💾 Incremental save: ${Object.keys(mergedFiles).length} files`);
                  });
              }
            }
          },
          onTaskError: (task, error) => {
            if (isStaleBuild()) return;
            const errLabel = normalizeTaskLabel(task.label);
            console.error(`[Compiler] Task '${errLabel}' failed:`, error);
            setCompilerTasks((prev) =>
              prev.map((t) =>
                t.label === errLabel ? { ...t, status: "done" as const, label: `❌ ${errLabel}` } : t,
              ),
            );
          },
          onVerification: (result) => {
            if (isStaleBuild()) return;
            resetBuildSafetyTimeout();
            if (result.ok) {
              setBuildStep("✅ All checks passed");
            } else {
              const errorCount = result.issues.filter((i) => i.severity === "error").length;
              setBuildStep(`⚠️ ${errorCount} issues found, repairing...`);
            }
          },
          onRepairStart: (round, actionCount) => {
            if (isStaleBuild()) return;
            resetBuildSafetyTimeout();
            setBuildStep(`🔧 Auto-repair round ${round}: fixing ${actionCount} issues...`);
          },
          onComplete: (result: BuildResult) => {
            if (isStaleBuild()) {
              console.warn("[Compiler] ⛔ Ignored stale completion from cancelled/superseded build");
              return;
            }
            lastVerificationOkRef.current = result.verification.ok;

            if (deferredPreviewTimerRef.current) {
              clearTimeout(deferredPreviewTimerRef.current);
              deferredPreviewTimerRef.current = null;
            }

            const finalWorkspace = sanitizeWorkspaceForPreview(result.workspace);
            setSandpackFiles(finalWorkspace);
            syncSandpackToVirtualFS(finalWorkspace);
            setPreviewMode("sandpack");

            // Pillar 2: Index into AST + provenance + manifest
            try {
              indexFilesIntoAST(finalWorkspace);
              buildProvenanceMap();
              for (const [fp, content] of Object.entries(finalWorkspace)) {
                recordFileInManifest(fp, content, { origin: "ai_generated", model: selectedModel });
              }
              completeBuildManifest(result.status === "success");
            } catch (e) { console.warn("[Pillar2] AST indexing failed (non-blocking):", e); }

            const statusEmoji = result.status === "success" ? "✅" : result.status === "partial" ? "⚠️" : "❌";
            const staticLine = result.verification.ok
              ? "Static checks passed."
              : `${result.verification.issues.filter((i) => i.severity === "error").length} static issues found.`;
            const runtimeLine =
              result.runtime?.runtimeStatus === "passed"
                ? "Runtime smoke checks passed."
                : result.runtime?.runtimeStatus === "failed"
                  ? "Runtime checks found issues."
                  : "Runtime checks not run yet.";

            const msg = `${statusEmoji} ${result.summary}\n\n**Verification:** ${staticLine}\n**Runtime:** ${runtimeLine}${
              result.knownIssues.length > 0
                ? `\n\n**Known issues:**\n${result.knownIssues.map((i) => `- ${i}`).join("\n")}`
                : ""
            }${
              result.nextActions.length > 0
                ? `\n\n**Next steps:**\n${result.nextActions.map((a) => `- ${a}`).join("\n")}`
                : ""
            }`;

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
              }
              return [...prev, { role: "assistant", content: msg, timestamp: Date.now() }];
            });

            setIsLoading(false);
            setIsBuilding(false);
            setBuildStep("");
            setPipelineStep("complete");
            setCurrentAgent(null);
            isSendingRef.current = false;
            setBuildRetryCount(0);
            if (result.trace) setBuildMetrics(result.trace);
            void conversationCompleteBuild?.({
              filesChanged: Object.keys(finalWorkspace),
              totalFiles: Object.keys(finalWorkspace).length,
              chatSummary: result.summary,
              timestamp: Date.now(),
              verificationOk: result.verification.ok,
            });
            setTimeout(() => setBuildStreamContent(""), 3000);

            const persistMessages = messagesRef.current.map((m) => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : getTextContent(m.content),
            }));
            saveProject({
              chat_history: persistMessages,
              html_content: currentProject.html_content || "",
            });

            if (Object.keys(finalWorkspace).length > 0) {
              const payload = { files: finalWorkspace, deps: {} };
              supabase
                .from("project_data")
                .upsert(
                  {
                    project_id: currentProject.id,
                    collection: "sandpack_state",
                    data: payload as any,
                  },
                  { onConflict: "project_id,collection" },
                )
                .then(({ error }) => {
                  if (error) console.warn("[Compiler] Failed to persist sandpack state:", error);
                  else console.log("[Compiler] ✅ Sandpack state persisted");
                });

              const buildDurationMs = result.trace?.totalDurationMs ?? null;
              const totalSizeBytes = Object.values(finalWorkspace).reduce((sum, code) => sum + (code?.length || 0), 0);

              const validationResults = {
                valid: result.verification.ok,
                errors: result.verification.issues
                  .filter((i) => i.severity === "error")
                  .map((i) => ({ file: i.file || "", message: i.message, severity: i.severity })),
                warnings: result.verification.issues
                  .filter((i) => i.severity === "warning")
                  .map((i) => ({ file: i.file || "", message: i.message, severity: i.severity })),
              };

              supabase.auth
                .getUser()
                .then(async ({ data: authData, error: authErr }) => {
                  if (authErr) {
                    console.error("[Compiler] auth.getUser() failed:", authErr.message);
                    return;
                  }

                  const userId = authData?.user?.id;
                  if (!userId) {
                    console.warn("[Compiler] No authenticated user — skipping build_jobs insert");
                    return;
                  }

                  console.log(
                    "[Compiler] Inserting build_jobs record for user:",
                    userId,
                    "project:",
                    currentProject.id,
                  );

                  const buildId = crypto.randomUUID();
                  const storagePath = `${currentProject.id}/${buildId}`;

                  await Promise.all(
                    Object.entries(finalWorkspace).map(async ([path, code]) => {
                      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
                      await supabase.storage
                        .from("build-artifacts")
                        .upload(`${storagePath}/src/${cleanPath}`, new Blob([code], { type: "text/plain" }), {
                          upsert: true,
                        });
                    }),
                  );

                  const previewHtml = generatePreviewHtmlForBuild(finalWorkspace);
                  const previewPath = `${storagePath}/preview/index.html`;
                  await supabase.storage
                    .from("build-artifacts")
                    .upload(previewPath, new Blob([previewHtml], { type: "text/html" }), {
                      contentType: "text/html",
                      upsert: true,
                    });

                  const { data: publicUrlData } = supabase.storage.from("build-artifacts").getPublicUrl(previewPath);
                  const previewUrl = publicUrlData?.publicUrl || null;

                  const sourceFiles = Object.fromEntries(
                    Object.keys(finalWorkspace).map((path) => {
                      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
                      return [path, `${storagePath}/src/${cleanPath}`];
                    }),
                  );

                  supabase
                    .from("build_jobs")
                    .insert({
                      project_id: currentProject.id,
                      user_id: userId,
                      status:
                        result.status === "success" ? "complete" : result.status === "partial" ? "complete" : "failed",
                      file_count: Object.keys(finalWorkspace).length,
                      total_size_bytes: totalSizeBytes,
                      build_duration_ms: buildDurationMs,
                      build_config: {
                        model: routedModel,
                        techStack: currentProject.tech_stack || "react-cdn",
                      } as any,
                      validation_results: validationResults as any,
                      build_log: [
                        `[${new Date().toISOString()}] Build started`,
                        `[${new Date().toISOString()}] Files: ${Object.keys(finalWorkspace).length}`,
                        `[${new Date().toISOString()}] Preview uploaded`,
                        `[${new Date().toISOString()}] Build complete in ${buildDurationMs ?? "?"}ms`,
                      ],
                      source_files: sourceFiles,
                      output_files: { ...sourceFiles, "preview/index.html": previewPath },
                      dependencies: {},
                      artifact_path: storagePath,
                      preview_url: previewUrl,
                      error: result.status === "failed" ? result.knownIssues.join("; ") : null,
                      started_at: new Date(Date.now() - (buildDurationMs || 0)).toISOString(),
                      completed_at: new Date().toISOString(),
                    })
                    .select()
                    .then(({ data: buildRow, error: buildErr }) => {
                      if (buildErr)
                        console.error("[Compiler] Failed to insert build_jobs record:", buildErr.message, buildErr);
                      else {
                        console.log(
                          "[Compiler] ✅ Build recorded in build_jobs:",
                          buildRow?.[0]?.id,
                          "preview:",
                          previewUrl,
                        );
                        if (previewUrl) {
                          window.dispatchEvent(new CustomEvent("build-preview-url", { detail: previewUrl }));
                        }
                      }
                    });
                })
                .catch((err) => {
                  console.error("[Compiler] getUser() promise rejected:", err);
                });
            }

            if (onVersionCreated) {
              onVersionCreated({
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                label: userText.slice(0, 60) || "Build update",
                html: "",
                messageIndex: currentMessages.length,
              });
            }
          },
        };

        try {
          await compile(compileOptions, compileCallbacks);
        } catch (err: any) {
          if (isStaleBuild()) return;
          handleOnError(err.message || "Compiler error");
        }
      } catch (e) {
        if (isStaleBuild()) return;
        console.error("[BuildOrch] sendMessage error:", e);
        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        isSendingRef.current = false;
      }
    },
    [
      currentProject,
      saveProject,
      setPreviewHtml,
      setIsBuilding,
      setBuildStep,
      selectedModel,
      selectedTheme,
      onVersionCreated,
      setVirtualFiles,
      fetchProjectContext,
      syncSandpackToVirtualFS,
      sanitizeWorkspaceForPreview,
      buildMessageContent,
      currentPreviewHtml,
      setMessages,
      setInput,
      setAttachedImages,
      setPreviewErrors,
      setHealAttempts,
      setSandpackFiles,
      setSandpackDeps,
      setPreviewMode,
      setBuildMetrics,
      saveSnapshot,
      selectedTemplate,
      tryInstantBuild,
      handleOnError,
      conversationCompleteBuild,
    ],
  );

  useEffect(() => {
    if (pendingBuildPrompt && !isSendingRef.current && !isLoadingRef.current) {
      console.log("[BuildOrch] BUILD_CONFIRMED marker detected — triggering build pipeline");
      const buildPrompt = pendingBuildPrompt;
      setPendingBuildPrompt(null);

      let firstBuildRequest: string | null = null;

      const relevantMessages = messagesRef.current.filter((m) => {
        const msgText = getTextContent(m.content).trim();
        if (m.role !== "user") return false;
        if (msgText.length <= 10) return false;
        if (NOISE.test(msgText.toLowerCase())) return false;
        if (COMPLAINT_NOISE.test(msgText.toLowerCase())) return false;
        if (META_NOISE.test(msgText.toLowerCase())) return false;

        if (DUPLICATE_TRIGGER.test(msgText)) {
          if (!firstBuildRequest) {
            firstBuildRequest = msgText;
            return true;
          }
          return false;
        }

        if (msgText.includes("# APPLICATION REQUIREMENTS") || msgText.includes("## BUILD TRIGGER")) return false;

        return true;
      });

      const userRequirements = relevantMessages.map((m) => getTextContent(m.content)).join("\n\n");

      const finalPrompt =
        userRequirements.length > 50
          ? `# APPLICATION REQUIREMENTS\n\n${userRequirements}\n\nBuild a complete, production-ready application for this domain request.`
          : buildPrompt;

      setCurrentAgent("build");
      setPipelineStep("planning");
      setTimeout(() => sendMessage(finalPrompt, []), 0);
    }
  }, [pendingBuildPrompt, sendMessage]);

  const sendEditMessage = useCallback(
    async (text: string, images: string[] = []) => {
      if (!currentProject) return;

      const genericRuntimeFix =
        /\b(fix|resolve|repair)\b/i.test(text) &&
        /\b(error|preview|runtime|crash|broken|issue|same error|something went wrong)\b/i.test(text) &&
        !/\/[\w/.-]+\.(?:jsx?|tsx?|css)/i.test(text);
      const diagnostics = previewErrors.slice(-5).join("\n");
      const enrichedInstruction =
        genericRuntimeFix && diagnostics ? `${text}\n\nCurrent preview errors:\n${diagnostics}` : text;

      const workspace = sandpackFilesRef.current;
      if (!workspace || Object.keys(workspace).length === 0) {
        console.log("[EditMode] No workspace files, falling back to build");
        setCurrentAgent("build");
        setPipelineStep("planning");
        sendMessage(enrichedInstruction, images);
        return;
      }

      const content = buildMessageContent(text, images);
      const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
      setInput("");
      setAttachedImages([]);
      setMessages((prev) => [...prev, userMsg]);

      setIsLoading(true);
      setIsBuilding(true);
      isSendingRef.current = true;
      setBuildStreamContent("");

      const WORKSPACE_ENTRIES = Object.entries(workspace);
      const BATCH_SIZE = 40;

      let resolvedTargetFiles: string[] = [];
      const beforeSnapshots: Record<string, string> = {};
      const aggregatedModifiedFiles: Record<string, string> = {};
      const aggregatedDependencies: Record<string, string> = {};
      let aggregatedExplanation = "";

      try {
        for (let i = 0; i < WORKSPACE_ENTRIES.length; i += BATCH_SIZE) {
          const batchEntries = WORKSPACE_ENTRIES.slice(i, i + BATCH_SIZE);
          const batchWorkspace: Record<string, string> = {};
          for (const [path, code] of batchEntries) {
            batchWorkspace[path] = code;
          }

          await executeEdit(
            {
              instruction: enrichedInstruction,
              workspace: batchWorkspace,
              projectId: currentProject.id,
              model: selectedModel,
              designTheme: selectedTheme,
              knowledge: [],
              images,
            },
            {
              onResolving: (targetFiles) => {
                if (resolvedTargetFiles.length === 0) {
                  resolvedTargetFiles = targetFiles;
                  for (const f of targetFiles) {
                    if (workspace[f]) beforeSnapshots[f] = workspace[f];
                  }
                  setPipelineStep("resolving");
                  setBuildStep(`Editing ${targetFiles.length} file${targetFiles.length > 1 ? "s" : ""}`);
                  console.log("[EditMode] Target files:", targetFiles);

                  conversationStartEditing?.(enrichedInstruction, targetFiles, beforeSnapshots);
                }
              },
              onStreaming: (chunk) => {
                setBuildStreamContent((prev) => prev + chunk);
                setPipelineStep("editing");
              },
              onComplete: async (result: EditResult) => {
                console.log("[EditMode] Batch complete:", Object.keys(result.modifiedFiles));
                Object.assign(aggregatedModifiedFiles, result.modifiedFiles);
                Object.assign(aggregatedDependencies, result.dependencies);
                aggregatedExplanation += (aggregatedExplanation ? "\n\n" : "") + result.explanation;
              },
              onError: (error) => {
                throw new Error(error);
              },
            },
          );
        }

        const updatedFiles = { ...workspace };
        for (const [path, code] of Object.entries(aggregatedModifiedFiles)) {
          updatedFiles[path] = code;
        }

        try {
          const repairWorkspace = new Workspace(updatedFiles);
          repairMissingModules(repairWorkspace);
          fixMissingImports(repairWorkspace);
          fixExportMismatches(repairWorkspace);
          normalizeGeneratedStructure(repairWorkspace);
          deduplicateFiles(repairWorkspace);
          const repairedFiles: Record<string, string> = {};
          for (const f of repairWorkspace.listFiles()) {
            repairedFiles[f] = repairWorkspace.getFile(f)!;
          }
          Object.assign(updatedFiles, repairedFiles);
        } catch (repairErr) {
          console.warn("[EditMode] Post-edit repair failed (non-blocking):", repairErr);
        }

        const afterSnapshots: Record<string, string> = {};
        for (const f of resolvedTargetFiles) {
          if (updatedFiles[f]) afterSnapshots[f] = updatedFiles[f];
        }

        setSandpackFiles(updatedFiles);
        syncSandpackToVirtualFS(updatedFiles);
        if (Object.keys(aggregatedDependencies).length > 0) {
          setSandpackDeps((prev: Record<string, string>) => ({
            ...prev,
            ...aggregatedDependencies,
          }));
        }
        setPreviewMode("sandpack");

        // Pillar 2: Index edited files into AST
        try {
          indexFilesIntoAST(updatedFiles);
          buildProvenanceMap();
          for (const f of resolvedTargetFiles) {
            if (updatedFiles[f]) {
              recordFileInManifest(f, updatedFiles[f], { origin: "ai_edited", model: selectedModel });
            }
          }
          completeBuildManifest(true);
        } catch (e) { console.warn("[Pillar2] AST indexing failed (non-blocking):", e); }

        const postEditReadiness = await conversationCompleteEdit?.(
          enrichedInstruction,
          resolvedTargetFiles,
          beforeSnapshots,
          afterSnapshots,
          aggregatedExplanation,
        );

        const fileList = resolvedTargetFiles.map((f) => f.split("/").pop()).join(", ");
        let editMsg = `✅ **Edited ${resolvedTargetFiles.length} file${
          resolvedTargetFiles.length > 1 ? "s" : ""
        }** (${fileList})\n\n${aggregatedExplanation}`;
        if (postEditReadiness && !postEditReadiness.isReady) {
          editMsg += `\n\n⚠️ **Post-edit readiness:** ${postEditReadiness.score}% — ${postEditReadiness.recommendation}`;
        }

        const assistantMsg: Msg = {
          role: "assistant",
          content: editMsg,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        const updatedMessages = [...messagesRef.current, userMsg, assistantMsg];
        saveProject({
          chat_history: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        supabase
          .from("project_data")
          .upsert(
            {
              project_id: currentProject.id,
              collection: "sandpack_state",
              data: { files: updatedFiles, deps: {} } as any,
            },
            { onConflict: "project_id,collection" },
          )
          .then(({ error }) => {
            if (error) console.warn("[EditMode] Failed to persist sandpack state:", error);
          });

        saveSnapshot(`Edit: ${text.slice(0, 40)}`);

        setPipelineStep("complete");
        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        isSendingRef.current = false;
      } catch (err: any) {
        console.error("[EditMode] Unexpected error:", err);
        const assistantMsg: Msg = {
          role: "assistant",
          content: `⚠️ Edit failed: ${err?.message || String(err)}\n\nTry being more specific about which page or component to modify.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setPipelineStep("error");
        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        isSendingRef.current = false;
      }
    },
    [
      currentProject,
      selectedModel,
      selectedTheme,
      previewErrors,
      sendMessage,
      buildMessageContent,
      setInput,
      setAttachedImages,
      setMessages,
      saveProject,
      setSandpackFiles,
      syncSandpackToVirtualFS,
      setPreviewMode,
      setIsBuilding,
      setBuildStep,
      saveSnapshot,
      conversationStartEditing,
      conversationCompleteEdit,
    ],
  );

  const handleSmartSend = useCallback(
    async (text: string, images: string[] = []) => {
      if (!text && images.length === 0) return;

      if (isSendingRef.current && !isLoading) {
        console.warn("[SmartSend] Resetting stale isSendingRef (was true but isLoading=false)");
        isSendingRef.current = false;
      }
      if (isLoadingRef.current && !isLoading) {
        console.warn("[SmartSend] Resetting stale isLoadingRef (was true but isLoading=false)");
        isLoadingRef.current = false;
      }

      if (isSendingRef.current || isLoadingRef.current) return;

      const smartSendProjectId = currentProject?.id;
      const isSmartSendStale = () =>
        !smartSendProjectId || (lastProjectIdRef.current !== null && lastProjectIdRef.current !== smartSendProjectId);

      const hasImages = images.length > 0;
      const finalText = (text || "").trim();
      if (!finalText && !hasImages) return;

      const hasExistingCode = !!(sandpackFilesRef.current && Object.keys(sandpackFilesRef.current).length > 0);
      const CONFIRM_ONLY =
        /^(yes|yep|yeah|go ahead|proceed|do it|ok|okay|sure|continue|start|build it|just do it)\s*[.!]?$/i;
      const NON_ACTIONABLE =
        /^[\s!?.,:;\-—…'"()*#@&^%$~`]+$|^(fuck|shit|damn|hell|wtf|omg|ugh|lol|hmm|huh|meh|bruh|stop|quit|bye|go away|leave|shut up|whatever|forget it|never ?mind|screw|crap|bloody|idiot|stupid|dumb|rubbish|useless|hate|sucks?|annoying|terrible|horrible|awful|worst|lame|pathetic)\b/i;

      const buildRequirementsPayload = async (triggerText: string) => {
        const compiled = await Promise.resolve(conversationGetRequirements?.() || "");
        const normalizedTrigger = triggerText.trim();

        if (compiled && compiled.length > 50) {
          return `${compiled}\n\n## BUILD TRIGGER\n${normalizedTrigger}`;
        }

        if (!normalizedTrigger || CONFIRM_ONLY.test(normalizedTrigger)) {
          return "";
        }

        return [
          "# APPLICATION REQUIREMENTS",
          "",
          normalizedTrigger,
          "",
          "Build EXACTLY what the user requested above.",
          "Do NOT add unrelated features.",
        ].join("\n");
      };

      if (pendingExecution) {
        const reply = parseConfirmationReply(finalText);

        if (reply === "cancel") {
          setPendingExecution(null);
          setCurrentAgent("chat");
          setPipelineStep("chatting");
          appendConversationTurn(finalText, images, "Understood — I cancelled that request and made no code changes.");
          return;
        }

        if (reply === "unclear") {
          setPendingExecution(null);
        } else {
          if (pendingExecution.needsHighImpactConfirm && !pendingExecution.awaitingHighImpactConfirm) {
            setPendingExecution({
              ...pendingExecution,
              awaitingHighImpactConfirm: true,
            });
            appendConversationTurn(finalText, images, "This will modify core application files.\nProceed?");
            return;
          }

          const approved = pendingExecution;
          setPendingExecution(null);
          appendConversationTurn(finalText, images, "Proceeding with the approved change.");

          if (approved.routeHint === "edit") {
            setCurrentAgent("edit");
            setPipelineStep("resolving");
            sendEditMessage(approved.prompt, approved.images);
            return;
          }

          const approvedBuildPrompt = await buildRequirementsPayload(approved.prompt);
          if (isSmartSendStale()) return;

          if (!approvedBuildPrompt) {
            setCurrentAgent("chat");
            setPipelineStep("chatting");
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "Please share one concrete build request (not just confirmation), then I’ll run it.",
                timestamp: Date.now(),
              },
            ]);
            return;
          }

          setCurrentAgent("build");
          setPipelineStep("planning");
          sendMessage(approvedBuildPrompt, approved.images);
          return;
        }
      }

      const isAutoFix = finalText.startsWith("🔧");
      if (isAutoFix) {
        setCurrentAgent("build");
        setPipelineStep("planning");
        sendMessage(finalText, images);
        return;
      }

      const detectedUrl = extractUrlFromMessage(finalText);
      if (detectedUrl) {
        const content = buildMessageContent(finalText, images);
        const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
        setInput("");
        setAttachedImages([]);
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);
        setBuildStep("Analyzing URL...");
        setCurrentAgent("chat");
        setPipelineStep("chatting");

        try {
          const result = await analyzeUrl(detectedUrl);
          setIsLoading(false);
          setBuildStep("");

          if (result.success && result.confirmationMessage && result.buildPrompt) {
            setPendingExecution({
              prompt: result.buildPrompt,
              images: [],
              routeHint: "build" as GuardRouteHint,
              needsHighImpactConfirm: false,
              awaitingHighImpactConfirm: false,
            });

            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: result.confirmationMessage,
                timestamp: Date.now(),
              },
            ]);

            const persistMessages = messagesRef.current.map((m) => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : getTextContent(m.content),
            }));
            saveProject({ chat_history: persistMessages });
          } else {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content:
                  result.error ||
                  "I couldn't analyze that URL. Please try a different one or describe what you want to build.",
                timestamp: Date.now(),
              },
            ]);
          }
        } catch (err: any) {
          setIsLoading(false);
          setBuildStep("");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `⚠️ Failed to analyze URL: ${err.message || "Unknown error"}`,
              timestamp: Date.now(),
            },
          ]);
        }

        setPipelineStep(null);
        setCurrentAgent(null);
        isSendingRef.current = false;
        return;
      }

      const guardedIntent = classifyIntentGate(finalText, hasExistingCode);
      if (guardedIntent.isAmbiguous || guardedIntent.routeHint === "chat") {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }

      if (guardedIntent.requiresConfirmation) {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        setPendingExecution({
          prompt: finalText,
          images,
          routeHint: guardedIntent.routeHint,
          needsHighImpactConfirm: guardedIntent.requiresSecondConfirmation,
          awaitingHighImpactConfirm: false,
        });
        appendConversationTurn(finalText, images, "I can generate this.\nDo you want me to proceed?");
        return;
      }

      const normalizedText = finalText.toLowerCase();
      const explicitRebuildRequest = /\b(rebuild|from scratch|start over|regenerate app|new app|new project)\b/i.test(
        normalizedText,
      );
      const explicitEditVerb = /\b(fix|change|update|modify|refactor|patch|repair|replace|add|remove|delete)\b/i.test(
        normalizedText,
      );
      const explicitBuildVerb = /\b(build|create|generate|scaffold|implement|develop|make)\b/i.test(normalizedText);
      const hasRuntimeSignal =
        /\b(bug|error|not working|doesn't work|doesnt work|broken|crash|failed|fails|preview|runtime|problem|issue)\b/i.test(
          normalizedText,
        );
      const isQuestionOnly = finalText.endsWith("?") || /^(why|what|where|who|how)\b/i.test(finalText);
      const stopOrExplainOnly =
        /\b(do not build|don't build|dont build|do not edit|don't edit|dont edit|just explain|only explain|root cause only|without fixing)\b/i.test(
          normalizedText,
        );

      if (
        stopOrExplainOnly ||
        NON_ACTIONABLE.test(finalText) ||
        (isQuestionOnly && !explicitEditVerb && !explicitBuildVerb)
      ) {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }

      if (hasExistingCode && explicitEditVerb && hasRuntimeSignal && !explicitRebuildRequest) {
        setCurrentAgent("edit");
        setPipelineStep("resolving");
        sendEditMessage(finalText, images);
        return;
      }

      let convResult: { action: string; reason: string } | null = null;
      if (conversationAnalyzeAsync) {
        try {
          convResult = await conversationAnalyzeAsync(finalText, hasImages, hasExistingCode);
          if (isSmartSendStale()) return;
          console.log(
            `[SmartSend] Server analysis: mode=${conversationMode}, action=${convResult.action}, reason=${convResult.reason}`,
          );
        } catch (err) {
          console.warn("[SmartSend] Server analysis failed, falling back to safe chat route:", err);
        }
      }

      if (convResult?.action === "gather") {
        const phase = conversationAddPhase?.(finalText, hasImages, images);
        const ackText =
          conversationGenerateAck?.(phase) ||
          '✅ Got it! Send the next phase when ready, or say **"build it"** to start.';

        const content = buildMessageContent(finalText, images);
        const userMsg: Msg = {
          role: "user",
          content,
          timestamp: Date.now(),
        };
        setInput("");
        setAttachedImages([]);
        setMessages((prev) => [...prev, userMsg, { role: "assistant", content: ackText, timestamp: Date.now() }]);
        return;
      }

      if (convResult?.action === "edit") {
        setCurrentAgent("edit");
        setPipelineStep("resolving");
        sendEditMessage(finalText, images);
        return;
      }

      if (convResult?.action === "build") {
        if (hasExistingCode && !explicitRebuildRequest) {
          setCurrentAgent("edit");
          setPipelineStep("resolving");
          sendEditMessage(finalText, images);
          return;
        }

        conversationStartBuilding?.();
        const buildPrompt = await buildRequirementsPayload(finalText);
        if (isSmartSendStale()) return;

        if (!buildPrompt) {
          setCurrentAgent("chat");
          setPipelineStep("chatting");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "I need a concrete requirement to build from (not only confirmation).",
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        setCurrentAgent("build");
        setPipelineStep("planning");
        sendMessage(buildPrompt, images);
        return;
      }

      if (convResult?.action === "chat") {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }

      if (conversationMode === "gathering" && finalText.length > 10 && !CONFIRM_ONLY.test(finalText)) {
        const phase = conversationAddPhase?.(finalText, hasImages, images);
        const ackText =
          conversationGenerateAck?.(phase) ||
          '✅ Got it! Send the next phase when ready, or say **"build it"** to start.';
        const content = buildMessageContent(finalText, images);
        const userMsg: Msg = {
          role: "user",
          content,
          timestamp: Date.now(),
        };
        setInput("");
        setAttachedImages([]);
        setMessages((prev) => [...prev, userMsg, { role: "assistant", content: ackText, timestamp: Date.now() }]);
        return;
      }

      if (!hasExistingCode && explicitBuildVerb && !CONFIRM_ONLY.test(finalText)) {
        setPendingExecution({
          prompt: finalText,
          images,
          routeHint: "build",
          needsHighImpactConfirm: false,
          awaitingHighImpactConfirm: false,
        });
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        appendConversationTurn(finalText, images, "I can generate this.\nDo you want me to proceed?");
        return;
      }

      setCurrentAgent("chat");
      setPipelineStep("chatting");
      sendChatMessage(finalText, images);
    },
    [
      currentProject,
      pendingExecution,
      appendConversationTurn,
      sendChatMessage,
      sendMessage,
      sendEditMessage,
      conversationAnalyzeAsync,
      conversationAddPhase,
      conversationGetRequirements,
      conversationStartBuilding,
      conversationGenerateAck,
      conversationMode,
      buildMessageContent,
      setInput,
      setAttachedImages,
      setMessages,
      saveProject,
      isLoading,
      isLoadingRef,
    ],
  );

  const clearChat = useCallback(() => {
    if (!currentProject || isLoading) return;
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
    resetHealing();
    setCurrentAgent(null);
    setPipelineStep(null);
    setPendingBuildPrompt(null);
    setPendingExecution(null);
    setCurrentPlan(null);
    setCurrentTaskIndex(0);
    setTotalPlanTasks(0);
    setCompilerTasks([]);
    // Pillar 2: Reset build engine state
    resetASTWorkspace();
    clearProvenance();
    clearBuildHistory();
    isSendingRef.current = false;
    saveProject({ chat_history: [], html_content: "" });
  }, [
    currentProject,
    isLoading,
    setPreviewHtml,
    saveProject,
    setMessages,
    setSandpackFiles,
    setSandpackDeps,
    setPreviewMode,
    setPreviewErrors,
    setHealAttempts,
    resetHealing,
  ]);

  const abortBuild = useCallback(() => {
    buildRunTokenRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (buildSafetyTimeoutRef.current) {
      clearTimeout(buildSafetyTimeoutRef.current);
      buildSafetyTimeoutRef.current = null;
    }
    sandpackFilesRef.current = null;
    setSandpackFiles(null);
    setSandpackDeps({});
    syncSandpackToVirtualFS({});
    setCompilerTasks([]);
    setPipelineStep(null);
    setCurrentAgent(null);
    setIsLoading(false);
    setIsBuilding(false);
    setBuildStep("");
    isSendingRef.current = false;
  }, [setSandpackFiles, setSandpackDeps, syncSandpackToVirtualFS, setIsBuilding, setBuildStep]);

  return {
    isLoading,
    buildStreamContent,
    currentAgent,
    pipelineStep,
    setPipelineStep,
    currentPlan,
    currentTaskIndex,
    totalPlanTasks,
    selectedTemplate,
    setSelectedTemplate,
    buildRetryCount,
    compilerTasks,

    isSendingRef,
    isLoadingRef,
    messagesRef,
    sandpackFilesRef,
    abortControllerRef,
    lastProjectIdRef,
    lastVerificationOkRef,

    sendMessage,
    sendChatMessage,
    sendEditMessage,
    handleSmartSend,
    clearChat,
    abortBuild,
    syncSandpackToVirtualFS,
    buildMessageContent,

    setCurrentAgent,
    setCurrentPlan,
    setCurrentTaskIndex,
    setTotalPlanTasks,
    setBuildStreamContent,
    setBuildRetryCount,
    setPendingBuildPrompt,
    setIsLoading,
  };
}

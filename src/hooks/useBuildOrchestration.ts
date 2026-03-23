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
import { streamBuildAgent, validateReactCode, formatRetryContext, MAX_BUILD_RETRIES, type AgentIntent, type PipelineStep } from "@/lib/agentPipeline";
import { orchestrateBuild } from "@/lib/buildOrchestrator";
import { runBuildEngine, type EngineConfig, type EngineProgress } from "@/lib/buildEngine";
import { compile, type CompileOptions, type CompileCallbacks, type BuildResult } from "@/lib/compiler";
import { matchTemplate, type PageTemplate } from "@/lib/pageTemplates";
import { getSnippetsPromptContext } from "@/lib/componentSnippets";
import { DESIGN_THEMES, type AIModelId } from "@/lib/aiModels";
import { clientRouteModel } from "@/lib/costRouter";
import { supabase } from "@/integrations/supabase/client";
import { toExportPath } from "@/lib/pathNormalizer";
import { StreamingPreviewController } from "@/lib/streamingPreview";
import {
  type MsgContent,
  getTextContent,
  parseResponse,
  parseReactFiles,
  postProcessHtml,
} from "@/lib/codeParser";
import { parseMultiFileOutput } from "@/contexts/VirtualFSContext";
import { useChatAgent, type ChatAgentConfig } from "@/hooks/useChatAgent";
import { useInstantBuild, type InstantBuildConfig } from "@/hooks/useInstantBuild";
import { triggerBuild } from "@/lib/buildPipelineService";
import { executeEdit, type EditResult } from "@/lib/editEngine";
import { Workspace } from "@/lib/compiler/workspace";
import { repairMissingModules } from "@/lib/compiler/missingModuleGen";
import { fixMissingImports } from "@/lib/compiler/missingImportFixer";
import { fixExportMismatches } from "@/lib/compiler/exportMismatchFixer";
import { deduplicateFiles } from "@/lib/compiler/deduplicator";
import { normalizeGeneratedStructure } from "@/lib/compiler/structureNormalizer";
import { classifyIntentGate, parseConfirmationReply, type GuardRouteHint } from "@/lib/intentGate";
import { extractUrlFromMessage, analyzeUrl } from "@/lib/urlAnalyzer";

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
  conversationAnalyzeAsync?: (text: string, hasImages: boolean, hasExistingCode: boolean) => Promise<{ action: "gather" | "build" | "edit" | "chat" | "continue"; reason: string }>;
  conversationAddPhase?: (text: string, hasImages: boolean, imageUrls?: string[]) => any;
  conversationGetRequirements?: () => Promise<string> | string;
  conversationStartBuilding?: () => void;
  conversationStartEditing?: (instruction: string, targetFiles: string[], beforeSnapshots: Record<string, string>) => Promise<void>;
  conversationCompleteEdit?: (instruction: string, targetFiles: string[], beforeSnapshots: Record<string, string>, afterSnapshots: Record<string, string>, explanation: string) => Promise<any>;
  conversationCompleteBuild?: (result: any) => void;
  conversationGenerateAck?: (phase: any) => string;
  conversationMode?: string;
}


export function useBuildOrchestration(config: BuildOrchestrationConfig) {
  const {
    currentProject, saveProject, onVersionCreated,
    setPreviewHtml, setIsBuilding, setBuildStep, setSandpackFiles, setSandpackDeps,
    setPreviewMode, setBuildMetrics, saveSnapshot, currentPreviewHtml, currentSandpackFiles,
    setVirtualFiles, messages, setMessages, setInput, setAttachedImages, previewErrors, setPreviewErrors,
    setHealAttempts, resetHealing, inputRef,
    selectedModel, selectedTheme,
    fetchProjectContext, classifyUserIntent, fastClassifyLocal,
    conversationAnalyzeAsync, conversationAddPhase, conversationGetRequirements,
    conversationStartBuilding, conversationStartEditing, conversationCompleteEdit,
    conversationCompleteBuild, conversationGenerateAck,
    conversationMode,
  } = config;

  const [buildStreamContent, setBuildStreamContent] = useState("");
  const [buildRetryCount, setBuildRetryCount] = useState(0);
  const [currentAgent, setCurrentAgent] = useState<AgentIntent | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const [pendingBuildPrompt, setPendingBuildPrompt] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [totalPlanTasks, setTotalPlanTasks] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PageTemplate | null>(null);
  const [compilerTasks, setCompilerTasks] = useState<Array<{ id: string; label: string; status: "pending" | "in_progress" | "done" }>>([]);
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
  const deferredPreviewFilesRef = useRef<Record<string, string> | null>(null);
  const deferredPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // NOTE: lastProjectIdRef is managed by ChatPanel's project-switch effect.
  // Do NOT set it here — it would race with the restore logic.

  // Auto-clear safety timeout when isBuilding goes false
  useEffect(() => {
    if (!isLoading && buildSafetyTimeoutRef.current) {
      clearTimeout(buildSafetyTimeoutRef.current);
      buildSafetyTimeoutRef.current = null;
    }
  }, [isLoading]);

  // Cleanup deferred preview timer
  useEffect(() => {
    return () => {
      if (deferredPreviewTimerRef.current) {
        clearTimeout(deferredPreviewTimerRef.current);
        deferredPreviewTimerRef.current = null;
      }
    };
  }, []);

  // Pre-scaffolded UI component paths — previously hidden from explorer.
  // Now shown to match professional IDE standards (Lovable shows all shadcn components).
  // All UI components are always visible in the file tree.
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

      // Strip leaked file separator headers from file content
      const cleanedContent = rawContent.split("\n").filter(line => {
        const t = line.trim();
        if (/^-{3}\s+\/?.+?\.(?:jsx?|tsx?|css|js|ts)\b/i.test(t)) return false;
        if (/^-{3}\s+\/?dependencies\b/i.test(t)) return false;
        return true;
      }).join("\n");

      const normalizedPath = normalizeVirtualPath(trimmedPath);
      sanitized[normalizedPath] = cleanedContent;
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
    const importRegex = /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match: RegExpExecArray | null = null;

    while ((match = importRegex.exec(code)) !== null) {
      const specifier = match[1] || match[2];
      if (specifier) specifiers.push(specifier);
    }

    return specifiers;
  };

  const syncSandpackToVirtualFS = useCallback((sandpackFiles: Record<string, string>) => {
    const normalizedEntries = Object.entries(sandpackFiles).map(([path, content]) => [normalizeVirtualPath(path), content] as const);
    const normalizedFileLookup = new Set(normalizedEntries.map(([path]) => path));

    const referencedScaffoldedUiPaths = new Set<string>();
    const queue: string[] = [];

    const enqueueIfScaffolded = (candidatePath: string | null) => {
      if (!candidatePath || !SCAFFOLDED_UI_PATHS.has(candidatePath) || referencedScaffoldedUiPaths.has(candidatePath)) return;
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
        tsx: "typescript", ts: "typescript", jsx: "javascript", js: "javascript",
        css: "css", html: "html", json: "json",
      };
      virtualFiles[displayPath] = { path: displayPath, content, language: langMap[ext] || "text" };
    }

    setVirtualFiles(virtualFiles);
  }, [setVirtualFiles]);

  const buildMessageContent = useCallback((text: string, images: string[]): MsgContent => {
    if (images.length === 0) return text;
    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
    parts.push({ type: "text", text });
    for (const img of images) {
      parts.push({ type: "image_url", image_url: { url: img } });
    }
    return parts;
  }, []);

  const appendConversationTurn = useCallback((userText: string, images: string[], assistantText: string) => {
    const content = buildMessageContent(userText, images);
    const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
    const assistantMsg: Msg = { role: "assistant", content: assistantText, timestamp: Date.now() };

    setInput("");
    setAttachedImages([]);
    setMessages((prev) => {
      const updated = [...prev, userMsg, assistantMsg];
      saveProject({ chat_history: updated.map(m => ({ role: m.role, content: m.content })) });
      return updated;
    });
  }, [buildMessageContent, setInput, setAttachedImages, setMessages, saveProject]);

  // ─── Shared error handler ───
  const handleOnError = useCallback((err: string) => {
    setMessages((prev) => [...prev, { role: "assistant" as const, content: `⚠️ ${err}`, timestamp: Date.now() }]);
    setIsLoading(false);
    setIsBuilding(false);
    setBuildStep("");
    setPipelineStep("error");
    setCurrentAgent(null);
    isSendingRef.current = false;
  }, [setMessages, setIsBuilding, setBuildStep]);

  // ─── Sub-hooks ───
  const { sendChatMessage } = useChatAgent({
    currentProject, saveProject, setMessages, setInput, setAttachedImages,
    setBuildStep, setPipelineStep, setCurrentAgent, setPendingBuildPrompt,
    setIsLoading, messagesRef, isSendingRef, isLoadingRef, buildMessageContent,
    sandpackFilesRef, previewErrors,
  } as ChatAgentConfig);

  const { tryInstantBuild } = useInstantBuild({
    currentProject, saveProject, setSandpackFiles, setSandpackDeps, setPreviewMode,
    setIsBuilding, setBuildStep, setIsLoading, setMessages, setPipelineStep,
    setCurrentAgent, setBuildRetryCount, setBuildStreamContent,
    messagesRef, isSendingRef, selectedModel, selectedTheme,
    syncSandpackToVirtualFS, handleOnError,
  } as InstantBuildConfig);

  // [BUILD_CONFIRMED] from chat-agent triggers actual build execution.
  // This fires when the chat agent emits the marker after user confirms.
  useEffect(() => {
    if (pendingBuildPrompt && !isSendingRef.current && !isLoadingRef.current) {
      console.log("[BuildOrch] BUILD_CONFIRMED marker detected — triggering build pipeline");
      const buildPrompt = pendingBuildPrompt;
      setPendingBuildPrompt(null);

      // Assemble requirements from conversation history
      const relevantMessages = messagesRef.current.filter(m => {
        const msgText = getTextContent(m.content);
        if (m.role !== "user") return false;
        const NOISE = /^(yes|yep|yeah|go ahead|proceed|do it|ok|okay|sure|continue|start|build it|just do it|fuck off|go away)\b/i;
        return !NOISE.test(msgText.trim().toLowerCase()) && msgText.trim().length > 10;
      });

      const userRequirements = relevantMessages
        .map(m => getTextContent(m.content))
        .join("\n\n");

      const finalPrompt = userRequirements.length > 50
        ? `# APPLICATION REQUIREMENTS\n\n${userRequirements}\n\nBuild a complete, production-ready application for this domain request.`
        : buildPrompt;

      setCurrentAgent("build");
      setPipelineStep("planning");
      // Use setTimeout to avoid calling sendMessage during render
      setTimeout(() => sendMessage(finalPrompt, []), 0);
    }
  }, [pendingBuildPrompt]);

  // ─── Core build message handler ───
  const sendMessage = useCallback(async (text: string, images: string[] = []) => {
    if (!text || !currentProject) return;

    const buildProjectId = currentProject.id;
    const isStaleBuild = () => lastProjectIdRef.current !== null && lastProjectIdRef.current !== buildProjectId;

    if (isSendingRef.current || isLoadingRef.current) {
      console.warn("[BuildOrch] Blocked duplicate send while already sending");
      return;
    }
    isSendingRef.current = true;

    if (!text.startsWith("🔧 AUTO-FIX")) {
      setHealAttempts(0);
    }

    const content = buildMessageContent(text, images);
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

    // Safety timeout (resets on any build activity)
    const BUILD_TIMEOUT_MS = 600_000; // 10 minutes
    const resetBuildSafetyTimeout = () => {
      if (buildSafetyTimeoutRef.current) clearTimeout(buildSafetyTimeoutRef.current);
      buildSafetyTimeoutRef.current = setTimeout(() => {
        console.warn("[BuildOrch] Build safety timeout — forcing isBuilding=false");
        setIsBuilding(false);
        setIsLoading(false);
        setBuildStep("");
        setPipelineStep(null);
        setCurrentAgent(null);
        isSendingRef.current = false;
        setMessages((prev) => {
          const msg = "⚠️ Build timed out after 10 minutes without progress. The AI model may be under heavy load — please try again, or break the request into smaller steps.";
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

    let fullResponse = "";
    let hasSetAnalyzing = false;
    let hasSetBuilding = false;
    let streamParseCount = 0;

    const upsert = (chunk: string) => {
      if (abortController.signal.aborted) return;
      resetBuildSafetyTimeout();
      fullResponse += chunk;
      setBuildStreamContent(fullResponse);

      const reactResult = parseReactFiles(fullResponse);
      const [chatText, htmlCode] = reactResult.files ? [reactResult.chatText, null] : parseResponse(fullResponse);
      const displayChat = reactResult.files ? reactResult.chatText : chatText;

      if (!hasSetAnalyzing && fullResponse.length > 20) {
        setBuildStep("🔨 Build agent: generating components...");
        setPipelineStep("generating");
        hasSetAnalyzing = true;
      }

      if (reactResult.files) {
        if (!hasSetBuilding) {
          const fileNames = Object.keys(reactResult.files);
          const totalChars = Object.values(reactResult.files).join('').length;
          console.log(`[upsert] ✅ First React parse success: files=${fileNames.join(',')}, chars=${totalChars}`);
          setBuildStep("📦 Bundling & validating...");
          setPipelineStep("bundling");
          hasSetBuilding = true;
        }
        streamParseCount++;
        setPreviewMode("sandpack");
      } else if (htmlCode) {
        if (!hasSetBuilding) {
          setBuildStep("Building your app...");
          hasSetBuilding = true;
        }
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
      const { schemas, knowledge, irContext } = await fetchProjectContext(currentProject.id);

      // Guard: abort if project switched during async fetch
      if (isStaleBuild()) {
        console.warn("[BuildOrch] Project switched during context fetch, aborting");
        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        isSendingRef.current = false;
        return;
      }

      const isFirstMessage = messagesRef.current.filter(m => m.role === "user").length <= 1;
      const hasPersistedHistory = (currentProject.chat_history ?? []).length > 0;
      // Include current workspace when iterating on an existing build.
      // This prevents the compiler from generating a fresh app instead of extending.
      const liveSandpackFilesForContext = sandpackFilesRef.current;
      const shouldIncludeCurrentCode = !!(liveSandpackFilesForContext && Object.keys(liveSandpackFilesForContext).length > 0);

      let currentCodeSummary = "";
      const safeSandpackFiles = sandpackFilesRef.current;
      if (shouldIncludeCurrentCode && safeSandpackFiles && Object.keys(safeSandpackFiles).length > 0) {
        const fileEntries = Object.entries(safeSandpackFiles);
        const totalChars = fileEntries.reduce((sum, [, code]) => sum + code.length, 0);
        if (totalChars <= 16000) {
          currentCodeSummary = fileEntries.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
        } else {
          const ENTRY_PATTERNS = ["/App.jsx", "/App.tsx", "/App.js"];
          const keyFiles = fileEntries.filter(([p]) => ENTRY_PATTERNS.some(k => p.endsWith(k)));
          const otherFiles = fileEntries.filter(([p]) => !ENTRY_PATTERNS.some(k => p.endsWith(k)));
          const keyCode = keyFiles.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
          let remainingBudget = 14000 - keyCode.length;
          const otherCode = otherFiles.map(([path, code]) => {
            if (remainingBudget <= 0) return `--- ${path} (${code.length} chars — omitted for token budget)`;
            if (code.length <= remainingBudget) {
              remainingBudget -= code.length;
              return `--- ${path}\n${code}`;
            }
            const snippet = code.slice(0, Math.max(200, Math.floor(remainingBudget * 0.6)));
            remainingBudget = 0;
            return `--- ${path} (${code.length} chars)\n${snippet}\n...[truncated]`;
          }).join("\n\n");
          currentCodeSummary = `${keyCode}\n\n${otherCode}`;
        }
      } else if (shouldIncludeCurrentCode && currentPreviewHtml && currentPreviewHtml.length > 0) {
        currentCodeSummary = currentPreviewHtml.length < 16000
          ? currentPreviewHtml
          : currentPreviewHtml.slice(0, 12000) + `\n...[truncated — ${Math.round(currentPreviewHtml.length / 1000)}k chars total]`;
      }

      // Keep reference for template matching and other downstream logic
      const currentMessages = messagesRef.current;

      // Build agent MUST NOT see chat history.
      // It must operate only on sanitized requirements + IR + workspace summary.
      const apiMessages: any[] = [
        {
          role: "system" as const,
          content:
            "You are a deterministic build agent. You generate React code ONLY from the provided requirements, IR, and workspace summary. Do NOT use prior conversation. Do NOT treat error logs or status messages as requirements. Do NOT infer new features.",
        },
        {
          role: "user" as const,
          content,
        },
      ];

      const themeInfo = DESIGN_THEMES.find(t => t.id === selectedTheme);
      const userText = typeof text === "string" ? text : "";
      const snippetsContext = getSnippetsPromptContext(userText);
      const template = selectedTemplate || (currentMessages.length === 0 ? matchTemplate(userText) : null);
      let templateCtx = "";
      if (template) {
        templateCtx = `## MATCHED TEMPLATE: ${template.name}\n\nUse this as your structural blueprint:\n${template.blueprint}\n\nCustomize the content, colors, and details based on the user's specific request. Do NOT copy the blueprint literally — adapt it creatively.`;
        console.log(`[Template Matched] ${template.emoji} ${template.name}`);
        setSelectedTemplate(null);
      }

      // ─── Shared onDone handler ───
      const handleOnDone = async (responseText: string) => {
        if (abortController.signal.aborted) return;
        fullResponse = responseText;
        console.log(`[BuildOrch:onDone] Response length: ${fullResponse.length}`);

        const reactResult = parseReactFiles(fullResponse);
        let finalHtml: string | null = null;

        if (reactResult.files) {
          setPipelineStep("validating");
          setBuildStep("✅ Validating code...");
          const validation = validateReactCode(reactResult.files);

          if (!validation.valid && buildRetryCount < MAX_BUILD_RETRIES) {
            console.warn(`[BuildOrch:onDone] Validation failed (attempt ${buildRetryCount + 1}):`, validation.errors);
            setPipelineStep("retrying");
            setBuildStep(`🔄 Auto-fixing ${validation.errors.length} issue(s)...`);
            setBuildRetryCount(prev => prev + 1);

            setMessages((prev) => {
              const retryMsg = `⚠️ Found ${validation.errors.length} issue(s), auto-fixing...`;
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: retryMsg } : m));
              }
              return [...prev, { role: "assistant", content: retryMsg, timestamp: Date.now() }];
            });

            const retryContext = formatRetryContext(validation.errors, buildRetryCount + 1);
            let retryFullResponse = "";

            await streamBuildAgent({
              messages: apiMessages,
              projectId: currentProject.id,
              techStack: currentProject.tech_stack || "react-cdn",
              schemas,
              model: selectedModel,
              designTheme: themeInfo?.prompt,
              knowledge,
              currentCode: currentCodeSummary || undefined,
              snippetsContext: snippetsContext || undefined,
              irContext: irContext || undefined,
              retryContext,
              onDelta: (chunk) => {
                retryFullResponse += chunk;
                setBuildStreamContent(retryFullResponse);
              },
              onDone: (retryText) => {
                const retryResult = parseReactFiles(retryText);
                if (retryResult.files) {
                  setSandpackFiles(retryResult.files);
                  syncSandpackToVirtualFS(retryResult.files);
                  if (Object.keys(retryResult.deps).length > 0) setSandpackDeps(retryResult.deps);
                  setPreviewMode("sandpack");

                  const retryChatText = retryResult.chatText || "✅ Fixed and rebuilt successfully";
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: retryChatText } : m));
                    }
                    return prev;
                  });
                }

                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                setBuildRetryCount(0);
                isSendingRef.current = false;
                setTimeout(() => setBuildStreamContent(""), 3000);

                const persistMessages = messagesRef.current.map(m => ({
                  role: m.role,
                  content: typeof m.content === "string" ? m.content : getTextContent(m.content),
                }));
                saveProject({ chat_history: persistMessages });
              },
              onError: (err) => {
                console.error("[BuildOrch:retry] Retry failed:", err);
                setSandpackFiles(reactResult.files!);
                syncSandpackToVirtualFS(reactResult.files!);
                if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);
                setPreviewMode("sandpack");
                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                setBuildRetryCount(0);
                isSendingRef.current = false;
              },
            });
            return;
          }

          if (!validation.valid) {
            console.warn("[BuildOrch:onDone] Validation warnings (max retries reached):", validation.errors);
          }

          const fileNames = Object.keys(reactResult.files);
          console.log(`[BuildOrch:onDone] ✅ React files:`, fileNames);
          setSandpackFiles(reactResult.files);
          syncSandpackToVirtualFS(reactResult.files);
          if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);
          setPreviewMode("sandpack");
          setBuildRetryCount(0);
        } else {
          console.log("[BuildOrch:onDone] No React files — falling back to HTML");
          const { files: parsedFiles, html: htmlCode, chatText } = parseMultiFileOutput(fullResponse);

          if (Object.keys(parsedFiles).length > 0) setVirtualFiles(parsedFiles);
          if (htmlCode) setPreviewHtml(postProcessHtml(htmlCode));
          finalHtml = htmlCode;

          if (!htmlCode && buildRetryCount < MAX_BUILD_RETRIES) {
            console.warn("[BuildOrch:onDone] No code in response — auto-retrying with code generation instruction");
            setBuildStep("🔄 Re-generating with code output...");
            setBuildRetryCount(prev => prev + 1);

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: "⏳ Generating code... (retry)" } : m));
              }
              return prev;
            });

            const retryMessages = [
              ...apiMessages,
              { role: "assistant" as const, content: fullResponse },
              { role: "user" as const, content: "Your previous response did not contain any code. You MUST output complete working React code inside ```react-preview fences with --- /App.jsx file markers. Generate the full application code NOW. Do not describe what you plan to build — just output the code." },
            ];

            let retryFullResponse = "";
            await streamBuildAgent({
              messages: retryMessages,
              projectId: currentProject.id,
              techStack: currentProject.tech_stack || "react-cdn",
              schemas,
              model: selectedModel,
              designTheme: themeInfo?.prompt,
              knowledge,
              currentCode: currentCodeSummary || undefined,
              snippetsContext: snippetsContext || undefined,
              irContext: irContext || undefined,
              onDelta: (chunk) => {
                retryFullResponse += chunk;
                setBuildStreamContent(retryFullResponse);
              },
              onDone: (retryText) => {
                const retryResult = parseReactFiles(retryText);
                if (retryResult.files) {
                  setSandpackFiles(retryResult.files);
                  syncSandpackToVirtualFS(retryResult.files);
                  if (Object.keys(retryResult.deps).length > 0) setSandpackDeps(retryResult.deps);
                  setPreviewMode("sandpack");

                  const retryChatText = retryResult.chatText || "✅ Code generated successfully";
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: retryChatText } : m));
                    }
                    return prev;
                  });
                } else {
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    const msg = "⚠️ The AI returned a planning response instead of code. Please try a more specific request like: \"Build the Dashboard and Student Management modules with sidebar navigation\"";
                    if (last?.role === "assistant") {
                      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
                    }
                    return [...prev, { role: "assistant" as const, content: msg, timestamp: Date.now() }];
                  });
                }

                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                setBuildRetryCount(0);
                isSendingRef.current = false;
                setTimeout(() => setBuildStreamContent(""), 3000);

                const persistMessages = messagesRef.current.map(m => ({
                  role: m.role,
                  content: typeof m.content === "string" ? m.content : getTextContent(m.content),
                }));
                saveProject({ chat_history: persistMessages });
              },
              onError: (err) => {
                console.error("[BuildOrch:code-retry] Retry failed:", err);
                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                setBuildRetryCount(0);
                isSendingRef.current = false;
              },
            });
            return;
          }

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
                }
              }
            } catch (e) {
              console.warn("[Phase 3] Review pass skipped:", e);
            }
          }
        }

        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        setPipelineStep("complete");
        setCurrentAgent(null);
        isSendingRef.current = false;
        setTimeout(() => setBuildStreamContent(""), 3000);

        const processedHtml = finalHtml ? postProcessHtml(finalHtml) : null;

        if (processedHtml && currentProject?.id) {
          supabase
            .from("project_environments" as any)
            .update({ html_snapshot: processedHtml, status: "active", updated_at: new Date().toISOString() } as any)
            .eq("project_id", currentProject.id)
            .eq("name", "development")
            .then(() => {});
        }

        if (processedHtml && onVersionCreated) {
          onVersionCreated({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            label: getTextContent(userMsg.content).slice(0, 60) || "Build update",
            html: processedHtml,
            messageIndex: currentMessages.length,
          });
        }

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
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
              body: JSON.stringify({ prompt: userPromptText }),
            })
              .then(r => r.json())
              .then(({ name, emoji }) => {
                const fullName = emoji ? `${emoji} ${name}` : name;
                supabase.from("projects").update({ name: fullName, updated_at: new Date().toISOString() } as any).eq("id", currentProject.id).then(() => saveProject({ name: fullName } as any));
              })
              .catch(() => {});
          }

          saveProject({ chat_history: persistMessages, html_content: finalHtml || currentProject.html_content || "" });

          if (reactResult.files && Object.keys(reactResult.files).length > 0) {
            const payload = { files: reactResult.files, deps: reactResult.deps || {} };
            supabase
              .from("project_data")
              .upsert(
                { project_id: currentProject.id, collection: "sandpack_state", data: payload as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => {
                if (error) console.warn("[BuildOrch] Failed to persist sandpack state:", error);
              });
          }

          return final;
        });
      };

      // ─── CORE: Build engine for code generation ───
      setCurrentAgent("build");
      setPipelineStep("planning");

      // buildProjectId already captured at top of sendMessage
      const liveSandpackFiles = sandpackFilesRef.current;
      const isFirstBuild = !liveSandpackFiles || Object.keys(liveSandpackFiles).length === 0;

      // ── ITERATIVE BUILD GUARD ──
      // If workspace already has files, this is an iteration, not a fresh build.
      // Route to edit pipeline instead of regenerating from scratch.
      if (!isFirstBuild && !text.startsWith("🔧 AUTO-FIX") && !text.includes("# APPLICATION REQUIREMENTS")) {
        console.log(`[BuildOrch] Workspace has ${Object.keys(liveSandpackFiles!).length} files — routing to edit pipeline instead of rebuild`);
        setCurrentAgent("edit");
        setPipelineStep("resolving");
        // Release the sending lock so sendEditMessage can acquire it
        isSendingRef.current = false;
        setIsLoading(false);
        setIsBuilding(false);
        await sendEditMessage(text, images);
        return;
      }

      // ─── INSTANT PATH (delegated to useInstantBuild) ───
      const isSimpleBuild = isFirstBuild && !!template;

      if (isSimpleBuild || isFirstBuild) {
        const handled = await tryInstantBuild(
          template, userText, schemas, irContext, templateCtx, buildProjectId, upsert,
        );
        if (handled) return;
      }

      // ─── IR-to-Domain model ───
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

      // Priority 2: Keyword matching + Requirements Agent
      if (!domainModel && isFirstBuild) {
        try {
          setBuildStep("🧠 Analyzing domain requirements...");
          const { matchDomainTemplate, serializeDomainModel } = await import("@/lib/domainTemplates");
          const templateMatch = matchDomainTemplate(userText);

          if (templateMatch.template) {
            console.log(`[BuildOrch] Domain template matched: ${templateMatch.template.name} (confidence: ${templateMatch.confidence}, keywords: ${templateMatch.matchedKeywords.join(", ")})`);

            const reqResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/requirements-agent`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                prompt: userText,
                matchedTemplate: templateMatch.template.model,
                existingSchemas: schemas,
              }),
            });

            if (reqResp.ok) {
              domainModel = await reqResp.json();
              console.log(`[BuildOrch] ✅ Domain model extracted: ${domainModel.entities?.length || 0} entities, auth: ${domainModel.requiresAuth}`);
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

      // Guard against project switch
      if (isStaleBuild()) {
        console.warn("[BuildOrch] Project switched during build setup, aborting");
        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        isSendingRef.current = false;
        return;
      }

      const safeExistingFiles = shouldIncludeCurrentCode && liveSandpackFiles && Object.keys(liveSandpackFiles).length > 0
        ? liveSandpackFiles
        : undefined;

      // FIX: CostRouter must score the FULL prompt context, not just the short "build it" trigger text
      const fileCount = safeExistingFiles ? Object.keys(safeExistingFiles).length : 0;
      // Use the full text that will be sent to the build agent (includes accumulated requirements)
      const fullPromptForScoring = currentCodeSummary 
        ? `${userText}\n\n${currentCodeSummary}` 
        : userText;
      // Don't pass user model override for complex builds — let CostRouter decide
      const isComplexBuild = fullPromptForScoring.length > 2000 || /Phase \d+/gi.test(userText) || userText.length > 500;
      const modelOverride = isComplexBuild ? undefined : (selectedModel !== "google/gemini-2.5-pro" ? selectedModel : undefined);
      const routedModel = clientRouteModel(fullPromptForScoring, "build", fileCount, modelOverride);
      if (isComplexBuild) {
        console.log(`[BuildOrch] Complex build detected (${userText.length} chars) — CostRouter will select model (no user override)`);
      }

      const engineConfig: EngineConfig = {
        projectId: buildProjectId,
        techStack: currentProject.tech_stack || "react-cdn",
        schemas: schemas.length > 0 ? schemas : undefined,
        model: routedModel,
        designTheme: themeInfo?.prompt,
        knowledge: knowledge.length > 0 ? knowledge : undefined,
        snippetsContext: snippetsContext || undefined,
        existingFiles: safeExistingFiles,
        templateContext: templateCtx || undefined,
        chatHistory: currentMessages.map(m => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : getTextContent(m.content),
        })),
        domainModel,
      };

      saveSnapshot(`Pre-build: ${userText.slice(0, 50)}`);

      // NOTE: Streaming preview disabled — partial file updates cause Sandpack
      // to rebundle every 500ms, which causes severe flickering and crashes.
      // Files are now only sent to Sandpack on task completion (onFilesReady).

      // ─── IR ORCHESTRATOR: seed deterministic scaffolds ────────────
      let irScaffoldFiles: Record<string, string> = {};
      if (isFirstBuild) {
        try {
          setBuildStep("🧠 Planning IR scaffolds...");
          const callLLM = async (opts: { system: string; user: string }) => {
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                messages: [
                  { role: "system", content: opts.system },
                  { role: "user", content: opts.user },
                ],
              }),
            });
            if (!resp.ok) throw new Error(`LLM call failed: ${resp.status}`);
            const data = await resp.json();
            return data.choices?.[0]?.message?.content || await resp.text();
          };

          irScaffoldFiles = await orchestrateBuild({
            rawRequirements: userText,
            callLLM,
          });

          // Persist IR to project for future edits
          if (irScaffoldFiles["/App.jsx"]) {
            console.log(`[BuildOrch] ✅ IR scaffold generated: ${Object.keys(irScaffoldFiles).length} files`);
          }
        } catch (err) {
          console.warn("[BuildOrch] IR orchestrator failed, proceeding without scaffolds:", err);
          irScaffoldFiles = {};
        }
      }

      // Merge IR scaffolds into existing workspace so compiler has a complete seed
      const seededWorkspace = { ...irScaffoldFiles, ...(safeExistingFiles || {}) };

      // ─── COMPILER V1.0 PATH ───────────────────────────────────────
      const compileOptions: CompileOptions = {
        rawRequirements: userText,
        existingWorkspace: seededWorkspace,
        projectId: buildProjectId,
        techStack: currentProject.tech_stack || "react-cdn",
        schemas: schemas.length > 0 ? schemas : undefined,
        knowledge: knowledge.length > 0 ? knowledge : undefined,
        designTheme: themeInfo?.prompt,
        model: routedModel,
      };

      // Reset compiler tasks at start
      setCompilerTasks([{ id: "planning", label: "Planning task graph", status: "in_progress" }]);

      const compileCallbacks: CompileCallbacks = {
        onPhase: (phase, detail) => {
          resetBuildSafetyTimeout();
          setBuildStep(detail);
          if (phase === "planning") setPipelineStep("planning");
          else if (phase === "executing") setPipelineStep("generating");
          else if (phase === "verifying") setPipelineStep("validating");
          else if (phase === "repairing") setPipelineStep("retrying");
          else if (phase === "complete") setPipelineStep("complete");
        },
        onPlanReady: (tasks) => {
          // Store all task labels upfront so pipeline card shows real names
          planLabelsRef.current = tasks.map(t => t.label);
          setCompilerTasks(tasks.map((t, i) => ({
            id: `task-${i}`,
            label: t.label,
            status: "pending" as const,
          })));
        },
        onTaskStart: (task, index, total) => {
          resetBuildSafetyTimeout();
          setCurrentTaskIndex(index);
          setTotalPlanTasks(total);
          setBuildStep(`🔨 Task ${index + 1}/${total}: ${task.label}`);

          // Update task status in pipeline card
          setCompilerTasks(prev => prev.map((t, i) => ({
            ...t,
            label: i === index ? task.label : t.label,
            status: (i < index ? "done" : i === index ? "in_progress" : t.status) as "done" | "in_progress" | "pending",
          })));

          // Build progress message with real labels
          const labels = planLabelsRef.current;
          const progressMsg = `📋 **Building** (${total} tasks)\n\n${Array.from({ length: total }, (_, i) => {
            const status = i < index ? "✅" : i === index ? "🔨" : "⏳";
            const label = labels[i] || task.label;
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
          resetBuildSafetyTimeout();
          setBuildStreamContent(prev => prev + chunk);
        },
        onTaskDone: (task, files) => {
          resetBuildSafetyTimeout();
          if (lastProjectIdRef.current !== null && lastProjectIdRef.current !== buildProjectId) {
            console.warn(`[Compiler] ⛔ Blocked cross-project file injection`);
            return;
          }
          // Mark task done in pipeline card
          setCompilerTasks(prev => prev.map(t => t.label === task.label ? { ...t, status: "done" as const } : t));

          // Update preview with accumulated files on each task completion
          // Keep preview stable during task execution; only apply to preview on onComplete.
          // This prevents transient task-level compile states from flashing runtime errors.
          if (Object.keys(files).length > 0) {
            const currentFiles = sandpackFilesRef.current || {};
            const mergedFiles = sanitizeWorkspaceForPreview({ ...currentFiles, ...files });
            sandpackFilesRef.current = mergedFiles;
            deferredPreviewFilesRef.current = mergedFiles;
            syncSandpackToVirtualFS(mergedFiles);
            console.log(`[Compiler] Buffered task output (${Object.keys(mergedFiles).length} files) — preview will update on build completion`);

            // ─── Incremental persistence: save after each task so interrupted builds are recoverable ───
            if (currentProject?.id) {
              const incrementalPayload = { files: mergedFiles, deps: {}, partial: true };
              supabase
                .from("project_data")
                .upsert(
                  { project_id: currentProject.id, collection: "sandpack_state", data: incrementalPayload as any },
                  { onConflict: "project_id,collection" }
                )
                .then(({ error }) => {
                  if (error) console.warn("[Compiler] Incremental persist failed:", error);
                  else console.log(`[Compiler] 💾 Incremental save: ${Object.keys(mergedFiles).length} files`);
                });
            }
          }
        },
        onTaskError: (task, error) => {
          console.error(`[Compiler] Task '${task.label}' failed:`, error);
          setCompilerTasks(prev => prev.map(t => t.label === task.label ? { ...t, status: "done" as const, label: `❌ ${task.label}` } : t));
        },
        onVerification: (result) => {
          resetBuildSafetyTimeout();
          if (result.ok) {
            setBuildStep("✅ All checks passed");
          } else {
            const errorCount = result.issues.filter(i => i.severity === "error").length;
            setBuildStep(`⚠️ ${errorCount} issues found, repairing...`);
          }
        },
        onRepairStart: (round, actionCount) => {
          resetBuildSafetyTimeout();
          setBuildStep(`🔧 Auto-repair round ${round}: fixing ${actionCount} issues...`);
        },
        onComplete: (result: BuildResult) => {
          // Store verification result for conversation state
          lastVerificationOkRef.current = result.verification.ok;

          // Set final files (sanitized) once build is complete
          if (deferredPreviewTimerRef.current) {
            clearTimeout(deferredPreviewTimerRef.current);
            deferredPreviewTimerRef.current = null;
          }

          const finalWorkspace = sanitizeWorkspaceForPreview(result.workspace);
          setSandpackFiles(finalWorkspace);
          syncSandpackToVirtualFS(finalWorkspace);
          setPreviewMode("sandpack");

          // Build completion message — evidence-backed, no false claims
          const statusEmoji = result.status === "success" ? "✅" : result.status === "partial" ? "⚠️" : "❌";
          const staticLine = result.verification.ok ? "Static checks passed." : `${result.verification.issues.filter(i => i.severity === "error").length} static issues found.`;
          const runtimeLine = result.runtime?.runtimeStatus === "passed"
            ? "Runtime smoke checks passed."
            : result.runtime?.runtimeStatus === "failed"
            ? "Runtime checks found issues."
            : "Runtime checks not run yet.";
          
          const msg = `${statusEmoji} ${result.summary}\n\n**Verification:** ${staticLine}\n**Runtime:** ${runtimeLine}${result.knownIssues.length > 0 ? `\n\n**Known issues:**\n${result.knownIssues.map(i => `- ${i}`).join("\n")}` : ""}${result.nextActions.length > 0 ? `\n\n**Next steps:**\n${result.nextActions.map(a => `- ${a}`).join("\n")}` : ""}`;

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
          setTimeout(() => setBuildStreamContent(""), 3000);

          // Persist
          const persistMessages = messagesRef.current.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : getTextContent(m.content),
          }));
          saveProject({ chat_history: persistMessages, html_content: currentProject.html_content || "" });

          if (Object.keys(finalWorkspace).length > 0) {
            const payload = { files: finalWorkspace, deps: {} };
            supabase
              .from("project_data")
              .upsert(
                { project_id: currentProject.id, collection: "sandpack_state", data: payload as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => {
                if (error) console.warn("[Compiler] Failed to persist sandpack state:", error);
                else console.log("[Compiler] ✅ Sandpack state persisted");
              });

            triggerBuild(
              currentProject.id,
              finalWorkspace,
              {},
              { model: selectedModel, theme: selectedTheme }
            ).then((buildResult) => {
              console.log(`[Compiler] ✅ Server build ${buildResult.build_id}: ${buildResult.status}`);
            }).catch((err) => {
              console.warn("[Compiler] Server-side build failed (non-blocking):", err);
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
        handleOnError(err.message || "Compiler error");
      }
    } catch (e) {
      console.error("[BuildOrch] sendMessage error:", e);
      setIsLoading(false);
      setIsBuilding(false);
      setBuildStep("");
      isSendingRef.current = false;
    }
  }, [currentProject, saveProject, setPreviewHtml, setIsBuilding, setBuildStep, selectedModel, selectedTheme, onVersionCreated, setVirtualFiles, fetchProjectContext, syncSandpackToVirtualFS, sanitizeWorkspaceForPreview, buildMessageContent, currentPreviewHtml, setMessages, setInput, setAttachedImages, setPreviewErrors, setHealAttempts, setSandpackFiles, setSandpackDeps, setPreviewMode, setBuildMetrics, saveSnapshot, selectedTemplate, tryInstantBuild, handleOnError]);

  // ── Edit Mode: Surgical file editing (wired through FSM) ──────────────────
  const sendEditMessage = useCallback(async (text: string, images: string[] = []) => {
    if (!currentProject) return;

    const genericRuntimeFix = /\b(fix|resolve|repair)\b/i.test(text)
      && /\b(error|preview|runtime|crash|broken|issue|same error|something went wrong)\b/i.test(text)
      && !/\/[\w/.-]+\.(?:jsx?|tsx?|css)/i.test(text);
    const diagnostics = previewErrors.slice(-5).join("\n");
    const enrichedInstruction = genericRuntimeFix && diagnostics
      ? `${text}\n\nCurrent preview errors:\n${diagnostics}`
      : text;

    const workspace = sandpackFilesRef.current;
    if (!workspace || Object.keys(workspace).length === 0) {
      // No existing code to edit — fall back to build
      console.log("[EditMode] No workspace files, falling back to build");
      setCurrentAgent("build");
      setPipelineStep("planning");
      sendMessage(enrichedInstruction, images);
      return;
    }

    // Show user message
    const content = buildMessageContent(text, images);
    const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
    setInput("");
    setAttachedImages([]);
    setMessages((prev) => [...prev, userMsg]);

    setIsLoading(true);
    setIsBuilding(true);
    isSendingRef.current = true;
    setBuildStreamContent("");

    // Capture before-snapshots for audit
    let resolvedTargetFiles: string[] = [];
    const beforeSnapshots: Record<string, string> = {};

    try {
      await executeEdit(
        {
          instruction: enrichedInstruction,
          workspace,
          projectId: currentProject.id,
          model: selectedModel,
          designTheme: selectedTheme,
          knowledge: [],
          images,
        },
        {
          onResolving: (targetFiles) => {
            resolvedTargetFiles = targetFiles;
            // Capture before-snapshots
            for (const f of targetFiles) {
              if (workspace[f]) beforeSnapshots[f] = workspace[f];
            }
            setPipelineStep("resolving");
            setBuildStep(`Editing ${targetFiles.length} file${targetFiles.length > 1 ? "s" : ""}`);
            console.log("[EditMode] Target files:", targetFiles);

            // FSM transition: → editing (fire & forget)
            conversationStartEditing?.(enrichedInstruction, targetFiles, beforeSnapshots);
          },
          onStreaming: (chunk) => {
            setBuildStreamContent((prev) => prev + chunk);
            setPipelineStep("editing");
          },
          onComplete: async (result: EditResult) => {
            console.log("[EditMode] Complete:", Object.keys(result.modifiedFiles));
            if (Object.keys(result.dependencies).length > 0) {
              console.log("[EditMode] Dependencies:", result.dependencies);
            }

            // Merge modified files into existing workspace
            const updatedFiles = { ...workspace };
            for (const [path, code] of Object.entries(result.modifiedFiles)) {
              updatedFiles[path] = code;
            }

            // ── Post-edit deterministic repair passes ──────────────────
            // Run the same repair pipeline as the full compiler to catch
            // broken imports / missing modules introduced by the edit.
            try {
              const repairWorkspace = new Workspace(updatedFiles);
              // ── Post-edit repair pipeline (re-enabled) ──
              repairMissingModules(repairWorkspace);
              fixMissingImports(repairWorkspace);
              fixExportMismatches(repairWorkspace);
              normalizeGeneratedStructure(repairWorkspace);
              deduplicateFiles(repairWorkspace);
              // Extract repaired files back
              const repairedFiles: Record<string, string> = {};
              for (const f of repairWorkspace.listFiles()) {
                repairedFiles[f] = repairWorkspace.getFile(f)!;
              }
              Object.assign(updatedFiles, repairedFiles);
            } catch (repairErr) {
              console.warn("[EditMode] Post-edit repair failed (non-blocking):", repairErr);
            }

            // Capture after-snapshots for audit
            const afterSnapshots: Record<string, string> = {};
            for (const f of resolvedTargetFiles) {
              if (updatedFiles[f]) afterSnapshots[f] = updatedFiles[f];
            }

            // Update Sandpack files
            setSandpackFiles(updatedFiles);
            syncSandpackToVirtualFS(updatedFiles);
            // Merge any returned dependencies into Sandpack
            if (Object.keys(result.dependencies).length > 0) {
              setSandpackDeps((prev: Record<string, string>) => ({ ...prev, ...result.dependencies }));
            }
            setPreviewMode("sandpack");

            // FSM transition: editing → complete + audit record + post-edit readiness
            const postEditReadiness = await conversationCompleteEdit?.(
              enrichedInstruction, resolvedTargetFiles, beforeSnapshots, afterSnapshots, result.explanation
            );

            // Build assistant message with readiness info
            const fileList = result.targetFiles.map(f => f.split("/").pop()).join(", ");
            let editMsg = `✅ **Edited ${result.targetFiles.length} file${result.targetFiles.length > 1 ? "s" : ""}** (${fileList})\n\n${result.explanation}`;
            if (postEditReadiness && !postEditReadiness.isReady) {
              editMsg += `\n\n⚠️ **Post-edit readiness:** ${postEditReadiness.score}% — ${postEditReadiness.recommendation}`;
            }

            const assistantMsg: Msg = { role: "assistant", content: editMsg, timestamp: Date.now() };
            setMessages((prev) => [...prev, assistantMsg]);

            // Save
            const updatedMessages = [...messagesRef.current, userMsg, assistantMsg];
            saveProject({
              chat_history: updatedMessages.map(m => ({ role: m.role, content: m.content })),
            });

            // Persist sandpack state
            supabase
              .from("project_data")
              .upsert(
                { project_id: currentProject.id, collection: "sandpack_state", data: { files: updatedFiles, deps: {} } as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => {
                if (error) console.warn("[EditMode] Failed to persist sandpack state:", error);
              });

            // Save snapshot
            saveSnapshot(`Edit: ${text.slice(0, 40)}`);

            setPipelineStep("complete");
            setIsLoading(false);
            setIsBuilding(false);
            setBuildStep("");
            isSendingRef.current = false;
          },
          onError: (error) => {
            console.error("[EditMode] Error:", error);
            const assistantMsg: Msg = {
              role: "assistant",
              content: `⚠️ Edit failed: ${error}\n\nTry being more specific about which page or component to modify.`,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setPipelineStep("error");
            setIsLoading(false);
            setIsBuilding(false);
            setBuildStep("");
            isSendingRef.current = false;
          },
        }
      );
    } catch (err: any) {
      console.error("[EditMode] Unexpected error:", err);
      setIsLoading(false);
      setIsBuilding(false);
      setBuildStep("");
      isSendingRef.current = false;
    }
  }, [currentProject, selectedModel, selectedTheme, previewErrors, sendMessage, buildMessageContent, setInput, setAttachedImages, setMessages, saveProject, setSandpackFiles, syncSandpackToVirtualFS, setPreviewMode, setIsBuilding, setBuildStep, saveSnapshot, conversationStartEditing, conversationCompleteEdit]);

  // ── RULES ──
  // 1. ALL messages go through conversation state machine FIRST
  // 2. Client NEVER builds unless server FSM mode permits it
  // 3. No legacy client heuristics (no regex build triggers, no task-list generators)
  // 4. Images are passed to server for vision extraction
  const handleSmartSend = useCallback(async (text: string, images: string[] = []) => {
    if (!text && images.length === 0) return;
    if (isSendingRef.current || isLoadingRef.current) return;

    const smartSendProjectId = currentProject?.id;
    const isSmartSendStale = () => !smartSendProjectId || (lastProjectIdRef.current !== null && lastProjectIdRef.current !== smartSendProjectId);

    const hasImages = images.length > 0;
    const finalText = text || (hasImages ? "" : "");
    if (!finalText && !hasImages) return;

    const hasExistingCode = !!(sandpackFilesRef.current && Object.keys(sandpackFilesRef.current).length > 0);

    const buildRequirementsPayload = async (triggerText: string) => {
      // Priority 1: Server-compiled requirements from conversation-engine FSM
      const requirements = await Promise.resolve(conversationGetRequirements?.() || "");
      let assembledRequirements = requirements;

      // Priority 2: Fall back to chat history mining if FSM requirements are empty
      if (!assembledRequirements || assembledRequirements.length <= 50) {
        const ERROR_NOISE = /\b(element type is invalid|unclosed block|unclosed bracket|is not a function|is not defined|something went wrong|syntax error|check the render|you likely forgot|mixed up default|module not found|cannot find module|auto-fix|auto fix|✅ Fixed|⚠️ Found|⚠️ Build)\b/i;
        const FRUSTRATION_NOISE = /^(stupid|idiot|bloody|damn|hell|wtf|omg|ugh|why|\?{2,}|\.{3,}|!{2,})$/i;
        const STATUS_MSG = /^(✅|⚠️|🔧|🔄|Building|Processing|Thinking|Generating)/;

        const relevantMessages = messagesRef.current.filter(m => {
          const msgText = getTextContent(m.content);
          if (ERROR_NOISE.test(msgText)) return false;
          if (FRUSTRATION_NOISE.test(msgText.trim())) return false;
          if (m.role === "assistant" && STATUS_MSG.test(msgText.trim())) return false;
          if (m.role === "user") return true;
          if (m.role === "assistant" && msgText.length > 50) return true;
          return false;
        });

        const chatContext = relevantMessages
          .map(m => `**${m.role === "user" ? "User" : "Assistant"}:**\n${getTextContent(m.content)}`)
          .join("\n\n");

        if (chatContext.length > 100) {
          assembledRequirements = `# APPLICATION REQUIREMENTS (from conversation)\n\n${chatContext}\n\n--- END REQUIREMENTS ---\nBuild the COMPLETE application incorporating ALL above requirements.`;
        }
      }

      if (assembledRequirements && assembledRequirements.length > 50) {
        return `${assembledRequirements}\n\n## BUILD TRIGGER\n${triggerText}`;
      }

      // Final fallback: promote concise domain request into build-safe requirements
      const normalizedTrigger = triggerText.trim();
      if (!normalizedTrigger) return triggerText;

      return [
        "# APPLICATION REQUIREMENTS",
        "",
        normalizedTrigger,
        "",
        "Build a complete, production-ready application for this domain request with sensible defaults.",
        "Include core modules, sidebar navigation, realistic entities, and end-to-end CRUD workflows.",
      ].join("\n");
    };

    // ── Mandatory confirmation flow for generation/refactor/fix/high-impact requests ──
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
        // Not a yes/no — cancel the pending request and process as a fresh message
        setPendingExecution(null);
        // Fall through to normal classification below
      } else {
        // reply === "confirm"
        if (pendingExecution.needsHighImpactConfirm && !pendingExecution.awaitingHighImpactConfirm) {
          setPendingExecution({ ...pendingExecution, awaitingHighImpactConfirm: true });
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
        if (isSmartSendStale()) {
          console.warn("[SmartSend] Project switched during confirmation build assembly, aborting");
          return;
        }

        setCurrentAgent("build");
        setPipelineStep("planning");
        sendMessage(approvedBuildPrompt, approved.images);
        return;
      }
    }

    const isAutoFix = finalText.startsWith("🔧");

    // ── Step 0: Auto-fix bypass (self-healing, not user intent) ──
    if (isAutoFix) {
      setCurrentAgent("build");
      setPipelineStep("planning");
      sendMessage(finalText, images);
      return;
    }

    // ── Step 0.5: URL Analysis — detect URLs and run UFM+/WPA+/BSAG pipeline ──
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
          // Store the build prompt for when user confirms
          setPendingExecution({
            prompt: result.buildPrompt,
            images: [],
            routeHint: "build" as GuardRouteHint,
            needsHighImpactConfirm: false,
            awaitingHighImpactConfirm: false,
          });

          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: result.confirmationMessage, timestamp: Date.now() },
          ]);

          const persistMessages = messagesRef.current.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : getTextContent(m.content),
          }));
          saveProject({ chat_history: persistMessages });
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: result.error || "I couldn't analyze that URL. Please try a different one or describe what you want to build.", timestamp: Date.now() },
          ]);
        }
      } catch (err: any) {
        setIsLoading(false);
        setBuildStep("");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ Failed to analyze URL: ${err.message || "Unknown error"}`, timestamp: Date.now() },
        ]);
      }

      setPipelineStep(null);
      setCurrentAgent(null);
      isSendingRef.current = false;
      return;
    }

    const guardedIntent = classifyIntentGate(finalText, hasExistingCode);

    // Ambiguous messages (no action verb) → route to chat naturally, don't block
    if (guardedIntent.isAmbiguous) {
      setCurrentAgent("chat");
      setPipelineStep("chatting");
      sendChatMessage(finalText, images);
      return;
    }

    if (guardedIntent.routeHint === "chat") {
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

    // ── Step 1: Route through async server conversation analyzer ──
    const normalizedText = finalText.toLowerCase();
    const explicitRebuildRequest = /\b(rebuild|from scratch|start over|regenerate app|new app|new project)\b/i.test(normalizedText);
    const isQuestionOnly = finalText.trim().endsWith("?") || /^(why|what|where|who|how)\b/i.test(finalText.trim());
    const explicitEditVerb = /\b(fix|change|update|modify|refactor|patch|repair|replace|add|remove|delete)\b/i.test(normalizedText);
    const hasRuntimeSignal = /\b(bug|error|not working|doesn't work|doesnt work|broken|crash|failed|fails|preview|runtime|problem|issue)\b/i.test(normalizedText);
    const stopOrExplainOnly = /\b(do not build|don't build|dont build|do not edit|don't edit|dont edit|just explain|only explain|root cause only|without fixing)\b/i.test(normalizedText);

    if (stopOrExplainOnly || (isQuestionOnly && !explicitEditVerb)) {
      setCurrentAgent("chat");
      setPipelineStep("chatting");
      sendChatMessage(finalText, images);
      return;
    }

    const looksLikeRuntimeFixRequest = hasExistingCode && !hasImages && explicitEditVerb && hasRuntimeSignal && !isQuestionOnly;

    if (looksLikeRuntimeFixRequest && !explicitRebuildRequest) {
      console.log("[SmartSend] Runtime fix request → edit pipeline");
      setCurrentAgent("edit");
      setPipelineStep("resolving");
      sendEditMessage(finalText, images);
      return;
    }

    let convResult: { action: string; reason: string } | null = null;

    if (conversationAnalyzeAsync) {
      try {
        convResult = await conversationAnalyzeAsync(finalText, hasImages, hasExistingCode);
        if (isSmartSendStale()) {
          console.warn("[SmartSend] Project switched during analysis, aborting");
          return;
        }
        console.log(`[SmartSend] Server analysis: mode=${conversationMode}, action=${convResult.action}, reason=${convResult.reason}`);
      } catch (err) {
        console.warn("[SmartSend] Server analysis failed, falling back to local classifier:", err);
      }
    }

    // If server returned a definitive action, route it
    if (convResult && convResult.action !== "continue") {
      // ── GATHER: User is providing requirements ──
      if (convResult.action === "gather") {
        const phase = conversationAddPhase?.(finalText, hasImages, images);
        const ackText = conversationGenerateAck?.(phase) || "✅ Got it! Send the next phase when ready, or say **\"build it\"** to start.";

        const content = buildMessageContent(finalText, images);
        const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
        setInput("");
        setAttachedImages([]);
        setMessages((prev) => [...prev, userMsg]);

        const assistantMsg: Msg = { role: "assistant", content: ackText, timestamp: Date.now() };
        setMessages((prev) => [...prev, assistantMsg]);

        const updatedMessages = [...messagesRef.current, userMsg, assistantMsg];
        saveProject({ chat_history: updatedMessages.map(m => ({ role: m.role, content: m.content })) });
        return;
      }

      // ── EDIT: Route through FSM-wired edit pipeline ──
      if (convResult.action === "edit") {
        const hasExplicitEditVerb = /\b(fix|change|update|modify|refactor|patch|repair|replace|add|remove|delete)\b/i.test(finalText);
        const isQuestionOnlyEdit = finalText.trim().endsWith("?") || /^(why|what|where|who|how)\b/i.test(finalText.trim());
        if (isQuestionOnlyEdit && !hasExplicitEditVerb) {
          setCurrentAgent("chat");
          setPipelineStep("chatting");
          sendChatMessage(finalText, images);
          return;
        }
        setCurrentAgent("edit");
        setPipelineStep("resolving");
        sendEditMessage(finalText, images);
        return;
      }

      // ── BUILD: Include accumulated requirements if any phases exist ──
      if (convResult.action === "build") {
        console.log(`[SmartSend] Build requested, mode=${conversationMode}`);

        // CRITICAL FIX: If workspace already has files, this is an iterative change
        // (e.g. "change color to gold"), NOT a fresh build. Route to edit pipeline.
        if (hasExistingCode && !explicitRebuildRequest) {
          console.log("[SmartSend] Workspace has existing code — routing 'build' to edit pipeline instead of full rebuild");
          setCurrentAgent("edit");
          setPipelineStep("resolving");
          sendEditMessage(finalText, images);
          return;
        }

        conversationStartBuilding?.();
        const buildPrompt = await buildRequirementsPayload(finalText);

        if (isSmartSendStale()) {
          console.warn("[SmartSend] Project switched during requirements fetch, aborting");
          return;
        }

        console.log(`[SmartSend] Build prompt length: ${buildPrompt.length} chars`);
        setCurrentAgent("build");
        setPipelineStep("planning");
        sendMessage(buildPrompt, images);
        return;
      }

      // ── CHAT: Route to chat agent (unless this is clearly a runtime fix request) ──
      if (convResult.action === "chat") {
        if (looksLikeRuntimeFixRequest) {
          console.log("[SmartSend] Overriding chat → edit for runtime fix request");
          setCurrentAgent("edit");
          setPipelineStep("resolving");
          sendEditMessage(finalText, images);
          return;
        }

        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }
    }

    // ── Step 2: Fallback when server returned "continue" or failed ──
    // FIX #2: Simplified — no more dual client/server classification race.
    // Only use conversation-engine as fallback classifier via a simple heuristic.
    const hasExistingCodeFallback = !!(sandpackFilesRef.current && Object.keys(sandpackFilesRef.current).length > 0);
    
    // FIX: Catch non-actionable short messages (frustration, gibberish, profanity)
    // These should NEVER trigger a build or edit — route to chat.
    const NON_ACTIONABLE = /^[\s!?.,:;\-—…'"()*#@&^%$~`]+$|^(fuck|shit|damn|hell|wtf|omg|ugh|lol|ok|okay|no|nah|nope|hmm|huh|meh|bruh|stop|quit|bye|go away|leave|shut up|whatever|forget it|never ?mind|screw|crap|bloody|idiot|stupid|dumb|rubbish|useless|hate|sucks?|annoying|terrible|horrible|awful|worst|lame|pathetic)\b/i;
    const isNonActionable = finalText.trim().length < 30 && NON_ACTIONABLE.test(finalText.trim());
    
    if (isNonActionable) {
      setCurrentAgent("chat");
      setPipelineStep("chatting");
      sendChatMessage(finalText, images);
      return;
    }

    if (finalText.length > 15) {
      // Simple heuristic: questions → chat, everything else → build/edit
      const isQuestion = /^(what|how|why|can you|could you|should|is it|tell me|explain|help me|describe|when|where|who)\b/i.test(finalText.trim());
      const isConversational = /^(thanks|thank you|got it|i see|okay|cool|great|nice|awesome|perfect)\b/i.test(finalText.trim());
      
      if (isQuestion || isConversational) {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }
      
      // If existing code but no explicit command, stay in chat mode (no implicit edits)
      if (hasExistingCodeFallback) {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }
    }

    // ── Step 3: Default to build ──
    // GATE: If server FSM is in "gathering" mode, DO NOT build — gather instead
    if (conversationMode === "gathering") {
      const phase = conversationAddPhase?.(finalText, hasImages, images);
      const ackText = conversationGenerateAck?.(phase) || "✅ Got it! Send the next phase when ready, or say **\"build it\"** to start.";

      const content = buildMessageContent(finalText, images);
      const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
      setInput("");
      setAttachedImages([]);
      setMessages((prev) => [...prev, userMsg]);
      const assistantMsg: Msg = { role: "assistant", content: ackText, timestamp: Date.now() };
      setMessages((prev) => [...prev, assistantMsg]);
      const updatedMessages = [...messagesRef.current, userMsg, assistantMsg];
      saveProject({ chat_history: updatedMessages.map(m => ({ role: m.role, content: m.content })) });
      return;
    }

    // GATE: Very short messages (< 15 chars) with no clear build keywords should NOT trigger builds
    const SHORT_BUILD_KEYWORDS = /\b(build|create|make|add|generate|scaffold|app|website|page|dashboard)\b/i;
    if (finalText.trim().length < 15 && !SHORT_BUILD_KEYWORDS.test(finalText)) {
      setCurrentAgent("chat");
      setPipelineStep("chatting");
      sendChatMessage(finalText, images);
      return;
    }

    setCurrentAgent("build");
    setPipelineStep("planning");
    sendMessage(finalText, images);
  }, [
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
  ]);

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
    isSendingRef.current = false;
    saveProject({ chat_history: [], html_content: "" });
  }, [currentProject, isLoading, setPreviewHtml, saveProject, setMessages, setSandpackFiles, setSandpackDeps, setPreviewMode, setPreviewErrors, setHealAttempts, resetHealing]);

  const abortBuild = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsBuilding(false);
    setBuildStep("");
    isSendingRef.current = false;
  }, [setIsBuilding, setBuildStep]);

  return {
    // State
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

    // Refs
    isSendingRef,
    isLoadingRef,
    messagesRef,
    sandpackFilesRef,
    abortControllerRef,
    lastProjectIdRef,
    lastVerificationOkRef,

    // Actions
    sendMessage,
    sendChatMessage,
    sendEditMessage,
    handleSmartSend,
    clearChat,
    abortBuild,
    syncSandpackToVirtualFS,
    buildMessageContent,

    // Pipeline state setters (needed by ChatPanel for project switch reset)
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

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Version } from "@/components/VersionHistory";
import { User, Sparkles, AlertTriangle, Wand2, ImagePlus, X, ArrowDown, Zap, ShieldCheck, Square } from "lucide-react";
import VoiceInput from "@/components/VoiceInput";
import { streamChat } from "@/lib/streamChat";
import { streamChatAgent, streamBuildAgent, validateReactCode, hasBuildConfirmation, stripBuildMarker, formatRetryContext, MAX_BUILD_RETRIES, type AgentIntent, type PipelineStep } from "@/lib/agentPipeline";
import { generatePlan, type BuildPlan, type PlanTask } from "@/lib/planningAgent";
import { executePlan } from "@/lib/taskExecutor";
import { runBuildEngine, type EngineConfig, type EngineProgress } from "@/lib/buildEngine";
import { matchTemplate, PAGE_TEMPLATES, type PageTemplate } from "@/lib/pageTemplates";
import { COMPONENT_SNIPPETS, getSnippetsPromptContext } from "@/lib/componentSnippets";
import { AI_MODELS, DEFAULT_MODEL, PROMPT_SUGGESTIONS, QUICK_ACTIONS, CONTEXT_SUGGESTIONS, DESIGN_THEMES, type AIModelId } from "@/lib/aiModels";
import { generateSmartSuggestions, type SmartSuggestion } from "@/lib/smartSuggestions";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useProjectContextCache } from "@/hooks/useProjectContextCache";
import { useIntentClassification } from "@/hooks/useIntentClassification";
import { useSelfHealing } from "@/hooks/useSelfHealing";
import DiffPreview from "@/components/DiffPreview";
import { motion, AnimatePresence } from "framer-motion";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS, parseMultiFileOutput } from "@/contexts/VirtualFSContext";
import { supabase } from "@/integrations/supabase/client";
import { toExportPath } from "@/lib/pathNormalizer";
import { StreamingPreviewController } from "@/lib/streamingPreview";
import ChatMessage from "@/components/chat/ChatMessage";
import BuildPipelineCard from "@/components/chat/BuildPipelineCard";
import ClarifyingQuestions from "@/components/chat/ClarifyingQuestions";
import ChatWelcome from "@/components/chat/ChatWelcome";
import ChatInput from "@/components/chat/ChatInput";
import ReactMarkdown from "react-markdown";
import {
  type MsgContent,
  getTextContent,
  getImageUrls,
  parseResponse,
  parseReactFiles,
  postProcessHtml,
  sanitizeImports,
  fileToDataUrl,
  formatTime,
  buildMessageContent,
} from "@/lib/codeParser";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number };

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

export interface ChatPanelHandle {
  clearChat: () => void;
  sendMessage: (text: string) => void;
}

const ChatPanel = forwardRef<ChatPanelHandle, { initialPrompt?: string; onVersionCreated?: (version: Version) => void }>(({ initialPrompt, onVersionCreated }, ref) => {
  const { currentProject, saveProject } = useProjects();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModelId>(DEFAULT_MODEL);
  const [selectedTheme, setSelectedTheme] = useState<string>("minimal");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  
  const [buildStreamContent, setBuildStreamContent] = useState("");
  // Build retry state
  const [buildRetryCount, setBuildRetryCount] = useState(0);
  // Agent pipeline state
  const [currentAgent, setCurrentAgent] = useState<AgentIntent | null>(null);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | null>(null);
  const [pendingBuildPrompt, setPendingBuildPrompt] = useState<string | null>(null);
  // Planning agent state
  const [currentPlan, setCurrentPlan] = useState<BuildPlan | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [totalPlanTasks, setTotalPlanTasks] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { previewHtml: currentPreviewHtml, sandpackFiles: currentSandpackFiles, setPreviewHtml, setIsBuilding, setBuildStep, setSandpackFiles, setSandpackDeps, setPreviewMode, setBuildMetrics, saveSnapshot } = usePreview();
  const { setFiles: setVirtualFiles } = useVirtualFS();
  const lastProjectIdRef = useRef<string | null>(null);
  const hasProcessedInitialRef = useRef(false);
  const buildSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX: Track sandpack files via ref to prevent stale closure reads during project switches
  const sandpackFilesRef = useRef<Record<string, string> | null>(null);
  sandpackFilesRef.current = currentSandpackFiles;

  // Streaming preview controller — renders partial output during builds
  const streamingControllerRef = useRef<StreamingPreviewController | null>(null);

  // Undo/Redo system
  const { createCheckpoint, undo, redo, canUndo, canRedo } = useUndoRedo();

  // ─── Extracted Hooks ─────────────────────────────────────────────────────
  // Project context cache (schemas, knowledge, IR state)
  const { fetchProjectContext, invalidateCache: invalidateContextCache } = useProjectContextCache(currentProject?.id);

  // Intent classification (fast local + server, follow-up questions)
  const {
    followUpQuestions, setFollowUpQuestions,
    followUpAnswers, setFollowUpAnswers,
    pendingFollowUpPrompt, setPendingFollowUpPrompt,
    analysisResult, setAnalysisResult,
    isAnalyzing, setIsAnalyzing,
    classifyUserIntent, fastClassifyLocal,
    resetClassificationState,
  } = useIntentClassification(
    currentSandpackFiles,
    currentPreviewHtml || "",
    messages.length,
    setPipelineStep,
  );


  // Listen for refactor actions from CodeEditor
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.prompt) {
        handleSmartSend(detail.prompt);
      }
    };
    window.addEventListener("refactor-action", handler);
    return () => window.removeEventListener("refactor-action", handler);
  }, []);

  const handleUndo = useCallback(() => {
    const checkpoint = undo();
    if (!checkpoint) return;
    if (checkpoint.sandpackFiles) {
      setSandpackFiles(checkpoint.sandpackFiles);
      setPreviewMode("sandpack");
    } else {
      setPreviewHtml(checkpoint.html);
      setPreviewMode("html");
    }
  }, [undo, setSandpackFiles, setPreviewHtml, setPreviewMode]);

  const handleRedo = useCallback(() => {
    const checkpoint = redo();
    if (!checkpoint) return;
    if (checkpoint.sandpackFiles) {
      setSandpackFiles(checkpoint.sandpackFiles);
      setPreviewMode("sandpack");
    } else {
      setPreviewHtml(checkpoint.html);
      setPreviewMode("html");
    }
  }, [redo, setSandpackFiles, setPreviewHtml, setPreviewMode]);

  const syncSandpackToVirtualFS = useCallback((sandpackFiles: Record<string, string>) => {
    const virtualFiles: Record<string, { path: string; content: string; language: string }> = {};
    for (const [path, content] of Object.entries(sandpackFiles)) {
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      // Map sandpack paths to src/ structure for display
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

const healTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// Self-healing hook
const {
  previewErrors, setPreviewErrors,
  healAttempts, setHealAttempts,
  isHealing, healingStatus,
  handleAutoFix,
  resetHealing,
  MAX_HEAL_ATTEMPTS,
} = useSelfHealing({
  isBuildingValue: usePreview().isBuilding,
  isLoading,
  sandpackFilesRef,
  isSendingRef: { current: false } as React.RefObject<boolean>, // wired below
  isLoadingRef: { current: false } as React.RefObject<boolean>, // wired below  
  sendMessage: (text: string) => sendMessageRef.current(text),
});

// Auto-clear safety timeout when isBuilding goes false
const isBuildingValue = usePreview().isBuilding;
useEffect(() => {
  if (!isBuildingValue && buildSafetyTimeoutRef.current) {
    clearTimeout(buildSafetyTimeoutRef.current);
    buildSafetyTimeoutRef.current = null;
  }
}, [isBuildingValue]);
// ─── Project context cache — avoids re-fetching on every message ───────────
const projectContextCacheRef = useRef<{
  projectId: string;
  schemas: any[];
  knowledge: string[];
  irContext: string;
  fetchedAt: number;
} | null>(null);
const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
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
  // Timer moved to BuildPipelineCard — no more per-second re-renders here

  // Auto-create checkpoint when a build completes
  const prevPipelineStep = useRef<PipelineStep | null>(null);
  useEffect(() => {
    if (prevPipelineStep.current !== "complete" && pipelineStep === "complete") {
      const lastUserMsg = messagesRef.current.filter(m => m.role === "user").pop();
      const label = lastUserMsg ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content.slice(0, 40) : "Build") : "Build";
      createCheckpoint(label, currentPreviewHtml || "", sandpackFilesRef.current);
    }
    prevPipelineStep.current = pipelineStep;
  }, [pipelineStep, createCheckpoint, currentPreviewHtml]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else if (!e.target || !(e.target as HTMLElement).matches("textarea, input, [contenteditable]")) {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  // Scroll detection for scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (el) {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            setShowScrollBtn(!atBottom);
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (atBottom || isLoading) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages.length, buildStreamContent, isLoading]);

  // Preview error listening is now handled by useSelfHealing hook
   // Self-healing is now handled by useSelfHealing hook

  // classifyUserIntent is now provided by useIntentClassification hook

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
    // IMPORTANT: Go directly to build agent — skip classification since user already answered
    setCurrentAgent("build");
    setPipelineStep("planning");
    // Use ref to avoid block-scoped declaration issue
    setTimeout(() => sendMessageRef.current(enrichedPrompt), 0);
  }, [followUpQuestions, followUpAnswers, pendingFollowUpPrompt]);

  const skipFollowUpQuestions = useCallback(() => {
    const prompt = pendingFollowUpPrompt;
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setPendingFollowUpPrompt("");
    setAnalysisResult(null);
    // Skip classification — user explicitly chose to skip, go straight to build
    setCurrentAgent("build");
    setPipelineStep("planning");
    setTimeout(() => sendMessageRef.current(prompt), 0);
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
      // ─── FULL RESET: Clear ALL state from previous project ───
      setSandpackFiles(null);
      setSandpackDeps({});
      setPreviewMode("html");
      setPreviewErrors([]);
      setAttachedImages([]);
      // Clear VirtualFS so old files don't bleed into new project
      setVirtualFiles({});
      // Reset all build/pipeline state
      setHealAttempts(0);
      resetHealing();
      setBuildStreamContent("");
      setCurrentPlan(null);
      setCurrentTaskIndex(0);
      setTotalPlanTasks(0);
      setCurrentAgent(null);
      setPipelineStep(null);
      setBuildRetryCount(0);
      // Clear follow-up questions from previous project
      setFollowUpQuestions([]);
      setFollowUpAnswers({});
      setPendingFollowUpPrompt("");
      setAnalysisResult(null);
      // Invalidate context cache so old schemas/knowledge don't leak
      projectContextCacheRef.current = null;
      // Abort any in-flight request from previous project
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isSendingRef.current = false;

      // Restore persisted sandpack state from project_data
      const restoreProjectId = currentProject.id;
      supabase
        .from("project_data")
        .select("data")
        .eq("project_id", restoreProjectId)
        .eq("collection", "sandpack_state")
        .maybeSingle()
        .then(({ data: row }) => {
          // Guard: only apply if still on the same project
          if (lastProjectIdRef.current !== restoreProjectId) return;
          if (row?.data && typeof row.data === "object") {
            const state = row.data as any;
            if (state.files && Object.keys(state.files).length > 0) {
              console.log("[ChatPanel] ✅ Restored sandpack state:", Object.keys(state.files).length, "files");
              setSandpackFiles(state.files);
              syncSandpackToVirtualFS(state.files);
              if (state.deps) setSandpackDeps(state.deps);
              setPreviewMode("sandpack");
            }
          }
        });
    } else if (!currentProject) {
      lastProjectIdRef.current = null;
      setMessages([]);
      setPreviewHtml("");
      setSandpackFiles(null);
      setSandpackDeps({});
      setPreviewMode("html");
      setPreviewErrors([]);
      setAttachedImages([]);
      setVirtualFiles({});
      projectContextCacheRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, setPreviewHtml]);

  // ─── fetchProjectContext ──────────────────────────────────────────────────
  // All 4 DB queries run in parallel (Promise.allSettled) and the result is
  // cached per project for CONTEXT_CACHE_TTL_MS so subsequent messages are
  // instant — no DB round-trips at send time.
  const fetchProjectContext = useCallback(async (projectId: string): Promise<{ schemas: any[]; knowledge: string[]; irContext: string }> => {
    const cache = projectContextCacheRef.current;
    if (cache && cache.projectId === projectId && (Date.now() - cache.fetchedAt) < CONTEXT_CACHE_TTL_MS) {
      return { schemas: cache.schemas, knowledge: cache.knowledge, irContext: cache.irContext };
    }

    const [schemasRes, knowledgeRes, decisionsRes, governanceRes, irRes] = await Promise.allSettled([
      supabase.from("project_schemas" as any).select("collection_name, schema").eq("project_id", projectId),
      supabase.from("project_knowledge" as any).select("title, content").eq("project_id", projectId).eq("is_active", true),
      supabase.from("project_decisions" as any).select("category, title, description").eq("project_id", projectId).eq("is_active", true),
      supabase.from("project_governance_rules" as any).select("category, name, description, severity").eq("project_id", projectId).eq("is_active", true),
      supabase.from("projects").select("ir_state").eq("id", projectId).single(),
    ]);

    const schemas = schemasRes.status === "fulfilled" ? (schemasRes.value.data || []) : [];
    const knowledge: string[] = knowledgeRes.status === "fulfilled"
      ? (knowledgeRes.value.data || []).map((k: any) => `[${k.title}]: ${k.content}`)
      : [];

    if (decisionsRes.status === "fulfilled" && decisionsRes.value.data?.length) {
      knowledge.push("[PROJECT DECISIONS - Follow these architectural decisions]:");
      decisionsRes.value.data.forEach((d: any) => {
        knowledge.push(`  [${d.category}] ${d.title}${d.description ? ': ' + d.description : ''}`);
      });
    }
    if (governanceRes.status === "fulfilled" && governanceRes.value.data?.length) {
      knowledge.push("[GOVERNANCE RULES - Enforce these standards in generated code]:");
      governanceRes.value.data.forEach((r: any) => {
        knowledge.push(`  [${r.severity.toUpperCase()}] ${r.name}${r.description ? ': ' + r.description : ''}`);
      });
    }

    // Serialize IR state if present
    let irContext = "";
    if (irRes.status === "fulfilled" && irRes.value.data) {
      const { serializeIR } = await import("@/lib/irSerializer");
      irContext = serializeIR((irRes.value.data as any).ir_state);
    }

    projectContextCacheRef.current = { projectId, schemas, knowledge, irContext, fetchedAt: Date.now() };
    return { schemas, knowledge, irContext };
  }, []);

  // Prefetch context when a project is loaded — so the FIRST message has zero DB wait
  useEffect(() => {
    if (currentProject?.id) {
      // Invalidate cache on project switch
      if (projectContextCacheRef.current?.projectId !== currentProject.id) {
        projectContextCacheRef.current = null;
      }
      fetchProjectContext(currentProject.id);
    }
  }, [currentProject?.id, fetchProjectContext]);

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

  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

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
    setCurrentAgent(null);
    setPipelineStep(null);
    setPendingBuildPrompt(null);
    setCurrentPlan(null);
    setCurrentTaskIndex(0);
    setTotalPlanTasks(0);
    isSendingRef.current = false;
    saveProject({ chat_history: [], html_content: "" });
  }, [currentProject, isLoading, setPreviewHtml, saveProject]);

  // sendMessage is defined below — use a stable ref so useImperativeHandle doesn't need it in deps
  const sendMessageRef = useRef<(text: string, images?: string[]) => void>(() => {});
  useImperativeHandle(ref, () => ({ clearChat, sendMessage: (text: string) => sendMessageRef.current(text) }), [clearChat]);

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
    if (inputRef.current) inputRef.current.style.height = "60px";
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setBuildStreamContent("");
    setIsBuilding(true);
    setBuildStep(images.length > 0 ? "🖼️ Analyzing image..." : "🏗️ Build agent generating code...");
    setPipelineStep("generating");

    // Safety timeout: if build doesn't complete in 300 seconds, force reset
    if (buildSafetyTimeoutRef.current) clearTimeout(buildSafetyTimeoutRef.current);
    buildSafetyTimeoutRef.current = setTimeout(() => {
      console.warn("[ChatPanel] Build safety timeout — forcing isBuilding=false");
      setIsBuilding(false);
      setIsLoading(false);
      setBuildStep("");
      setPipelineStep(null);
      setCurrentAgent(null);
      isSendingRef.current = false;
      setMessages((prev) => {
        const msg = "⚠️ Build timed out after 5 minutes. The AI model may be under heavy load — please try again, or break the request into smaller steps.";
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
        }
        return [...prev, { role: "assistant", content: msg, timestamp: Date.now() }];
      });
    }, 300_000);

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
        // NOTE: Do NOT push partial files to Sandpack during streaming.
        // Incomplete code causes "Something went wrong" errors in the preview.
        // Files are only set on build completion (onDone).
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
      // ─── Context: served from in-memory cache (populated at project load) ───────
      const { schemas, knowledge, irContext } = await fetchProjectContext(currentProject.id);

      // ─── Current code context: smart file prioritization ─────────────────────
      // FIX: For brand new projects (no prior messages), don't send stale sandpack files
      // from a previous project that may still be in React state (async flush race)
      const isFirstMessage = messagesRef.current.filter(m => m.role === "user").length <= 1;
      const hasPersistedHistory = (currentProject.chat_history ?? []).length > 0;
      const shouldIncludeCurrentCode = !isFirstMessage || hasPersistedHistory;
      
      let currentCodeSummary = "";
      // FIX: Use ref to read latest sandpack files (avoids stale closure from project switch)
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

      // Get component snippets reference for AI
      const snippetsContext = getSnippetsPromptContext();

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

      // ─── Shared onDone handler for both build-agent and chat paths ───
      const handleOnDone = async (responseText: string) => {
        if (abortController.signal.aborted) return;
        fullResponse = responseText;
        
        console.log(`[ChatPanel:onDone] Response length: ${fullResponse.length}`);
        
        const reactResult = parseReactFiles(fullResponse);
        let finalHtml: string | null = null;
        
        if (reactResult.files) {
          setPipelineStep("validating");
          setBuildStep("✅ Validating code...");
          const validation = validateReactCode(reactResult.files);
          
          if (!validation.valid && buildRetryCount < MAX_BUILD_RETRIES) {
            console.warn(`[ChatPanel:onDone] Validation failed (attempt ${buildRetryCount + 1}):`, validation.errors);
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
                console.error("[ChatPanel:retry] Retry failed:", err);
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
            console.warn("[ChatPanel:onDone] Validation warnings (max retries reached):", validation.errors);
          }
          
          const fileNames = Object.keys(reactResult.files);
          console.log(`[ChatPanel:onDone] ✅ React files:`, fileNames);
          setSandpackFiles(reactResult.files);
          syncSandpackToVirtualFS(reactResult.files);
          if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);
          setPreviewMode("sandpack");
          setBuildRetryCount(0);
        } else {
          console.log("[ChatPanel:onDone] No React files — falling back to HTML");
          const { files: parsedFiles, html: htmlCode, chatText } = parseMultiFileOutput(fullResponse);
          
          if (Object.keys(parsedFiles).length > 0) setVirtualFiles(parsedFiles);
          if (htmlCode) setPreviewHtml(postProcessHtml(htmlCode));

          finalHtml = htmlCode;
          
          // If NO code was generated at all (neither React nor HTML), the AI gave a text-only response.
          // Auto-retry with an explicit instruction to generate code.
          if (!htmlCode && buildRetryCount < MAX_BUILD_RETRIES) {
            console.warn("[ChatPanel:onDone] No code in response — auto-retrying with code generation instruction");
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
                  // Still no code — show user-friendly message
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
                console.error("[ChatPanel:code-retry] Retry failed:", err);
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
          
          // Persist sandpack files for session restoration (direct chat build path)
          if (reactResult.files && Object.keys(reactResult.files).length > 0) {
            const payload = { files: reactResult.files, deps: reactResult.deps || {} };
            supabase
              .from("project_data")
              .upsert(
                { project_id: currentProject.id, collection: "sandpack_state", data: payload as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => {
                if (error) console.warn("[ChatPanel] Failed to persist sandpack state:", error);
              });
          }
          
          return final;
        });
      };

      const handleOnError = (err: string) => {
        if (abortController.signal.aborted) return;
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, timestamp: Date.now() }]);
        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        setPipelineStep("error");
        setCurrentAgent(null);
        isSendingRef.current = false;
        // Stop streaming preview on error
        streamingControllerRef.current?.stop();
        streamingControllerRef.current = null;
      };

      // ─── Cleanup helper for plan-based builds ───
      const handleOnDone_cleanup = () => {
        setIsLoading(false);
        setIsBuilding(false);
        setBuildStep("");
        setPipelineStep("complete");
        setCurrentAgent(null);
        isSendingRef.current = false;
        setBuildRetryCount(0);
        setCurrentPlan(null);
        setTimeout(() => setBuildStreamContent(""), 3000);

        const persistMessages = messagesRef.current.map(m => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : getTextContent(m.content),
        }));
        saveProject({ chat_history: persistMessages, html_content: currentProject.html_content || "" });
      };

      // ─── Intent Classification already handled by handleSmartSend ───
      // Classification is done before sendMessage is called, so we skip it here.

      // ─── CORE: Build engine for code generation ───
        setCurrentAgent("build");
        setPipelineStep("planning");
        
        const buildProjectId = currentProject.id;
        const liveSandpackFiles = sandpackFilesRef.current;
        const isFirstBuild = !liveSandpackFiles || Object.keys(liveSandpackFiles).length === 0;

        // ─── INSTANT PATH: Pre-built templates render in <1 second ───
        // When a template matched and we have a pre-built instant template,
        // render it immediately, then fire an AI polish pass in the background.
        const isSimpleBuild = isFirstBuild && !!template;
        
        if (isSimpleBuild || isFirstBuild) {
          const { findInstantTemplate, hydrateTemplate } = await import("@/lib/instantTemplates");
          // If no template matched, default to saas-landing for any first build
          const templateId = template?.id || "saas-landing";
          const templateName = template?.name || "Landing Page";
          const instantTemplate = findInstantTemplate(templateId);
          
          if (instantTemplate) {
            console.log(`[ChatPanel] ⚡ INSTANT PATH: Rendering "${templateName}" in <1s`);
            setBuildStep("⚡ Instant preview loading...");
            setPipelineStep("bundling");
            
            // Extract a description from the user's prompt
            const promptDesc = userText.replace(/build|create|make|website|app|called|named|beautiful|simple/gi, "").trim();
            const projectName = currentProject.name || "My App";
            const { files, deps } = hydrateTemplate(instantTemplate, projectName, promptDesc || "Build applications at the speed of thought");
            
            // Instantly render the template
            setSandpackFiles(files);
            syncSandpackToVirtualFS(files);
            if (Object.keys(deps).length > 0) setSandpackDeps(deps);
            setPreviewMode("sandpack");
            
            // Show success message immediately
            const fileCount = Object.keys(files).length;
            const instantMsg = `⚡ **Instant Preview** — ${fileCount} files rendered in under 1 second!\n\nYour ${templateName} is ready. I'm now polishing the content based on your prompt...`;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: instantMsg } : m));
              }
              return [...prev, { role: "assistant", content: instantMsg, timestamp: Date.now() }];
            });
            
            // Persist the instant template immediately
            const payload = { files, deps };
            supabase
              .from("project_data")
              .upsert(
                { project_id: buildProjectId, collection: "sandpack_state", data: payload as any },
                { onConflict: "project_id,collection" }
              )
              .then(({ error }) => {
                if (error) console.warn("[ChatPanel] Instant template persist failed:", error);
              });

            // Now fire AI polish pass in the background to customize content
            setBuildStep("🎨 AI is customizing your content...");
            setPipelineStep("generating");
            
            const polishContext = `## INSTANT TEMPLATE LOADED
The user already sees a live preview of a ${templateName} template. Your job is to CUSTOMIZE the existing template files with the user's specific content, branding, and requirements.

## USER REQUEST
"${userText}"

## CURRENT FILES (already rendered)
${Object.entries(files).map(([path, code]) => `--- ${path}\n${code}`).join("\n\n")}

## INSTRUCTIONS
1. Keep the EXACT same file structure and component architecture
2. Customize ALL placeholder text to match the user's specific request
3. Adjust colors, content, and details to fit their brand/idea
4. Output ALL files (even unchanged ones) in \`\`\`react-preview format
5. Do NOT add new files unless necessary — focus on content customization`;
            
            await streamBuildAgent({
              messages: [{ role: "user" as const, content: polishContext }],
              projectId: buildProjectId,
              techStack: currentProject.tech_stack || "react-cdn",
              schemas,
              model: "google/gemini-3-flash-preview",
              designTheme: themeInfo?.prompt,
              templateContext: templateCtx || undefined,
              irContext: irContext || undefined,
              onDelta: upsert,
              onDone: async (responseText) => {
                // Parse and apply the polished files — but validate first
                const reactResult = parseReactFiles(responseText);
                if (reactResult.files && Object.keys(reactResult.files).length > 0) {
                  // Quick validation: check for JSX syntax errors using Sucrase
                  let hasErrors = false;
                  try {
                    const { transform } = await import("sucrase");
                    for (const [fPath, fCode] of Object.entries(reactResult.files)) {
                      if (fPath.match(/\.(jsx?|tsx?)$/)) {
                        try {
                          transform(fCode, { transforms: ["jsx", "imports"], filePath: fPath });
                        } catch {
                          hasErrors = true;
                          break;
                        }
                        // Check for missing local imports — auto-create stubs instead of failing
                        const importPathRegex2 = /import\s+(?:[\w{},\s*]+\s+from\s+)?["'](\.[^"']+)["']/g;
                        let m2;
                        while ((m2 = importPathRegex2.exec(fCode)) !== null) {
                          const importPath = m2[1];
                          const currentDir = fPath.substring(0, fPath.lastIndexOf("/")) || "";
                          let resolved = importPath.startsWith("./") ? currentDir + importPath.substring(1) : importPath;
                          if (importPath.startsWith("../")) {
                            const parts = currentDir.split("/").filter(Boolean);
                            let relParts = importPath.split("/");
                            while (relParts[0] === "..") { parts.pop(); relParts.shift(); }
                            resolved = "/" + parts.concat(relParts).join("/");
                          }
                          if (!resolved.startsWith("/")) resolved = "/" + resolved;
                          const exts = ["", ".jsx", ".js", ".tsx", ".ts"];
                          const found = exts.some(ext => reactResult.files![resolved + ext] !== undefined);
                          const indexFound = exts.some(ext => reactResult.files![resolved + "/index" + ext] !== undefined);
                          if (!found && !indexFound) {
                            // Auto-create stub instead of failing
                            const segments = resolved.split("/");
                            const compName = segments[segments.length - 1].replace(/\.\w+$/, "");
                            const stubPath = resolved.match(/\.\w+$/) ? resolved : resolved + ".jsx";
                            if (/^[A-Z]/.test(compName)) {
                              reactResult.files![stubPath] = `import React from "react";\n\nexport default function ${compName}({ children }) {\n  return <div className="p-4">{children || "${compName}"}</div>;\n}\n`;
                            } else {
                              reactResult.files![stubPath] = `export default {};\n`;
                            }
                            console.log("[ChatPanel] Auto-created stub for polish pass:", stubPath);
                          }
                        }
                      }
                    }
                  } catch {
                    // If Sucrase import fails, skip validation
                  }
                  
                  if (hasErrors) {
                    // Polish produced broken code — keep the working instant template
                    console.warn("[ChatPanel] Polish pass produced broken code, keeping instant template");
                    // Do NOT persist broken code — leave the working instant template in place
                  } else {
                    setSandpackFiles(reactResult.files);
                    syncSandpackToVirtualFS(reactResult.files);
                    if (Object.keys(reactResult.deps).length > 0) setSandpackDeps(reactResult.deps);
                    
                    // Only persist when code is valid
                    const polishedPayload = { files: reactResult.files, deps: reactResult.deps || {} };
                    supabase
                      .from("project_data")
                      .upsert(
                        { project_id: buildProjectId, collection: "sandpack_state", data: polishedPayload as any },
                        { onConflict: "project_id,collection" }
                      )
                      .then(({ error }) => { if (error) console.warn("Polish persist error:", error); });
                  }
                  
                  const polishedMsg = reactResult.chatText || `✅ **${templateName} customized!** Your site is ready with personalized content.`;
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant") {
                      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: polishedMsg } : m));
                    }
                    return [...prev, { role: "assistant", content: polishedMsg, timestamp: Date.now() }];
                  });
                } else {
                  // Polish didn't produce files — keep the instant template (it's already good)
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    const msg = `✅ **${templateName} is ready!** Your site is live with all sections.`;
                    if (last?.role === "assistant") {
                      return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: msg } : m));
                    }
                    return [...prev, { role: "assistant", content: msg, timestamp: Date.now() }];
                  });
                }
                
                setIsLoading(false);
                setIsBuilding(false);
                setBuildStep("");
                setPipelineStep("complete");
                setCurrentAgent(null);
                isSendingRef.current = false;
                setBuildRetryCount(0);
                
                // Persist chat history
                const persistMessages = messagesRef.current.map(m => ({
                  role: m.role,
                  content: typeof m.content === "string" ? m.content : getTextContent(m.content),
                }));
                saveProject({ chat_history: persistMessages, html_content: currentProject.html_content || "" });
              },
              onError: (err) => {
                // Even if polish fails, user already has the instant template
                console.warn("[ChatPanel] Polish pass failed, keeping instant template:", err);
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  const msg = `✅ **${templateName} is ready!** (AI customization skipped — your template is still fully functional)`;
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
              },
            });
            return;
          }
          
          // No instant template found — fall back to direct AI build
          console.log(`[ChatPanel] ⚡ FAST PATH: Direct build with template "${template.name}" (no instant template)`);
          setBuildStep("⚡ Fast building with template...");
          setPipelineStep("generating");
          
          await streamBuildAgent({
            messages: apiMessages,
            projectId: buildProjectId,
            techStack: currentProject.tech_stack || "react-cdn",
            schemas,
            model: selectedModel,
            designTheme: themeInfo?.prompt,
            knowledge,
            templateContext: templateCtx || undefined,
            snippetsContext: snippetsContext || undefined,
            irContext: irContext || undefined,
            onDelta: upsert,
            onDone: handleOnDone,
            onError: handleOnError,
          });
          return;
        }

        // ─── FULL PATH: Requirements Agent + Build Engine ───
        let domainModel: any = undefined;
        
        // Priority 1: Derive domain model from IR (zero latency, no network)
        if (irContext && currentProject?.ir_state) {
          try {
            const { irToDomainModel } = await import("@/lib/irToDomain");
            const { hasIRContent } = await import("@/lib/irSerializer");
            const irState = currentProject.ir_state as any;
            if (irState && hasIRContent(irState)) {
              const irDerived = irToDomainModel(irState);
              if (irDerived && irDerived.entities.length > 0) {
                domainModel = irDerived;
                console.log(`[ChatPanel] ⚡ IR-derived domain model: ${irDerived.entities.length} entities, ${irDerived.suggestedPages.length} pages, auth: ${irDerived.requiresAuth} (zero latency)`);
              }
            }
          } catch (err) {
            console.warn("[ChatPanel] IR-to-domain conversion failed, falling back:", err);
          }
        }
        
        // Priority 2: Keyword matching + Requirements Agent (for first builds without IR)
        if (!domainModel && isFirstBuild) {
          try {
            setBuildStep("🧠 Analyzing domain requirements...");
            const { matchDomainTemplate, serializeDomainModel } = await import("@/lib/domainTemplates");
            const templateMatch = matchDomainTemplate(userText);
            
            if (templateMatch.template) {
              console.log(`[ChatPanel] Domain template matched: ${templateMatch.template.name} (confidence: ${templateMatch.confidence}, keywords: ${templateMatch.matchedKeywords.join(", ")})`);
              
              // Call requirements agent to customize the template
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
                console.log(`[ChatPanel] ✅ Domain model extracted: ${domainModel.entities?.length || 0} entities, auth: ${domainModel.requiresAuth}`);
              } else {
                console.warn("[ChatPanel] Requirements agent failed, using template directly");
                domainModel = templateMatch.template.model;
              }
            } else {
              console.log("[ChatPanel] No domain template matched, using direct build");
            }
          } catch (err) {
            console.warn("[ChatPanel] Requirements agent error, proceeding without domain model:", err);
          }
        }
        
        // FIX: Guard against project switch — if project changed during async ops, abort
        if (lastProjectIdRef.current !== buildProjectId) {
          console.warn("[ChatPanel] Project switched during build setup, aborting");
          setIsLoading(false);
          setIsBuilding(false);
          return;
        }
        
        // FIX: Use ref-based files to prevent stale data from previous project
        const safeExistingFiles = shouldIncludeCurrentCode && liveSandpackFiles && Object.keys(liveSandpackFiles).length > 0
          ? liveSandpackFiles
          : undefined;
        
        const engineConfig: EngineConfig = {
          projectId: buildProjectId,
          techStack: currentProject.tech_stack || "react-cdn",
          schemas: schemas.length > 0 ? schemas : undefined,
          model: selectedModel,
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

        // Save rollback snapshot before build
        saveSnapshot(`Pre-build: ${userText.slice(0, 50)}`);

        // Start streaming preview controller
        streamingControllerRef.current = new StreamingPreviewController((files, deps) => {
          if (lastProjectIdRef.current !== buildProjectId) return;
          // Merge streaming files with existing
          const currentFiles = sandpackFilesRef.current || {};
          setSandpackFiles({ ...currentFiles, ...files });
          if (Object.keys(deps).length > 0) setSandpackDeps(deps);
          setPreviewMode("sandpack");
        }, 500);
        streamingControllerRef.current.start();

        await runBuildEngine(userText, engineConfig, {
          onProgress: (progress: EngineProgress) => {
            setBuildStep(progress.message);
            
            if (progress.plan) setCurrentPlan(progress.plan);
            if (progress.totalTasks !== undefined) setTotalPlanTasks(progress.totalTasks);
            if (progress.taskIndex !== undefined) setCurrentTaskIndex(progress.taskIndex);
            
            // Update chat with progress
            if (progress.phase === "planning" && progress.plan) {
              const planSummary = `📋 **Build Plan** (${progress.plan.overallComplexity})\n${progress.plan.summary}\n\n${progress.plan.tasks.map((t, i) => `⏳ ${i + 1}. ${t.title}`).join("\n")}`;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: planSummary } : m));
                }
                return [...prev, { role: "assistant", content: planSummary, timestamp: Date.now() }];
              });
            } else if (progress.phase === "executing" && progress.plan) {
              const progressMsg = `📋 **Building** (${progress.plan.overallComplexity})\n${progress.plan.summary}\n\n${progress.plan.tasks.map((t, i) => {
                const idx = progress.taskIndex ?? 0;
                const status = i < idx ? "✅" : i === idx ? "🔨" : "⏳";
                return `${status} ${i + 1}. ${t.title}`;
              }).join("\n")}`;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: progressMsg } : m));
                }
                return prev;
              });
            }
          },
          onDelta: (chunk) => {
            setBuildStreamContent(prev => prev + chunk);
            // Feed streaming preview controller
            streamingControllerRef.current?.addChunk(chunk);
          },
          onFilesReady: (files, deps) => {
            // FIX: Guard against project switch during build
            if (lastProjectIdRef.current !== buildProjectId) return;
            setSandpackFiles(files);
            syncSandpackToVirtualFS(files);
            if (Object.keys(deps).length > 0) setSandpackDeps(deps);
            setPreviewMode("sandpack");
            
            // Persist incrementally during build so navigation away doesn't lose progress
            if (Object.keys(files).length > 0) {
              const payload = { files, deps: deps || {} };
              supabase
                .from("project_data")
                .upsert(
                  { project_id: buildProjectId, collection: "sandpack_state", data: payload as any },
                  { onConflict: "project_id,collection" }
                )
                .then(({ error }) => {
                  if (error) console.warn("[ChatPanel] Incremental persist failed:", error);
                });
            }
          },
          onComplete: (result) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              const msg = result.chatText;
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
            setCurrentPlan(result.plan || null);
            isSendingRef.current = false;
            setBuildRetryCount(0);
            if (result.metrics) setBuildMetrics(result.metrics);
            // Stop streaming preview controller
            streamingControllerRef.current?.stop();
            streamingControllerRef.current = null;
            setTimeout(() => setBuildStreamContent(""), 3000);
            
            const persistMessages = messagesRef.current.map(m => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : getTextContent(m.content),
            }));
            saveProject({ chat_history: persistMessages, html_content: currentProject.html_content || "" });
            
            // Persist sandpack files to project_data for session restoration
            if (result.files && Object.keys(result.files).length > 0) {
              const payload = { files: result.files, deps: result.deps || {} };
              supabase
                .from("project_data")
                .upsert(
                  { project_id: currentProject.id, collection: "sandpack_state", data: payload as any },
                  { onConflict: "project_id,collection" }
                )
                .then(({ error }) => {
                  if (error) console.warn("[ChatPanel] Failed to persist sandpack state:", error);
                  else console.log("[ChatPanel] ✅ Sandpack state persisted");
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
          onError: (err) => {
            handleOnError(err);
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

  // Keep ref in sync so useImperativeHandle can call the latest version
  sendMessageRef.current = sendMessage;


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

  // Chat-only agent — streams conversational response, no code
  const sendChatMessage = useCallback(async (text: string, images: string[] = []) => {
    if (!text || !currentProject) return;
    if (isSendingRef.current || isLoadingRef.current) return;
    isSendingRef.current = true;

    const content = buildMessageContent(text, images);
    const userMsg: Msg = { role: "user", content, timestamp: Date.now() };
    setInput("");
    setAttachedImages([]);
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setBuildStep("Thinking...");

    let fullChatResponse = "";

    const currentMessages = messagesRef.current;
    const apiMessages = [...currentMessages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Fetch knowledge
    let knowledge: string[] = [];
    try {
      const { data } = await supabase
        .from("project_knowledge" as any)
        .select("title, content")
        .eq("project_id", currentProject.id)
        .eq("is_active", true);
      knowledge = (data || []).map((k: any) => `[${k.title}]: ${k.content}`);
    } catch {}

    await streamChatAgent({
      messages: apiMessages,
      projectId: currentProject.id,
      techStack: currentProject.tech_stack || "react-cdn",
      knowledge,
      onDelta: (chunk) => {
        fullChatResponse += chunk;
        const displayText = stripBuildMarker(fullChatResponse);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: displayText } : m));
          }
          return [...prev, { role: "assistant", content: displayText, timestamp: Date.now() }];
        });
      },
      onDone: (finalText) => {
        setIsLoading(false);
        setBuildStep("");
        setPipelineStep("complete");
        setCurrentAgent(null);
        isSendingRef.current = false;

        // Check if chat agent confirmed a build
        if (hasBuildConfirmation(finalText)) {
          // Store the original user prompt for the build agent
          const userText = typeof text === "string" ? text : "";
          setPendingBuildPrompt(userText);
        }

        // Persist
        const displayText = stripBuildMarker(finalText);
        setMessages((prev) => {
          const final = prev.map((m, i) =>
            i === prev.length - 1 && m.role === "assistant" ? { ...m, content: displayText } : m
          );
          const persistMessages = final.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : getTextContent(m.content),
          }));
          saveProject({ chat_history: persistMessages });
          return final;
        });
      },
      onError: (err) => {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, timestamp: Date.now() }]);
        setIsLoading(false);
        setBuildStep("");
        setPipelineStep(null);
        setCurrentAgent(null);
        isSendingRef.current = false;
      },
    });
  }, [currentProject, saveProject, setBuildStep]);

  // Auto-trigger build agent when chat agent confirms a build
  useEffect(() => {
    if (pendingBuildPrompt && !isLoadingRef.current && !isSendingRef.current) {
      const prompt = pendingBuildPrompt;
      setPendingBuildPrompt(null);
      setCurrentAgent("build");
      setPipelineStep("planning");
      sendMessage(prompt);
    }
  }, [pendingBuildPrompt, sendMessage]);

  // ─── Client-side fast classification ───
  // Obvious build intents skip the 1-2s classify-intent round-trip entirely
  const fastClassifyLocal = useCallback((text: string): AgentIntent | null => {
    const t = text.trim().toLowerCase();
    // Clear build commands
    if (/^(build|create|make|add|generate|design|implement|develop|set up|scaffold|wire up)\b/i.test(t)) return "build";
    // Descriptive app prompts (e.g., "school ERP with student management")
    if (/\b(app|website|dashboard|landing page|erp|portal|system|platform|page|form|module|component)\b/i.test(t) && t.length > 20) return "build";
    // Modification commands
    if (/^(change|update|fix|modify|replace|remove|delete|move|rename|resize|recolor|restyle)\b/i.test(t)) return "build";
    // Affirmative confirmations
    if (/^(yes|go ahead|do it|build it|sounds good|ok|sure|let's go|proceed)/i.test(t)) return "build";
    // Clear chat intents
    if (/^(what|how|why|can you|could you|should|is it|tell me|explain|help me understand)\b/i.test(t) && t.endsWith("?")) return "chat";
    return null; // Ambiguous — fall through to server classification
  }, []);

  const handleSmartSend = useCallback(async (text: string, images: string[] = []) => {
    if (!text && images.length === 0) return;
    if (isSendingRef.current || isLoadingRef.current) return;
    const finalText = text || "Replicate this design";
    
    const isAutoFix = finalText.startsWith("🔧");
    const isShort = finalText.length < 15;
    const hasImages = images.length > 0;
    const isConfirmation = /^(yes|go ahead|do it|build it|sounds good|ok|sure)/i.test(finalText.trim());
    const hasAnswers = finalText.includes("--- Additional Requirements ---");
    
    // Fast path: skip network classification for obvious intents
    if (!isAutoFix && !isShort && !hasImages && !isConfirmation && !hasAnswers) {
      const localIntent = fastClassifyLocal(finalText);
      
      if (localIntent === "chat") {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }
      
      if (localIntent === "build") {
        // Skip classify-intent call entirely — save 1-2s
        console.log("[FastClassify] Client-side build detection, skipping server classify");
        setCurrentAgent("build");
        setPipelineStep("planning");
        sendMessage(finalText, images);
        return;
      }
      
      // Ambiguous: fall through to server classification
      const classification = await classifyUserIntent(finalText);
      if (classification?.intent === "clarify") return;
      
      if (classification?.intent === "chat") {
        setCurrentAgent("chat");
        setPipelineStep("chatting");
        sendChatMessage(finalText, images);
        return;
      }
    }
    
    // Default: route to build agent
    setCurrentAgent("build");
    setPipelineStep("planning");
    sendMessage(finalText, images);
  }, [classifyUserIntent, fastClassifyLocal]);

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
    e.target.style.height = "60px";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-8 overscroll-contain" style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}>
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

              {/* Capabilities showcase */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="w-full max-w-sm"
              >
                <div className="rounded-xl border border-border/50 bg-card/50 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2 text-center">What Phoneix Builder can do</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { icon: "🧠", label: "Multi-model AI", desc: "GPT-5, Gemini 2.5 & more" },
                      { icon: "🎨", label: "Design themes", desc: "10+ curated styles" },
                      { icon: "📸", label: "Image-to-code", desc: "Paste screenshot → app" },
                      { icon: "🔧", label: "Auto-fix errors", desc: "Self-healing builds" },
                      { icon: "⚡", label: "Live preview", desc: "Instant Sandpack render" },
                      { icon: "🧩", label: "Smart suggestions", desc: "Context-aware actions" },
                    ].map((cap, i) => (
                      <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
                        <span className="text-sm shrink-0">{cap.icon}</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-foreground leading-tight">{cap.label}</p>
                          <p className="text-[9px] text-muted-foreground/60 leading-tight">{cap.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
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
                  onSuggestionClick={!isUser ? (text) => handleSmartSend(text) : undefined}
                />
              );
            })}
          </AnimatePresence>

          {/* Build Pipeline Progress Card — shows for both chat and build agents */}
          {(buildStreamContent.length > 0 || currentAgent) && (isLoading || pipelineStep === "complete") && (
            <BuildPipelineCard
              isBuilding={isLoading}
              streamContent={buildStreamContent}
              pipelineStep={pipelineStep}
              currentAgent={currentAgent === "clarify" ? null : currentAgent}
              onShowPreview={() => {
                // Switch to preview panel when Preview tab is clicked
                const event = new CustomEvent("switch-panel", { detail: "preview" });
                window.dispatchEvent(event);
              }}
            />
          )}

          {/* Follow-up questions UI */}
          <AnimatePresence>
            {followUpQuestions.length > 0 && (
              <ClarifyingQuestions
                key="clarify-questions-stable"
                questions={followUpQuestions.map((q: any) => ({
                  id: q.id,
                  header: q.header || q.id,
                  text: q.text,
                  options: q.options.map((o: any) => ({
                    value: o.value,
                    label: o.label,
                    description: o.description || "",
                  })),
                  multiSelect: q.multiSelect || false,
                  allowOther: q.allowOther !== false,
                }))}
                badges={analysisResult?.analysis ? {
                  needsBackend: analysisResult.analysis.needsBackend,
                  needsAuth: analysisResult.analysis.needsAuth,
                  complexity: analysisResult.analysis.complexity,
                } : undefined}
                onSubmit={(answers) => {
                  const answersText = followUpQuestions.map((q: any) => {
                    const answer = answers[q.id];
                    if (Array.isArray(answer)) {
                      const labels = answer.map(v => {
                        if (v === "__other__") return "Other";
                        const opt = q.options.find((o: any) => o.value === v);
                        return opt?.label || v;
                      });
                      return `${q.text} → ${labels.join(", ")}`;
                    }
                    if (answer === "__other__") return `${q.text} → Other`;
                    const option = q.options.find((o: any) => o.value === answer);
                    return `${q.text} → ${option?.label || answer || "Not specified"}`;
                  }).join("\n");
                  
                  const enrichedPrompt = `${pendingFollowUpPrompt}\n\n--- Additional Requirements ---\n${answersText}`;
                  setFollowUpQuestions([]);
                  setFollowUpAnswers({});
                  setPendingFollowUpPrompt("");
                  setAnalysisResult(null);
                  sendMessage(enrichedPrompt);
                }}
                onSkip={skipFollowUpQuestions}
              />
            )}
          </AnimatePresence>

          {/* Analyzing prompt indicator */}
          <AnimatePresence>
          {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex gap-3 items-start"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                  <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div className="flex flex-col gap-1.5 pt-0.5">
                  <span className="text-xs font-semibold text-foreground/80">Phoneix is thinking...</span>
                  <div className="flex items-center gap-1.5">
                    <motion.span
                      animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                    />
                    <motion.span
                      animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                    />
                    <motion.span
                      animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                    />
                    <span className="text-[10px] text-muted-foreground/60 ml-1">Analyzing your request</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick actions moved to above input area */}
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

        {/* Smart context-aware suggestions — above input like Lovable */}
        {!isLoading && followUpQuestions.length === 0 && !input && (
          <div className="px-3 pt-2 pb-1">
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                // Gather code from current preview/sandpack
                const codeForAnalysis = currentPreviewHtml || 
                  (currentSandpackFiles ? Object.values(currentSandpackFiles).join("\n") : "");
                const chatMsgs = messages.map(m => ({ 
                  role: m.role, 
                  content: typeof m.content === "string" ? m.content : "" 
                }));
                const suggestions = generateSmartSuggestions(codeForAnalysis, chatMsgs, 4);
                return suggestions.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleSmartSend(s.prompt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all group"
                  >
                    <span className="text-xs group-hover:scale-110 transition-transform">{s.icon}</span>
                    {s.label}
                  </button>
                ));
              })()}
            </div>
          </div>
        )}

        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={handleSendClick}
          onKeyDown={handleKeyDown}
          isLoading={isLoading}
          onStop={() => {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            setIsLoading(false);
            setIsBuilding(false);
            setBuildStep("");
            isSendingRef.current = false;
          }}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          selectedTheme={selectedTheme}
          onThemeChange={setSelectedTheme}
          onFileSelect={handleFileSelect}
          onVoiceTranscript={(text) => setInput(prev => prev ? prev + " " + text : text)}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={clearChat}
          messageCount={messages.filter(m => m.role === "user").length}
          attachedImages={attachedImages}
        />
      </div>
    </TooltipProvider>
  );
});

ChatPanel.displayName = "ChatPanel";

export default ChatPanel;

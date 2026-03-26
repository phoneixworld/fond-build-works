import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { extractDocxStructured } from "@/lib/docxExtractor";
import { useSelfHealing } from "@/hooks/useSelfHealing";
import { useProjectContextCache } from "@/hooks/useProjectContextCache";
import { useIntentClassification } from "@/hooks/useIntentClassification";
import { useBuildOrchestration } from "@/hooks/useBuildOrchestration";
import { useConversationState } from "@/hooks/useConversationState";
import { Version } from "@/components/VersionHistory";
import { Zap, ArrowDown } from "lucide-react";
import { AI_MODELS, DEFAULT_MODEL, type AIModelId } from "@/lib/aiModels";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { motion, AnimatePresence } from "framer-motion";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import { supabase } from "@/integrations/supabase/client";

import ChatMessageList from "@/components/chat/ChatMessageList";
import BuildPipelineCard from "@/components/chat/BuildPipelineCard";
import BuildCompletionCard from "@/components/chat/BuildCompletionCard";
import ClarifyingQuestions from "@/components/chat/ClarifyingQuestions";
import ChatInput from "@/components/chat/ChatInput";
import ChatWelcomeScreen from "@/components/chat/ChatWelcomeScreen";
import ChatStatusBanners from "@/components/chat/ChatStatusBanners";
import ChatModeIndicator from "@/components/chat/ChatModeIndicator";
import StreamingIndicator from "@/components/chat/StreamingIndicator";
import ErrorRecoveryBanner from "@/components/chat/ErrorRecoveryBanner";
import ChatSmartSuggestions from "@/components/chat/ChatSmartSuggestions";
import {
  type MsgContent,
  getTextContent,
  fileToDataUrl,
} from "@/lib/codeParser";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { ImagePlus } from "lucide-react";

type MsgMeta = { tokens?: number; durationMs?: number; model?: string };
type Msg = { role: "user" | "assistant"; content: MsgContent; timestamp?: number; meta?: MsgMeta };

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

export interface ChatPanelHandle {
  clearChat: () => void;
  sendMessage: (text: string) => void;
}

const ChatPanel = forwardRef<ChatPanelHandle, { initialPrompt?: string; onVersionCreated?: (version: Version) => void }>(({ initialPrompt, onVersionCreated }, ref) => {
  const { currentProject, saveProject } = useProjects();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModelId>(DEFAULT_MODEL);
  const [selectedTheme, setSelectedTheme] = useState<string>("minimal");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedDocuments, setAttachedDocuments] = useState<{ name: string; text: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Follow-up questions state
  const [followUpQuestions, setFollowUpQuestions] = useState<any[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingFollowUpPrompt, setPendingFollowUpPrompt] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Edit/regenerate state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasProcessedInitialRef = useRef(false);

  const { previewHtml: currentPreviewHtml, sandpackFiles: currentSandpackFiles, setPreviewHtml, setIsBuilding, setBuildStep, setSandpackFiles, setSandpackDeps, setPreviewMode, setBuildMetrics, saveSnapshot } = usePreview();
  const { setFiles: setVirtualFiles } = useVirtualFS();

  // Undo/Redo system
  const { createCheckpoint, undo, redo, canUndo, canRedo } = useUndoRedo();

  // Refs to break circular dependency between hooks
  const resetHealingRef = useRef<() => void>(() => {});
  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const setPipelineStepRef = useRef<(step: any) => void>(() => {});
  const setPipelineStepProxy = useCallback((step: any) => setPipelineStepRef.current(step), []);

  // Project context cache hook
  const { fetchProjectContext, invalidateCache: invalidateContextCache } = useProjectContextCache(currentProject?.id);

  // Conversation state machine
  const conversationState = useConversationState();

  // Intent classification hook
  const { classifyUserIntent, fastClassifyLocal } = useIntentClassification(
    currentSandpackFiles,
    currentPreviewHtml,
    messages.length,
    setPipelineStepProxy,
  );

  // Real refs for self-healing timing guards (wired to orchestrator state below)
  const selfHealSendingRef = useRef(false);
  const selfHealLoadingRef = useRef(false);
  const selfHealSandpackRef = useRef<Record<string, string> | null>(currentSandpackFiles);
  // Keep sandpack ref in sync
  useEffect(() => { selfHealSandpackRef.current = currentSandpackFiles; }, [currentSandpackFiles]);

  // Surgical edit ref — wired after build orchestration is initialized
  const sendEditRef = useRef<(text: string) => void>(() => {});

  // Self-healing hook (declared first, uses sendMessage ref)
  const {
    previewErrors, setPreviewErrors,
    healAttempts, setHealAttempts,
    isHealing, healingStatus,
    handleAutoFix,
    resetHealing,
    MAX_HEAL_ATTEMPTS,
  } = useSelfHealing({
    isBuildingValue: usePreview().isBuilding,
    isLoading: false,
    sandpackFilesRef: selfHealSandpackRef,
    isSendingRef: selfHealSendingRef,
    isLoadingRef: selfHealLoadingRef,
    sendMessage: (text: string) => sendMessageRef.current(text),
    sendEditMessage: (text: string) => sendEditRef.current(text),
  });

  // Keep ref in sync
  useEffect(() => { resetHealingRef.current = resetHealing; }, [resetHealing]);

  // Memoize conversation callbacks to prevent cascading re-renders
  const stableSetPreviewErrors = useCallback((errs: any) => setPreviewErrors(errs), [setPreviewErrors]);
  const stableSetHealAttempts = useCallback((n: number) => setHealAttempts(n), [setHealAttempts]);
  const stableResetHealing = useCallback(() => resetHealingRef.current(), []);

  const conversationAnalyzeAsyncCb = useCallback(async (text: string, hasImages: boolean, _hasExistingCode: boolean) => {
    return conversationState.analyzeMessage(text, hasImages);
  }, [conversationState.analyzeMessage]);

  const conversationAddPhaseCb = useCallback((text: string, hasImages: boolean, imageUrls?: string[]) => {
    const localPhase = {
      id: Date.now(), // Use timestamp for unique ID instead of phases.length (avoids stale closure)
      summary: text.slice(0, 200).replace(/\n/g, " "),
      rawText: text,
      hasImages,
      timestamp: Date.now(),
    };
    conversationState.addPhase(text, hasImages, currentProject?.ir_state, imageUrls);
    return localPhase;
  }, [conversationState.addPhase, currentProject?.ir_state]);

  const conversationGetRequirementsCb = useCallback(
    () => conversationState.getRequirementsContext(currentProject?.ir_state),
    [conversationState.getRequirementsContext, currentProject?.ir_state]
  );

  const conversationStartBuildingCb = useCallback(() => {
    conversationState.startBuilding();
  }, [conversationState.startBuilding]);

  // Build orchestration hook
  const buildOrch = useBuildOrchestration({
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
    setPreviewErrors: stableSetPreviewErrors,
    setHealAttempts: stableSetHealAttempts,
    resetHealing: stableResetHealing,
    inputRef,
    selectedModel,
    selectedTheme,
    fetchProjectContext,
    classifyUserIntent,
    fastClassifyLocal,
    // Conversation state machine — all stable references
    conversationAnalyzeAsync: conversationAnalyzeAsyncCb,
    conversationAddPhase: conversationAddPhaseCb,
    conversationGetRequirements: conversationGetRequirementsCb,
    conversationStartBuilding: conversationStartBuildingCb,
    conversationStartEditing: conversationState.startEditing,
    conversationCompleteEdit: conversationState.completeEdit,
    conversationCompleteBuild: conversationState.completeBuild,
    conversationGenerateAck: conversationState.generateAcknowledgment,
    conversationMode: conversationState.mode,
  });

  const {
    isLoading, buildStreamContent, currentAgent, pipelineStep, setPipelineStep,
    currentPlan, currentTaskIndex, totalPlanTasks,
    selectedTemplate, setSelectedTemplate, buildRetryCount,
    compilerTasks,
    isSendingRef, isLoadingRef, messagesRef, sandpackFilesRef, abortControllerRef, lastProjectIdRef,
    lastVerificationOkRef,
    sendMessage, sendChatMessage, handleSmartSend, clearChat: orchClearChat, abortBuild,
    syncSandpackToVirtualFS,
    setCurrentAgent, setCurrentPlan, setCurrentTaskIndex, setTotalPlanTasks,
    setBuildStreamContent, setBuildRetryCount, setPendingBuildPrompt, setIsLoading,
  } = buildOrch;

  // Sync refs after both hooks are initialized
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { setPipelineStepRef.current = setPipelineStep; }, [setPipelineStep]);

  // Wire self-healing guard refs to real orchestrator state
  useEffect(() => { selfHealSendingRef.current = isSendingRef.current; }, [isLoading]);
  useEffect(() => { selfHealLoadingRef.current = isLoading; }, [isLoading]);
  // Wire surgical edit path for self-healing (sendMessage is the fallback, but edit is preferred)
  useEffect(() => { sendEditRef.current = sendMessage; }, [sendMessage]);

  const handleClearChat = useCallback(() => {
    orchClearChat();
    conversationState.reset();
  }, [orchClearChat, conversationState]);

  // Expose handle
  useImperativeHandle(ref, () => ({ clearChat: handleClearChat, sendMessage: (text: string) => handleSmartSend(text) }), [handleClearChat, handleSmartSend]);

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
  }, [handleSmartSend]);

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

  // Auto-create checkpoint and record build completion when build completes
  const prevPipelineStep = useRef<any>(null);
  useEffect(() => {
    if (prevPipelineStep.current !== "complete" && pipelineStep === "complete") {
      const lastUserMsg = messagesRef.current.filter(m => m.role === "user").pop();
      const label = lastUserMsg ? (typeof lastUserMsg.content === "string" ? lastUserMsg.content.slice(0, 40) : "Build") : "Build";
      createCheckpoint(label, currentPreviewHtml || "", sandpackFilesRef.current);

      // Record build completion in conversation state
      const filesChanged = sandpackFilesRef.current ? Object.keys(sandpackFilesRef.current) : [];
      const lastAssistant = messagesRef.current.filter(m => m.role === "assistant").pop();
      const chatSummary = lastAssistant ? (typeof lastAssistant.content === "string" ? lastAssistant.content.slice(0, 200) : "Build completed") : "Build completed";
      conversationState.completeBuild({
        filesChanged,
        totalFiles: filesChanged.length,
        chatSummary: chatSummary.replace(/```[\s\S]*?```/g, "").trim().slice(0, 150),
        timestamp: Date.now(),
        verificationOk: lastVerificationOkRef.current ?? undefined,
        previewUrl: null, // Will be updated async via event
      });
    }
    prevPipelineStep.current = pipelineStep;
  }, [pipelineStep, createCheckpoint]);

  // Listen for async preview URL from build orchestration
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail) {
        conversationState.updateBuildPreviewUrl(e.detail);
      }
    };
    window.addEventListener("build-preview-url", handler as EventListener);
    return () => window.removeEventListener("build-preview-url", handler as EventListener);
  }, [conversationState.updateBuildPreviewUrl]);

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

  // Scroll detection
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

  // Auto-scroll
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

  // Follow-up answers
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
    setCurrentAgent("build");
    setPipelineStep("planning");
    setTimeout(() => handleSmartSend(enrichedPrompt), 0);
  }, [followUpQuestions, followUpAnswers, pendingFollowUpPrompt, handleSmartSend, setCurrentAgent, setPipelineStep]);

  const skipFollowUpQuestions = useCallback(() => {
    const prompt = pendingFollowUpPrompt;
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setPendingFollowUpPrompt("");
    setAnalysisResult(null);
    setCurrentAgent("build");
    setPipelineStep("planning");
    setTimeout(() => handleSmartSend(prompt), 0);
  }, [pendingFollowUpPrompt, handleSmartSend, setCurrentAgent, setPipelineStep]);

  // Initial prompt
  useEffect(() => {
    if (initialPrompt && !hasProcessedInitialRef.current) {
      hasProcessedInitialRef.current = true;
      setPendingPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  // Project switch
  useEffect(() => {
    if (currentProject && currentProject.id !== lastProjectIdRef.current) {
      // CRITICAL: Set lastProjectIdRef FIRST to block any in-flight build callbacks
      // from the previous project before doing anything else
      const previousProjectId = lastProjectIdRef.current;
      lastProjectIdRef.current = currentProject.id;
      // Sync conversation state project ID immediately (before async restore)
      conversationState.currentProjectId.current = currentProject.id;
      
      // Abort any in-flight builds from previous project
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isSendingRef.current = false;
      isLoadingRef.current = false;
      
      // Force stop building state to prevent stale callbacks
      setIsBuilding(false);
      setBuildStep("");
      
      // Use chat_history from project object as initial value
      const history = Array.isArray(currentProject.chat_history) ? currentProject.chat_history : [];
      setMessages(history);
      setPreviewHtml(currentProject.html_content || "");
      setSandpackFiles(null);
      setSandpackDeps({});
      setPreviewMode("html");
      setPreviewErrors([]);
      setAttachedImages([]);
      setAttachedDocuments([]);
      setVirtualFiles({});
      setHealAttempts(0);
      resetHealing();
      setBuildStreamContent("");
      setCurrentPlan(null);
      setCurrentTaskIndex(0);
      setTotalPlanTasks(0);
      setCurrentAgent(null);
      setPipelineStep(null);
      setBuildRetryCount(0);
      setFollowUpQuestions([]);
      setFollowUpAnswers({});
      setPendingFollowUpPrompt("");
      setAnalysisResult(null);
      invalidateContextCache();
      // Don't destructively reset server state on project switch — restore instead

      // Restore conversation state from server (durable, cross-device)
      conversationState.restoreFromServer(currentProject.id);

      // Restore persisted sandpack state
      const restoreProjectId = currentProject.id;
      supabase
        .from("project_data")
        .select("data")
        .eq("project_id", restoreProjectId)
        .eq("collection", "sandpack_state")
        .maybeSingle()
        .then(({ data: row }) => {
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

      // Always re-fetch chat_history from DB to ensure freshest data
      supabase
        .from("projects")
        .select("chat_history, html_content")
        .eq("id", restoreProjectId)
        .maybeSingle()
        .then(({ data: row, error }) => {
          if (lastProjectIdRef.current !== restoreProjectId) return;
          if (error) {
            console.error("[ChatPanel] Failed to fetch fresh project data:", error);
            return;
          }
          if (row) {
            const freshHistory = Array.isArray(row.chat_history) ? row.chat_history : [];
            if (freshHistory.length > 0) {
              console.log("[ChatPanel] ✅ Restored chat history:", freshHistory.length, "messages");
              setMessages(freshHistory as any);
            }
            if (row.html_content) {
              setPreviewHtml(row.html_content);
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
      setAttachedDocuments([]);
      setVirtualFiles({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, setPreviewHtml]);

  // Paste handler
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

  const DOCUMENT_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  const addDocumentFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) return; // 20MB limit
    try {
      let text: string;
      const isDocx = file.name.toLowerCase().endsWith(".docx") ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      if (isDocx) {
        const result = await extractDocxStructured(file);
        // Format as structured context with metadata header
        const header = `## Document: ${result.title}\n**Sections:** ${result.headings.length} headings | **Length:** ${result.charCount} chars\n\n`;
        text = header + result.structuredText;
      } else {
        // For PDF and .doc, read as text (best effort) — binary will show fallback
        text = await file.text();
        // If it looks like binary garbage, provide a helpful message
        if (text.includes("\x00") || text.includes("PK!")) {
          text = `[Binary document: ${file.name} — please convert to .docx for best results]`;
        }
      }
      setAttachedDocuments((prev) => [...prev.slice(0, 2), { name: file.name, text: text.slice(0, 80000) }]);
    } catch (err: any) {
      const errorMsg = err?.message || `Could not extract text from: ${file.name}`;
      alert(errorMsg);
      console.error("[addDocumentFile]", errorMsg);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        await addImageFile(file);
      } else if (DOCUMENT_TYPES.includes(file.type) || /\.(pdf|docx?|doc)$/i.test(file.name)) {
        await addDocumentFile(file);
      }
    }
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        await addImageFile(file);
      } else if (DOCUMENT_TYPES.includes(file.type) || /\.(pdf|docx?|doc)$/i.test(file.name)) {
        await addDocumentFile(file);
      }
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  // pendingPrompt effect — route through handleSmartSend so conversation state machine can intercept
  useEffect(() => {
    if (pendingPrompt && currentProject && !isLoadingRef.current && !isSendingRef.current && messagesRef.current.length === 0) {
      const prompt = pendingPrompt;
      setPendingPrompt(null);
      handleSmartSend(prompt);
    }
  }, [pendingPrompt, currentProject, handleSmartSend]);

  useEffect(() => {
    // Double-tap scroll: immediate + delayed to handle DOM updates
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    const t = setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 100);
    return () => clearTimeout(t);
  }, [messages]);

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
    setTimeout(() => handleSmartSend(editText.trim()), 50);
  }, [editingIndex, editText, currentProject, handleSmartSend]);

  const handleRegenerate = useCallback((index: number) => {
    if (isLoadingRef.current || !currentProject) return;
    const msgs = messagesRef.current;
    let userMsgIndex = index - 1;
    while (userMsgIndex >= 0 && msgs[userMsgIndex].role !== "user") userMsgIndex--;
    if (userMsgIndex < 0) return;
    const userText = getTextContent(msgs[userMsgIndex].content);
    const truncated = msgs.slice(0, index);
    setMessages(truncated);
    setTimeout(() => handleSmartSend(userText), 50);
  }, [currentProject, handleSmartSend]);

  /**
   * Send a message with document attachments.
   * The display message shows compact labels (📎 filename),
   * while the pipeline receives the full structured document context.
   */
  const sendWithDocuments = useCallback((userInput: string, docs: typeof attachedDocuments, images: string[]) => {
    const docNames = docs.map(d => d.name);
    const displayLabel = docNames.map(n => `📎 ${n}`).join("\n");
    const cleanDisplay = `${displayLabel}\n${userInput}`.trim();

    // Build the full context for the pipeline (not shown in chat)
    const docContext = docs.map(d =>
      `=== DOCUMENT: ${d.name} ===\n${d.text}\n=== END DOCUMENT ===`
    ).join("\n\n");
    const fullPrompt = `${docContext}\n\n${userInput}`;

    // ── CRITICAL FIX: Store document text as a requirement phase ──
    // This ensures the document context survives into the build pipeline
    // even if the user confirms later with "go ahead" (which wouldn't carry the doc text).
    for (const doc of docs) {
      if (doc.text && doc.text.length > 50) {
        const docPhaseText = `[Uploaded Document: ${doc.name}]\n\n${doc.text}`;
        conversationAddPhaseCb(docPhaseText, false);
        console.log(`[ChatPanel] Stored document "${doc.name}" as requirement phase (${doc.text.length} chars)`);
      }
    }
    // Also store the user's accompanying text as a phase if substantive
    if (userInput && userInput.length > 10) {
      conversationAddPhaseCb(userInput, images.length > 0, images.length > 0 ? images : undefined);
    }

    // Add the clean display message FIRST so it's immediately visible
    const displayMsg: Msg = { role: "user", content: cleanDisplay, timestamp: Date.now() };
    setMessages(prev => [...prev, displayMsg]);

    // Send the full context to the pipeline
    handleSmartSend(fullPrompt, images);

    // Immediately fix — no setTimeout race condition
    setMessages(prev => {
      const updated = [...prev];
      // Find the last two user messages — one is our display msg, one from handleSmartSend
      let fixCount = 0;
      for (let i = updated.length - 1; i >= 0 && fixCount < 2; i--) {
        if (updated[i].role === "user") {
          if (fixCount === 0) {
            // This is the handleSmartSend message — replace with clean display
            updated[i] = { ...updated[i], content: cleanDisplay };
          } else {
            // This is our pre-added display message — remove the duplicate
            updated.splice(i, 1);
          }
          fixCount++;
        }
      }
      return updated;
    });
  }, [handleSmartSend, conversationAddPhaseCb]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || attachedImages.length > 0 || attachedDocuments.length > 0) {
        if (attachedDocuments.length > 0) {
          sendWithDocuments(input.trim(), attachedDocuments, attachedImages);
        } else {
          handleSmartSend(input.trim(), attachedImages);
        }
        setAttachedDocuments([]);
      }
    }
  };

  const handleSendClick = () => {
    if (input.trim() || attachedImages.length > 0 || attachedDocuments.length > 0) {
      if (attachedDocuments.length > 0) {
        sendWithDocuments(input.trim(), attachedDocuments, attachedImages);
      } else {
        handleSmartSend(input.trim(), attachedImages);
      }
      setAttachedDocuments([]);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`flex flex-col h-full bg-[hsl(var(--ide-panel))] relative ${isDragOver ? "ring-2 ring-primary ring-inset" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Mode indicator */}
        <ChatModeIndicator
          currentAgent={currentAgent}
          isLoading={isLoading}
          isAnalyzing={isAnalyzing}
          pipelineStep={pipelineStep}
          messageCount={messages.length}
        />
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
            <ChatWelcomeScreen
              onSend={handleSmartSend}
              selectedTemplate={selectedTemplate}
              onSelectTemplate={setSelectedTemplate}
            />
          )}

          {pendingPrompt && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                <Zap className="w-8 h-8 text-primary" />
              </motion.div>
              <p className="text-xs font-medium">Starting build...</p>
            </div>
          )}

          <ChatMessageList
            messages={messages}
            isLoading={isLoading}
            onSmartSend={handleSmartSend}
            onEditMessage={handleEditMessage}
            onRegenerate={handleRegenerate}
            editingIndex={editingIndex}
            editText={editText}
            onEditTextChange={setEditText}
            onSubmitEdit={handleSubmitEdit}
            onCancelEdit={handleCancelEdit}
          />

          {/* Build Pipeline Progress Card — only for build/edit agents, never chat-only */}
          {(currentAgent === "build" || currentAgent === "edit") && (buildStreamContent.length > 0 || compilerTasks.length > 0) && (isLoading || pipelineStep === "complete") && (
            <BuildPipelineCard
              isBuilding={isLoading}
              streamContent={buildStreamContent}
              tasks={compilerTasks.length > 0 ? compilerTasks : undefined}
              pipelineStep={pipelineStep}
              currentAgent={currentAgent as "build" | "edit" | null}
              onShowPreview={() => {
                const event = new CustomEvent("switch-panel", { detail: "preview" });
                window.dispatchEvent(event);
              }}
            />
          )}

          {/* Build Completion Card — only when a real build produced file changes */}
          {!isLoading && pipelineStep === "complete" && conversationState.lastBuildResult && conversationState.lastBuildResult.filesChanged.length > 0 && (
            <BuildCompletionCard
              result={conversationState.lastBuildResult}
              phases={conversationState.phases.length > 0 ? conversationState.phases : undefined}
              previewUrl={conversationState.lastBuildResult.previewUrl}
              onViewPreview={() => {
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
                  handleSmartSend(enrichedPrompt);
                }}
                onSkip={skipFollowUpQuestions}
              />
            )}
          </AnimatePresence>

          {/* Streaming/analyzing indicator */}
          <AnimatePresence>
            <StreamingIndicator
              isStreaming={isAnalyzing || (isLoading && currentAgent === "chat")}
              streamContent={buildStreamContent}
              agentLabel="Phoneix"
            />
          </AnimatePresence>
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

        {/* Error recovery banner (improved) */}
        <ErrorRecoveryBanner
          errors={previewErrors}
          healAttempts={healAttempts}
          maxHealAttempts={MAX_HEAL_ATTEMPTS}
          onAutoFix={handleAutoFix}
          onResetAndFix={() => { setHealAttempts(0); handleAutoFix(); }}
          isLoading={isLoading}
        />

        {/* Status banners (healing, template chip, attached images) */}
        <ChatStatusBanners
          isHealing={isHealing}
          healingStatus={healingStatus}
          previewErrors={[]}
          isLoading={isLoading}
          healAttempts={healAttempts}
          maxHealAttempts={MAX_HEAL_ATTEMPTS}
          onAutoFix={handleAutoFix}
          onResetAndFix={() => { setHealAttempts(0); handleAutoFix(); }}
          selectedTemplate={selectedTemplate}
          onClearTemplate={() => setSelectedTemplate(null)}
          attachedImages={attachedImages}
          onRemoveImage={removeImage}
          attachedDocuments={attachedDocuments}
          onRemoveDocument={(i) => setAttachedDocuments(prev => prev.filter((_, idx) => idx !== i))}
        />

        {/* Smart context-aware suggestions */}
        <ChatSmartSuggestions
          codeForAnalysis={currentPreviewHtml || (currentSandpackFiles ? Object.values(currentSandpackFiles).join("\n") : "")}
          messages={messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" }))}
          onSend={handleSmartSend}
          isLoading={isLoading}
          hasFollowUp={followUpQuestions.length > 0}
          hasInput={!!input}
        />

        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={handleSendClick}
          onKeyDown={handleKeyDown}
          isLoading={isLoading}
          onStop={abortBuild}
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
          onClear={handleClearChat}
          messageCount={messages.filter(m => m.role === "user").length}
          attachedImages={attachedImages}
        />
      </div>
    </TooltipProvider>
  );
});

ChatPanel.displayName = "ChatPanel";

export default ChatPanel;

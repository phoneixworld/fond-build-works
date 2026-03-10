import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useSelfHealing } from "@/hooks/useSelfHealing";
import { useProjectContextCache } from "@/hooks/useProjectContextCache";
import { useIntentClassification } from "@/hooks/useIntentClassification";
import { useBuildOrchestration } from "@/hooks/useBuildOrchestration";
import { Version } from "@/components/VersionHistory";
import { User, Sparkles, Zap, ArrowDown } from "lucide-react";
import { AI_MODELS, DEFAULT_MODEL, type AIModelId } from "@/lib/aiModels";
import { generateSmartSuggestions } from "@/lib/smartSuggestions";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { motion, AnimatePresence } from "framer-motion";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS } from "@/contexts/VirtualFSContext";
import { supabase } from "@/integrations/supabase/client";
import ChatMessage from "@/components/chat/ChatMessage";
import BuildPipelineCard from "@/components/chat/BuildPipelineCard";
import ClarifyingQuestions from "@/components/chat/ClarifyingQuestions";
import ChatInput from "@/components/chat/ChatInput";
import ChatWelcomeScreen from "@/components/chat/ChatWelcomeScreen";
import ChatStatusBanners from "@/components/chat/ChatStatusBanners";
import {
  type MsgContent,
  getTextContent,
  fileToDataUrl,
} from "@/lib/codeParser";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { ImagePlus } from "lucide-react";

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
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModelId>(DEFAULT_MODEL);
  const [selectedTheme, setSelectedTheme] = useState<string>("minimal");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
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

  // Intent classification hook
  const { classifyUserIntent, fastClassifyLocal } = useIntentClassification(
    currentSandpackFiles,
    currentPreviewHtml,
    messages.length,
    setPipelineStepProxy,
  );

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
    sandpackFilesRef: { current: currentSandpackFiles } as React.RefObject<Record<string, string> | null>,
    isSendingRef: { current: false } as React.RefObject<boolean>,
    isLoadingRef: { current: false } as React.RefObject<boolean>,
    sendMessage: (text: string) => sendMessageRef.current(text),
  });

  // Keep ref in sync
  useEffect(() => { resetHealingRef.current = resetHealing; }, [resetHealing]);

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
    setPreviewErrors: (errs: any) => setPreviewErrors(errs),
    setHealAttempts: (n: number) => setHealAttempts(n),
    resetHealing: () => resetHealingRef.current(),
    inputRef,
    selectedModel,
    selectedTheme,
    fetchProjectContext,
    classifyUserIntent,
    fastClassifyLocal,
  });

  const {
    isLoading, buildStreamContent, currentAgent, pipelineStep, setPipelineStep,
    currentPlan, currentTaskIndex, totalPlanTasks,
    selectedTemplate, setSelectedTemplate, buildRetryCount,
    isSendingRef, isLoadingRef, messagesRef, sandpackFilesRef, abortControllerRef, lastProjectIdRef,
    sendMessage, sendChatMessage, handleSmartSend, clearChat: orchClearChat, abortBuild,
    syncSandpackToVirtualFS,
    setCurrentAgent, setCurrentPlan, setCurrentTaskIndex, setTotalPlanTasks,
    setBuildStreamContent, setBuildRetryCount, setPendingBuildPrompt, setIsLoading,
  } = buildOrch;

  // Sync refs after both hooks are initialized
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { setPipelineStepRef.current = setPipelineStep; }, [setPipelineStep]);

  // Expose handle
  useImperativeHandle(ref, () => ({ clearChat: orchClearChat, sendMessage: (text: string) => sendMessage(text) }), [orchClearChat, sendMessage]);

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

  // Auto-create checkpoint when build completes
  const prevPipelineStep = useRef<any>(null);
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
    setTimeout(() => sendMessage(enrichedPrompt), 0);
  }, [followUpQuestions, followUpAnswers, pendingFollowUpPrompt, sendMessage, setCurrentAgent, setPipelineStep]);

  const skipFollowUpQuestions = useCallback(() => {
    const prompt = pendingFollowUpPrompt;
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setPendingFollowUpPrompt("");
    setAnalysisResult(null);
    setCurrentAgent("build");
    setPipelineStep("planning");
    setTimeout(() => sendMessage(prompt), 0);
  }, [pendingFollowUpPrompt, sendMessage, setCurrentAgent, setPipelineStep]);

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
      lastProjectIdRef.current = currentProject.id;
      // Use chat_history from project object as initial value
      const history = Array.isArray(currentProject.chat_history) ? currentProject.chat_history : [];
      setMessages(history);
      setPreviewHtml(currentProject.html_content || "");
      setSandpackFiles(null);
      setSandpackDeps({});
      setPreviewMode("html");
      setPreviewErrors([]);
      setAttachedImages([]);
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isSendingRef.current = false;

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

  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  // pendingPrompt effect
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || attachedImages.length > 0) {
        handleSmartSend(input.trim(), attachedImages);
      }
    }
  };

  const handleSendClick = () => {
    if (input.trim() || attachedImages.length > 0) {
      handleSmartSend(input.trim(), attachedImages);
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

          {/* Build Pipeline Progress Card */}
          {(buildStreamContent.length > 0 || currentAgent) && (isLoading || pipelineStep === "complete") && (
            <BuildPipelineCard
              isBuilding={isLoading}
              streamContent={buildStreamContent}
              pipelineStep={pipelineStep}
              currentAgent={currentAgent === "clarify" ? null : currentAgent}
              onShowPreview={() => {
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

        {/* Status banners (healing, errors, template chip, attached images) */}
        <ChatStatusBanners
          isHealing={isHealing}
          healingStatus={healingStatus}
          previewErrors={previewErrors}
          isLoading={isLoading}
          healAttempts={healAttempts}
          maxHealAttempts={MAX_HEAL_ATTEMPTS}
          onAutoFix={handleAutoFix}
          onResetAndFix={() => { setHealAttempts(0); handleAutoFix(); }}
          selectedTemplate={selectedTemplate}
          onClearTemplate={() => setSelectedTemplate(null)}
          attachedImages={attachedImages}
          onRemoveImage={removeImage}
        />

        {/* Smart context-aware suggestions */}
        {!isLoading && followUpQuestions.length === 0 && !input && (
          <div className="px-3 pt-2 pb-1">
            <div className="flex flex-wrap gap-1.5">
              {(() => {
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
          onClear={orchClearChat}
          messageCount={messages.filter(m => m.role === "user").length}
          attachedImages={attachedImages}
        />
      </div>
    </TooltipProvider>
  );
});

ChatPanel.displayName = "ChatPanel";

export default ChatPanel;

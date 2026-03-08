import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { Version } from "@/components/VersionHistory";
import { Send, Bot, User, ChevronDown, Sparkles, AlertTriangle, Wand2, ImagePlus, X, Palette, ArrowDown, Clock, Zap, Trash2, ShieldCheck, MessageSquareMore, CheckCircle2, Pencil, RotateCcw, Upload } from "lucide-react";
import { streamChat } from "@/lib/streamChat";
import { AI_MODELS, DEFAULT_MODEL, PROMPT_SUGGESTIONS, QUICK_ACTIONS, DESIGN_THEMES, type AIModelId } from "@/lib/aiModels";
import { motion, AnimatePresence } from "framer-motion";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { useVirtualFS, parseMultiFileOutput } from "@/contexts/VirtualFSContext";
import { supabase } from "@/integrations/supabase/client";
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
  // Try html-preview first, then fall back to plain html fence
  let fenceStart = text.indexOf("```html-preview");
  if (fenceStart === -1) fenceStart = text.indexOf("```html");
  if (fenceStart === -1) return [text, null];
  const chatPart = text.slice(0, fenceStart).trim();
  const codeStart = text.indexOf("\n", fenceStart) + 1;
  const fenceEnd = text.indexOf("```", codeStart);
  const htmlCode = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  return [chatPart, htmlCode.trim()];
}

function postProcessHtml(html: string): string {
  if (!html) return html;
  const injections: string[] = [];
  if (!html.includes('scroll-behavior')) {
    injections.push('<style>html{scroll-behavior:smooth}*{-webkit-tap-highlight-color:transparent}::selection{background:rgba(99,102,241,0.2)}img{max-width:100%;height:auto}</style>');
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
  const { setPreviewHtml, setIsBuilding, setBuildStep } = usePreview();
  const lastProjectIdRef = useRef<string | null>(null);
  const hasProcessedInitialRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_HEAL_ATTEMPTS = 3;
  // Edit/regenerate state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

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

  // Self-healing: auto-trigger fix when errors detected after build
  useEffect(() => {
    if (healTimeoutRef.current) {
      clearTimeout(healTimeoutRef.current);
      healTimeoutRef.current = null;
    }
    if (previewErrors.length > 0 && !isLoading && !isHealing && healAttempts < MAX_HEAL_ATTEMPTS && messages.length > 0) {
      healTimeoutRef.current = setTimeout(() => {
        triggerSelfHeal();
      }, 3000); // Wait 3s for errors to accumulate
    }
    return () => {
      if (healTimeoutRef.current) clearTimeout(healTimeoutRef.current);
    };
  }, [previewErrors, isLoading, isHealing, healAttempts, messages.length]);

  const triggerSelfHeal = useCallback(() => {
    if (isLoading || isHealing || healAttempts >= MAX_HEAL_ATTEMPTS || previewErrors.length === 0) return;
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
  }, [isLoading, isHealing, healAttempts, previewErrors]);

  // Analyze prompt for follow-up questions
  const analyzePrompt = useCallback(async (prompt: string): Promise<boolean> => {
    // Skip analysis for follow-up messages, modifications, or short prompts
    if (messages.length > 0 || prompt.length < 20) return false;
    
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
        return true; // Questions need answering
      }
      setIsAnalyzing(false);
      return false; // Build immediately
    } catch {
      setIsAnalyzing(false);
      return false;
    }
  }, [messages.length]);

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
    } else if (!currentProject) {
      lastProjectIdRef.current = null;
      setMessages([]);
      setPreviewHtml("");
      setPreviewErrors([]);
      setAttachedImages([]);
    }
  }, [currentProject, setPreviewHtml]);

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

  // Upload image to storage for use in generated apps (returns public URL)
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
    setMessages([]);
    setPreviewHtml("");
    setPreviewErrors([]);
    saveProject({ chat_history: [], html_content: "" });
  }, [currentProject, isLoading, setPreviewHtml, saveProject]);

  useImperativeHandle(ref, () => ({ clearChat }), [clearChat]);

  const sendMessage = useCallback(async (text: string, images: string[] = []) => {
    if (!text || isLoading || !currentProject) return;

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
    setIsBuilding(true);
    setBuildStep(images.length > 0 ? "Analyzing your image..." : "Understanding your request...");

    let fullResponse = "";
    let hasSetAnalyzing = false;
    let hasSetBuilding = false;

    const upsert = (chunk: string) => {
      fullResponse += chunk;
      const [chatText, htmlCode] = parseResponse(fullResponse);

      if (!hasSetAnalyzing && fullResponse.length > 20) {
        setBuildStep("Generating components...");
        hasSetAnalyzing = true;
      }
      if (!hasSetBuilding && htmlCode) {
        setBuildStep("Building your app...");
        hasSetBuilding = true;
      }
      if (htmlCode) setPreviewHtml(postProcessHtml(htmlCode));

      setMessages((prev) => {
        const displayText = chatText || "Building...";
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: displayText } : m));
        }
        return [...prev, { role: "assistant", content: displayText, timestamp: Date.now() }];
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

      const apiMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const themeInfo = DESIGN_THEMES.find(t => t.id === selectedTheme);
      
      await streamChat({
        messages: apiMessages,
        projectId: currentProject.id,
        techStack: currentProject.tech_stack || "html-tailwind",
        schemas,
        model: selectedModel,
        designTheme: themeInfo?.prompt,
        knowledge,
        onDelta: upsert,
        onDone: () => {
          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");

          const [chatText, htmlCode] = parseResponse(fullResponse);
          if (htmlCode) setPreviewHtml(postProcessHtml(htmlCode));

          // Create version snapshot
          if (htmlCode && onVersionCreated) {
            const userPrompt = getTextContent(userMsg.content);
            onVersionCreated({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              label: userPrompt.slice(0, 60) || "Build update",
              html: postProcessHtml(htmlCode),
              messageIndex: messages.length,
            });
          }

          setMessages((prev) => {
            const final = chatText
              ? prev.map((m, i) => (i === prev.length - 1 && m.role === "assistant" ? { ...m, content: chatText } : m))
              : prev;

            const persistMessages = final.map(m => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : getTextContent(m.content),
            }));

            // AI-generate project name on first message
            const isFirstMessage = persistMessages.filter(m => m.role === "user").length === 1;
            
            if (isFirstMessage && currentProject.name === "Untitled Project") {
              // Fire and forget AI name generation
              fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/project-name`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
                body: JSON.stringify({ prompt: persistMessages[0].content }),
              })
                .then(r => r.json())
                .then(({ name, emoji }) => {
                  const fullName = emoji ? `${emoji} ${name}` : name;
                  saveProject({ name: fullName });
                })
                .catch(() => {
                  // Fallback to truncated prompt
                  saveProject({ name: persistMessages[0].content.slice(0, 40) });
                });
            }

            saveProject({
              chat_history: persistMessages,
              html_content: htmlCode || currentProject.html_content || "",
            });

            return final;
          });
        },
        onError: (err) => {
          setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, timestamp: Date.now() }]);
          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");
        },
      });
    } catch {
      setIsLoading(false);
      setIsBuilding(false);
      setBuildStep("");
    }
  }, [isLoading, messages, currentProject, saveProject, setPreviewHtml, setIsBuilding, setBuildStep, selectedModel, selectedTheme, onVersionCreated]);

  // Edit a previous user message and regenerate from that point
  const handleEditMessage = useCallback((index: number) => {
    const msg = messages[index];
    if (msg.role !== "user") return;
    setEditingIndex(index);
    setEditText(getTextContent(msg.content));
  }, [messages]);

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditText("");
  };

  const handleSubmitEdit = useCallback(() => {
    if (editingIndex === null || !editText.trim() || isLoading || !currentProject) return;
    const truncated = messages.slice(0, editingIndex);
    setMessages(truncated);
    setEditingIndex(null);
    setEditText("");
    sendMessage(editText.trim());
  }, [editingIndex, editText, isLoading, currentProject, messages, sendMessage]);

  const handleRegenerate = useCallback((index: number) => {
    if (isLoading || !currentProject) return;
    let userMsgIndex = index - 1;
    while (userMsgIndex >= 0 && messages[userMsgIndex].role !== "user") userMsgIndex--;
    if (userMsgIndex < 0) return;
    const userText = getTextContent(messages[userMsgIndex].content);
    const truncated = messages.slice(0, index);
    setMessages(truncated);
    sendMessage(userText);
  }, [isLoading, currentProject, messages, sendMessage]);

  useEffect(() => {
    if (pendingPrompt && currentProject && !isLoading && messages.length === 0) {
      const prompt = pendingPrompt;
      setPendingPrompt(null);
      sendMessage(prompt);
    }
  }, [pendingPrompt, currentProject, isLoading, messages.length, sendMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSmartSend = useCallback(async (text: string, images: string[] = []) => {
    if (!text && images.length === 0) return;
    const finalText = text || "Replicate this design";
    
    // Only analyze first message in a conversation (for new projects)
    if (messages.length === 0 && images.length === 0 && finalText.length >= 20) {
      const needsQuestions = await analyzePrompt(finalText);
      if (needsQuestions) return; // Questions are now shown, wait for answers
    }
    
    sendMessage(finalText, images);
  }, [messages.length, analyzePrompt, sendMessage]);

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
    setHealAttempts(0); // Manual fix resets counter
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
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
                      onClick={() => sendMessage(s.prompt)}
                      className="text-left px-3 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 hover:shadow-md hover:shadow-primary/5 transition-all group"
                    >
                      <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{s.label}</span>
                    </motion.button>
                  ))}
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
              const textContent = getTextContent(msg.content);
              const imageUrls = getImageUrls(msg.content);
              const isUser = msg.role === "user";
              const isEditing = editingIndex === i;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={`flex gap-3 group ${isUser ? "" : ""}`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isUser 
                      ? "bg-primary/15 ring-1 ring-primary/20" 
                      : "bg-accent/15 ring-1 ring-accent/20"
                  }`}>
                    {isUser ? <User className="w-3.5 h-3.5 text-primary" /> : <Bot className="w-3.5 h-3.5 text-accent" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">{isUser ? "You" : "Assistant"}</span>
                      {msg.timestamp && (
                        <span className="text-[10px] text-muted-foreground/40 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                          {formatTime(msg.timestamp)}
                        </span>
                      )}
                      {/* Edit/Regenerate buttons */}
                      {!isLoading && !isEditing && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                          {isUser && (
                            <button
                              onClick={() => handleEditMessage(i)}
                              className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-secondary transition-all"
                              title="Edit message"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          {!isUser && (
                            <button
                              onClick={() => handleRegenerate(i)}
                              className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-secondary transition-all"
                              title="Regenerate response"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {imageUrls.length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {imageUrls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt="Attached"
                            className="w-24 h-24 object-cover rounded-xl border border-border shadow-sm"
                          />
                        ))}
                      </div>
                    )}
                    {isEditing ? (
                      <div className="space-y-2">
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
                    ) : !isUser ? (
                      <div className="text-[13px] text-foreground leading-[1.7] prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-tight prose-ul:my-1.5 prose-li:my-0.5 prose-code:font-[JetBrains_Mono] prose-code:text-primary prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[12px] prose-pre:bg-secondary prose-pre:rounded-xl prose-pre:p-4 prose-pre:border prose-pre:border-border prose-pre:font-[JetBrains_Mono] prose-pre:text-[12px] prose-pre:leading-relaxed prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                        <ReactMarkdown>{textContent}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-[13px] text-foreground/90 leading-[1.7]">{textContent}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Enhanced loading indicator */}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="w-7 h-7 rounded-lg bg-accent/15 ring-1 ring-accent/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-accent" />
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.4s]" />
                </div>
                <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {elapsedTime}s
                </span>
              </div>
            </motion.div>
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
                  onClick={() => sendMessage(a.prompt)}
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
                      <span className="ml-1 text-muted-foreground">· auto-fixing in 3s ({healAttempts}/{MAX_HEAL_ATTEMPTS} attempts)</span>
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

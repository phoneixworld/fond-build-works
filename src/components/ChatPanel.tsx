import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, ChevronDown, Sparkles, AlertTriangle, Wand2 } from "lucide-react";
import { streamChat } from "@/lib/streamChat";
import { AI_MODELS, DEFAULT_MODEL, PROMPT_SUGGESTIONS, QUICK_ACTIONS, type AIModelId } from "@/lib/aiModels";
import { motion, AnimatePresence } from "framer-motion";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
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

type Msg = { role: "user" | "assistant"; content: string };

function parseResponse(text: string): [string, string | null] {
  const fenceStart = text.indexOf("```html-preview");
  if (fenceStart === -1) return [text, null];
  const chatPart = text.slice(0, fenceStart).trim();
  const codeStart = text.indexOf("\n", fenceStart) + 1;
  const fenceEnd = text.indexOf("```", codeStart);
  const htmlCode = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  return [chatPart, htmlCode.trim()];
}

const TIER_COLORS: Record<string, string> = {
  fast: "text-green-400",
  pro: "text-blue-400",
  premium: "text-amber-400",
};

const TIER_LABELS: Record<string, string> = {
  fast: "Fast",
  pro: "Pro",
  premium: "Premium",
};

const ChatPanel = ({ initialPrompt }: { initialPrompt?: string }) => {
  const { currentProject, saveProject } = useProjects();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModelId>(DEFAULT_MODEL);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { setPreviewHtml, setIsBuilding, setBuildStep } = usePreview();
  const lastProjectIdRef = useRef<string | null>(null);
  const hasProcessedInitialRef = useRef(false);

  // Listen for errors from preview iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "preview-error") {
        setPreviewErrors((prev) => {
          const msg = event.data.message || "Unknown error";
          if (prev.includes(msg)) return prev;
          return [...prev.slice(-4), msg]; // keep last 5
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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
    } else if (!currentProject) {
      lastProjectIdRef.current = null;
      setMessages([]);
      setPreviewHtml("");
      setPreviewErrors([]);
    }
  }, [currentProject, setPreviewHtml]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text || isLoading || !currentProject) return;

    const userMsg: Msg = { role: "user", content: text };
    setInput("");
    setPreviewErrors([]);
    if (inputRef.current) inputRef.current.style.height = "36px";
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setIsBuilding(true);
    setBuildStep("Understanding your request...");

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
      if (htmlCode) setPreviewHtml(htmlCode);

      setMessages((prev) => {
        const displayText = chatText || "Building...";
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: displayText } : m));
        }
        return [...prev, { role: "assistant", content: displayText }];
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

      await streamChat({
        messages: [...messages, userMsg],
        projectId: currentProject.id,
        techStack: currentProject.tech_stack || "html-tailwind",
        schemas,
        model: selectedModel,
        onDelta: upsert,
        onDone: () => {
          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");

          const [chatText, htmlCode] = parseResponse(fullResponse);
          if (htmlCode) setPreviewHtml(htmlCode);

          setMessages((prev) => {
            const final = chatText
              ? prev.map((m, i) => (i === prev.length - 1 && m.role === "assistant" ? { ...m, content: chatText } : m))
              : prev;

            saveProject({
              chat_history: final,
              html_content: htmlCode || currentProject.html_content || "",
              name: currentProject.name === "Untitled Project" && final.length > 0
                ? final[0].content.slice(0, 40)
                : currentProject.name,
            });

            return final;
          });
        },
        onError: (err) => {
          setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}` }]);
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
  }, [isLoading, messages, currentProject, saveProject, setPreviewHtml, setIsBuilding, setBuildStep, selectedModel]);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) sendMessage(input.trim());
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "36px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleAutoFix = () => {
    const errorSummary = previewErrors.join("\n");
    sendMessage(`The app preview has these errors, please fix them:\n${errorSummary}`);
  };

  const currentModelInfo = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0];

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 && !pendingPrompt && (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">What do you want to build?</p>
              <p className="text-xs text-muted-foreground">Pick a suggestion or describe your app</p>
            </div>

            {/* Prompt suggestions */}
            <div className="w-full max-w-sm space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {PROMPT_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.prompt)}
                    className="text-left px-3 py-2.5 rounded-lg border border-border bg-card hover:border-primary/30 hover:bg-card/80 transition-all group"
                  >
                    <span className="text-xs font-medium text-foreground">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {pendingPrompt && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Bot className="w-8 h-8 text-primary animate-pulse" />
            <p className="text-xs">Starting build...</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="flex gap-3">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${msg.role === "user" ? "bg-primary/15" : "bg-accent/15"}`}>
                {msg.role === "user" ? <User className="w-3.5 h-3.5 text-primary" /> : <Bot className="w-3.5 h-3.5 text-accent" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-muted-foreground mb-1 block">{msg.role === "user" ? "You" : "Assistant"}</span>
                {msg.role === "assistant" ? (
                  <div className="text-sm text-foreground leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0 prose-code:text-primary prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-secondary prose-pre:rounded-lg prose-pre:p-3">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-accent" />
            </div>
            <div className="flex gap-1.5 items-center pt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.4s]" />
            </div>
          </div>
        )}

        {/* Quick actions after messages exist */}
        {messages.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => sendMessage(a.prompt)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                <Wand2 className="w-3 h-3" />
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {previewErrors.length > 0 && !isLoading && (
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
                  {previewErrors.length} error{previewErrors.length > 1 ? "s" : ""} detected in preview
                </span>
              </div>
              <button
                onClick={handleAutoFix}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                <Wand2 className="w-3 h-3" />
                Auto-fix
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="p-3 border-t border-border">
        <div className="flex items-end gap-2 bg-secondary rounded-lg px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to change or build something..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-[1.4]"
            style={{ height: "36px", maxHeight: "120px" }}
            disabled={isLoading}
            rows={1}
          />
          <button onClick={() => input.trim() && sendMessage(input.trim())} disabled={isLoading || !input.trim()} className="text-primary hover:text-primary/80 disabled:text-muted-foreground transition-colors pb-0.5">
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Model selector bar */}
        <div className="flex items-center justify-between mt-2 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                <Sparkles className={`w-3 h-3 ${TIER_COLORS[currentModelInfo.tier]}`} />
                <span>{currentModelInfo.label}</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
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
          <span className="text-[10px] text-muted-foreground/50">
            {messages.filter(m => m.role === "user").length} messages
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;

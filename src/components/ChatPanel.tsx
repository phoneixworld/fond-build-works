import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Bot, User } from "lucide-react";
import { streamChat } from "@/lib/streamChat";
import { motion, AnimatePresence } from "framer-motion";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";

type Msg = { role: "user" | "assistant"; content: string };

/** Extract html-preview fence and return [chatText, htmlCode] */
function parseResponse(text: string): [string, string | null] {
  const fenceStart = text.indexOf("```html-preview");
  if (fenceStart === -1) return [text, null];
  const chatPart = text.slice(0, fenceStart).trim();
  const codeStart = text.indexOf("\n", fenceStart) + 1;
  const fenceEnd = text.indexOf("```", codeStart);
  const htmlCode = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);
  return [chatPart, htmlCode.trim()];
}

const ChatPanel = ({ initialPrompt }: { initialPrompt?: string }) => {
  const { currentProject, saveProject, createProject } = useProjects();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasAutoSent, setHasAutoSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { setPreviewHtml, setIsBuilding, setBuildStep } = usePreview();

  // Sync messages & preview when project changes
  useEffect(() => {
    if (currentProject) {
      const history = currentProject.chat_history ?? [];
      setMessages(history);
      setPreviewHtml(currentProject.html_content || "");
    } else {
      setMessages([]);
      setPreviewHtml("");
    }
  }, [currentProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-send initial prompt from landing page
  useEffect(() => {
    if (initialPrompt && !hasAutoSent && currentProject && messages.length === 0) {
      setHasAutoSent(true);
      setInput(initialPrompt);
      // Trigger send on next tick after input is set
      setTimeout(() => sendRef.current?.(), 100);
    }
  }, [initialPrompt, hasAutoSent, currentProject, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendRef = useRef<(() => void) | null>(null);

  const send = useCallback(async (overrideText?: string) => {
    const text = overrideText || input.trim();
    if (!text || isLoading) return;

    // Auto-create project if none selected
    let project = currentProject;
    if (!project) {
      project = await createProject(input.trim().slice(0, 40));
      if (!project) return;
    }

    const userMsg: Msg = { role: "user", content: input.trim() };
    setInput("");
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
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: upsert,
        onDone: () => {
          setIsLoading(false);
          setIsBuilding(false);
          setBuildStep("");

          const [chatText, htmlCode] = parseResponse(fullResponse);
          if (htmlCode) setPreviewHtml(htmlCode);

          // Build final messages for saving
          setMessages((prev) => {
            const final = chatText
              ? prev.map((m, i) => (i === prev.length - 1 && m.role === "assistant" ? { ...m, content: chatText } : m))
              : prev;

            // Auto-save to database
            saveProject({
              chat_history: final,
              html_content: htmlCode || project!.html_content || "",
              name: project!.name === "Untitled Project" && final.length > 0
                ? final[0].content.slice(0, 40)
                : project!.name,
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
  }, [input, isLoading, messages, currentProject, createProject, saveProject, setPreviewHtml, setIsBuilding, setBuildStep]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "36px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-ide-panel-header">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">AI Chat</span>
        {currentProject && (
          <span className="ml-auto text-xs text-muted-foreground truncate max-w-[140px]">
            {currentProject.name}
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">What do you want to build?</p>
              <p className="text-xs">Describe it and I'll create it for you</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-[280px]">
              {["A school website", "A portfolio page", "A restaurant landing page"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
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
                <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
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
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border bg-ide-panel-header">
        <div className="flex items-end gap-2 bg-secondary rounded-lg px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-[1.4]"
            style={{ height: "36px", maxHeight: "120px" }}
            disabled={isLoading}
            rows={1}
          />
          <button onClick={send} disabled={isLoading || !input.trim()} className="text-primary hover:text-primary/80 disabled:text-muted-foreground transition-colors pb-0.5">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;

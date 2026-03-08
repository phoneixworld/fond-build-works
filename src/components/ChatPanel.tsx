import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User } from "lucide-react";
import { streamChat } from "@/lib/streamChat";
import { motion, AnimatePresence } from "framer-motion";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";

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

const ChatPanel = ({ initialPrompt }: { initialPrompt?: string }) => {
  const { currentProject, saveProject } = useProjects();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { setPreviewHtml, setIsBuilding, setBuildStep } = usePreview();
  const lastProjectIdRef = useRef<string | null>(null);
  const hasProcessedInitialRef = useRef(false);

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
    } else if (!currentProject) {
      lastProjectIdRef.current = null;
      setMessages([]);
      setPreviewHtml("");
    }
  }, [currentProject, setPreviewHtml]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text || isLoading || !currentProject) return;

    const userMsg: Msg = { role: "user", content: text };
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
        projectId: currentProject.id,
        techStack: currentProject.tech_stack || "html-tailwind",
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
  }, [isLoading, messages, currentProject, saveProject, setPreviewHtml, setIsBuilding, setBuildStep]);

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

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 && !pendingPrompt && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Bot className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-xs">Start a conversation to build your app</p>
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
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

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
      </div>
    </div>
  );
};

export default ChatPanel;

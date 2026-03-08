import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Bot, User, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { streamChat } from "@/lib/streamChat";
import { motion, AnimatePresence } from "framer-motion";

type Msg = { role: "user" | "assistant"; content: string };

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="absolute top-2 right-2 p-1 rounded bg-border/50 hover:bg-border text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-ide-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

const ChatPanel = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "36px";
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: upsert,
        onDone: () => setIsLoading(false),
        onError: (err) => {
          setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}` }]);
          setIsLoading(false);
        },
      });
    } catch {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "36px";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-ide-panel-header">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">AI Chat</span>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">How can I help?</p>
              <p className="text-xs">Describe what you want to build</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-[280px]">
              {["Build a landing page", "Create a dashboard", "Add a contact form"].map((s) => (
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
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="flex gap-3"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === "user" ? "bg-primary/15" : "bg-accent/15"
              }`}>
                {msg.role === "user" ? (
                  <User className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Bot className="w-3.5 h-3.5 text-accent" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-muted-foreground mb-1 block">
                  {msg.role === "user" ? "You" : "Assistant"}
                </span>
                {msg.role === "assistant" ? (
                  <div className="text-sm text-foreground leading-relaxed chat-markdown">
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || "");
                          const codeStr = String(children).replace(/\n$/, "");
                          if (match) {
                            return (
                              <div className="relative my-3 rounded-lg overflow-hidden border border-border">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-ide-panel-header border-b border-border">
                                  <span className="text-[10px] font-mono text-muted-foreground uppercase">{match[1]}</span>
                                </div>
                                <CopyButton text={codeStr} />
                                <SyntaxHighlighter
                                  style={oneDark}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{
                                    margin: 0,
                                    padding: "12px 16px",
                                    background: "hsl(220 14% 10%)",
                                    fontSize: "12px",
                                    lineHeight: "1.6",
                                  }}
                                >
                                  {codeStr}
                                </SyntaxHighlighter>
                              </div>
                            );
                          }
                          return (
                            <code className="px-1.5 py-0.5 rounded bg-secondary text-primary font-mono text-xs" {...props}>
                              {children}
                            </code>
                          );
                        },
                        p({ children }) {
                          return <p className="mb-2 last:mb-0">{children}</p>;
                        },
                        ul({ children }) {
                          return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>;
                        },
                        ol({ children }) {
                          return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>;
                        },
                        h1({ children }) {
                          return <h1 className="text-base font-bold mb-2 mt-3">{children}</h1>;
                        },
                        h2({ children }) {
                          return <h2 className="text-sm font-bold mb-2 mt-3">{children}</h2>;
                        },
                        h3({ children }) {
                          return <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>;
                        },
                        blockquote({ children }) {
                          return <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground my-2">{children}</blockquote>;
                        },
                        a({ href, children }) {
                          return <a href={href} className="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noopener">{children}</a>;
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-foreground">{msg.content}</p>
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
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
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
          <button
            onClick={send}
            disabled={isLoading || !input.trim()}
            className="text-primary hover:text-primary/80 disabled:text-muted-foreground transition-colors pb-0.5"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;

import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, User, ChevronDown, ChevronRight, CheckCircle2, Circle, Pencil, RotateCcw, Clock, Brain, Sparkles, Wrench, Copy, Check, Lightbulb, History, Bookmark, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MsgContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

interface ChatMessageProps {
  content: MsgContent;
  role: "user" | "assistant";
  timestamp?: number;
  isLoading?: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
  showActions?: boolean;
  onSuggestionClick?: (text: string) => void;
}

function getTextContent(content: MsgContent): string {
  if (typeof content === "string") return content;
  return content.filter((p): p is { type: "text"; text: string } => p.type === "text").map(p => p.text).join("\n");
}

function getImageUrls(content: MsgContent): string[] {
  if (typeof content === "string") return [];
  return content.filter((p): p is { type: "image_url"; image_url: { url: string } } => p.type === "image_url").map(p => p.image_url.url);
}

function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- Response parser ---

interface ParsedSection {
  type: "thinking" | "tasks" | "text" | "summary";
  content: string;
  tasks?: { label: string; done: boolean }[];
}

function parseStructuredResponse(text: string, isStreaming?: boolean): ParsedSection[] {
  const sections: ParsedSection[] = [];
  
  const thinkingPatterns = [
    /^(?:Let me|I'll|I will|First,? I|OK,? let me|Alright,? |Sure,? |Great,? let me|Let's)[^\n]*(?:\.{3}|…|:)\s*/im,
    /^(?:Analyzing|Understanding|Processing|Planning|Thinking|Considering)[^\n]*(?:\.{3}|…|\.)\s*/im,
  ];
  
  let remaining = text;
  let thinkingText = "";
  
  for (const pattern of thinkingPatterns) {
    const match = remaining.match(pattern);
    if (match && match.index === 0) {
      thinkingText = match[0].trim();
      remaining = remaining.slice(match[0].length).trim();
      break;
    }
  }
  
  if (thinkingText) {
    sections.push({ type: "thinking", content: thinkingText });
  }

  const taskLines: { label: string; done: boolean }[] = [];
  const lines = remaining.split("\n");
  const nonTaskLines: string[] = [];
  let inTaskBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Only match EXPLICIT task markers — checkmarks and markdown checkboxes
    const checkDone = trimmed.match(/^(?:✅|☑️?|✓|[✔])\s*(.+)/);
    const checkUndone = trimmed.match(/^(?:⬜|☐|○)\s*(.+)/);
    const mdCheckDone = trimmed.match(/^-\s*\[x\]\s*(.+)/i);
    const mdCheckUndone = trimmed.match(/^-\s*\[\s*\]\s*(.+)/);

    if (checkDone) { taskLines.push({ label: checkDone[1].trim(), done: true }); inTaskBlock = true; }
    else if (checkUndone) { taskLines.push({ label: checkUndone[1].trim(), done: false }); inTaskBlock = true; }
    else if (mdCheckDone) { taskLines.push({ label: mdCheckDone[1].trim(), done: true }); inTaskBlock = true; }
    else if (mdCheckUndone) { taskLines.push({ label: mdCheckUndone[1].trim(), done: false }); inTaskBlock = true; }
    else {
      if (inTaskBlock && trimmed === "") inTaskBlock = false;
      nonTaskLines.push(line);
    }
  }

  if (taskLines.length > 0) sections.push({ type: "tasks", content: "", tasks: taskLines });

  const bodyText = nonTaskLines.join("\n").trim();
  if (bodyText) {
    const summaryMatch = bodyText.match(/(?:\n\n|\n)((?:That's it|Done|All (?:done|set)|Everything is|Here's what|In summary|To summarize)[^\n]*(?:\n[^\n]+)*)$/i);
    if (summaryMatch) {
      const mainText = bodyText.slice(0, bodyText.length - summaryMatch[0].length).trim();
      if (mainText) sections.push({ type: "text", content: mainText });
      sections.push({ type: "summary", content: summaryMatch[1].trim() });
    } else {
      sections.push({ type: "text", content: bodyText });
    }
  }

  if (sections.length === 0) sections.push({ type: "text", content: text });
  return sections;
}

// --- Sub-components ---

const ThinkingSection = ({ content }: { content: string }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="flex items-center gap-2 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors mb-3 group"
    >
      <div className="w-4 h-4 rounded-md bg-muted/50 flex items-center justify-center">
        <Brain className="w-2.5 h-2.5" />
      </div>
      <span className="font-medium tracking-wide">Thought process</span>
      {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      {expanded && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-1 text-muted-foreground/40 font-normal italic">
          {content}
        </motion.span>
      )}
    </button>
  );
};

const TaskCard = ({ tasks }: { tasks: { label: string; done: boolean }[] }) => {
  const [collapsed, setCollapsed] = useState(false);
  const doneCount = tasks.filter(t => t.done).length;
  const allDone = doneCount === tasks.length;
  const progress = tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden mb-4"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {allDone ? (
            <div className="w-5 h-5 rounded-full bg-[hsl(var(--ide-success))]/10 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
              <Wrench className="w-3 h-3 text-primary" />
            </div>
          )}
          <span className="text-[12px] font-semibold text-foreground tracking-tight">
            {allDone ? "Changes complete" : "Building..."}
          </span>
          <span className="text-[10px] text-muted-foreground/50 font-mono">
            {doneCount}/{tasks.length}
          </span>
        </div>
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/30" />}
      </button>

      {/* Progress bar */}
      <div className="h-[2px] bg-border/30 mx-4">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: allDone ? "hsl(var(--ide-success))" : "hsl(var(--primary))" }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {!collapsed && (
        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }}>
          <div className="px-4 py-3 space-y-1">
            {tasks.map((task, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-start gap-2.5 py-1"
              >
                {task.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--ide-success))] shrink-0 mt-[3px]" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/25 shrink-0 mt-[3px]" />
                )}
                <span className={`text-[12px] leading-relaxed ${task.done ? "text-foreground/80" : "text-muted-foreground/60"}`}>
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      code: ({ children }) => <code className="text-primary bg-primary/8 px-1.5 py-0.5 rounded text-[11px] font-[JetBrains_Mono]">{children}</code>,
                    }}
                  >
                    {task.label}
                  </ReactMarkdown>
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

const SummarySection = ({ content }: { content: string }) => (
  <div className="mt-4 pt-3 border-t border-border/30">
    <div className="flex items-center gap-1.5 mb-2">
      <Sparkles className="w-3 h-3 text-primary/50" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/40">Summary</span>
    </div>
    <div className="text-[13px] text-foreground/70 leading-[1.75] prose prose-invert prose-sm max-w-none prose-p:my-1 prose-strong:text-foreground">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  </div>
);

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-secondary/50 transition-all"
      title="Copy message"
    >
      {copied ? <Check className="w-3 h-3 text-[hsl(var(--ide-success))]" /> : <Copy className="w-3 h-3" />}
    </button>
  );
};

// --- Context awareness badges ---

interface ContextHint {
  icon: React.ElementType;
  text: string;
  type: "memory" | "pattern" | "convention";
}

function detectContextHints(text: string): ContextHint[] {
  const hints: ContextHint[] = [];
  
  // Detect [CONTEXT: ...] markers injected by the AI
  const contextPattern = /\[CONTEXT:\s*([^\]]+)\]/gi;
  let match;
  while ((match = contextPattern.exec(text)) !== null) {
    const hint = match[1].trim();
    if (/prefer|chose|selected|your.*style/i.test(hint)) {
      hints.push({ icon: Bookmark, text: hint, type: "memory" });
    } else if (/previous|earlier|last time|reusing/i.test(hint)) {
      hints.push({ icon: History, text: hint, type: "pattern" });
    } else {
      hints.push({ icon: Lightbulb, text: hint, type: "convention" });
    }
  }

  // Also detect inline memory references without markers
  if (hints.length === 0) {
    const memoryPhrases = [
      { pattern: /(?:applying|using) your (?:preferred|saved|chosen) (.+?)(?:\.|,|$)/i, type: "memory" as const },
      { pattern: /(?:based on|matching) your (?:previous|existing) (.+?)(?:\.|,|$)/i, type: "pattern" as const },
      { pattern: /(?:reusing|following) your (?:existing|established) (.+?)(?:\.|,|$)/i, type: "convention" as const },
      { pattern: /from your project (?:brain|knowledge|settings)(?::?\s*(.+?))?(?:\.|,|$)/i, type: "memory" as const },
    ];
    for (const { pattern, type } of memoryPhrases) {
      const m = text.match(pattern);
      if (m) {
        hints.push({
          icon: type === "memory" ? Bookmark : type === "pattern" ? History : Lightbulb,
          text: m[0].replace(/^[,.\s]+|[,.\s]+$/g, ""),
          type,
        });
      }
    }
  }

  return hints;
}

function stripContextMarkers(text: string): string {
  return text.replace(/\[CONTEXT:\s*[^\]]+\]\s*/gi, "").trim();
}

const ContextBadges = ({ hints }: { hints: ContextHint[] }) => {
  if (hints.length === 0) return null;
  
  const colorMap = {
    memory: { bg: "bg-primary/8", text: "text-primary/70", border: "border-primary/15" },
    pattern: { bg: "bg-accent/8", text: "text-accent/70", border: "border-accent/15" },
    convention: { bg: "bg-[hsl(var(--ide-success))]/8", text: "text-[hsl(var(--ide-success))]/70", border: "border-[hsl(var(--ide-success))]/15" },
  };

  return (
    <div className="flex flex-wrap gap-1.5 mb-2.5">
      {hints.map((hint, i) => {
        const Icon = hint.icon;
        const colors = colorMap[hint.type];
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.25 }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
          >
            <Icon className="w-3 h-3" />
            <span className="max-w-[200px] truncate">{hint.text}</span>
          </motion.div>
        );
      })}
    </div>
  );
};

// --- Suggestion buttons ---

interface Suggestion {
  emoji: string;
  title: string;
  description: string;
  fullText: string;
}

function parseSuggestions(text: string): { suggestions: Suggestion[]; cleanText: string } {
  const suggestions: Suggestion[] = [];
  // Match lines like: 🍽️ **Online Ordering** — description text
  // or: 📸 **Photo Gallery** - description text
  const suggestionRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s+\*\*(.+?)\*\*\s*[—–\-]\s*(.+)$/gmu;
  let match;
  const matchedLines = new Set<string>();
  
  while ((match = suggestionRegex.exec(text)) !== null) {
    suggestions.push({
      emoji: match[1],
      title: match[2].trim(),
      description: match[3].trim(),
      fullText: `${match[2].trim()}: ${match[3].trim()}`,
    });
    matchedLines.add(match[0]);
  }
  
  if (suggestions.length < 2) return { suggestions: [], cleanText: text };
  
  // Remove suggestion lines from text
  const cleanLines = text.split("\n").filter(line => !matchedLines.has(line.trim()));
  return { suggestions, cleanText: cleanLines.join("\n").trim() };
}

const SuggestionButtons = ({ suggestions, onClick }: { suggestions: Suggestion[]; onClick?: (text: string) => void }) => {
  if (suggestions.length === 0 || !onClick) return null;
  
  return (
    <div className="grid gap-2 mt-4">
      {suggestions.map((s, i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              onClick={() => onClick(s.fullText)}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left
                border border-border/50 bg-card/50 backdrop-blur-sm
                hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/5
                active:scale-[0.98]
                transition-all duration-200 group"
            >
              <span className="text-lg shrink-0">{s.emoji}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-semibold text-foreground/90 group-hover:text-foreground block">{s.title}</span>
                <span className="text-[11px] text-muted-foreground/60 group-hover:text-muted-foreground/80 line-clamp-1 block">{s.description}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all shrink-0" />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-xs">
            {s.description}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};

// --- Main component ---

const ChatMessage = ({ content, role, timestamp, isLoading, onEdit, onRegenerate, showActions = true, onSuggestionClick }: ChatMessageProps) => {
  const isUser = role === "user";
  const textContent = getTextContent(content);
  const imageUrls = getImageUrls(content);
  
  // Detect and strip context hints for assistant messages
  const contextHints = !isUser ? detectContextHints(textContent) : [];
  const cleanText = !isUser ? stripContextMarkers(textContent) : textContent;
  
  // Parse suggestion buttons from assistant responses
  const { suggestions, cleanText: textWithoutSuggestions } = !isUser ? parseSuggestions(cleanText) : { suggestions: [], cleanText: cleanText };
  // Don't parse structured sections (task cards, summaries) while still loading — prevents premature "Changes complete"
  const sections = !isUser ? parseStructuredResponse(textWithoutSuggestions, isLoading) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`group relative ${isUser ? "pl-8" : ""}`}
    >
      {/* User messages: clean right-aligned bubble */}
      {isUser ? (
        <div className="flex flex-col items-end gap-1">
          {/* Images */}
          {imageUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap justify-end mb-1">
              {imageUrls.map((url, idx) => (
                <img key={idx} src={url} alt="Attached" className="w-20 h-20 object-cover rounded-xl border border-border/50 shadow-sm" />
              ))}
            </div>
          )}
          <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary/12 border border-primary/15 px-4 py-2.5">
            <p className="text-[13px] text-foreground leading-[1.7] whitespace-pre-wrap">{textContent}</p>
          </div>
          <div className="flex items-center gap-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {timestamp && (
              <span className="text-[10px] text-muted-foreground/30 font-mono flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {formatTime(timestamp)}
              </span>
            )}
            {showActions && !isLoading && onEdit && (
              <button
                onClick={onEdit}
                className="p-1 rounded-md text-muted-foreground/30 hover:text-foreground hover:bg-secondary/50 transition-all"
                title="Edit message"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Assistant messages: clean left-aligned with icon */
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 ring-1 ring-accent/15 flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="w-3.5 h-3.5 text-accent" />
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold tracking-wide text-accent/70">
                Assistant
              </span>
              {timestamp && (
                <span className="text-[10px] text-muted-foreground/25 font-mono opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTime(timestamp)}
                </span>
              )}
              {/* Actions */}
              {showActions && !isLoading && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                  <CopyButton text={textContent} />
                  {onRegenerate && (
                    <button
                      onClick={onRegenerate}
                      className="p-1 rounded-md text-muted-foreground/30 hover:text-foreground hover:bg-secondary/50 transition-all"
                      title="Regenerate response"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Context awareness badges */}
            <ContextBadges hints={contextHints} />

            {/* Content */}
            <div className="space-y-0">
              {sections.map((section, i) => {
                switch (section.type) {
                  case "thinking":
                    return <ThinkingSection key={i} content={section.content} />;
                  case "tasks":
                    return <TaskCard key={i} tasks={section.tasks || []} />;
                  case "summary":
                    return <SummarySection key={i} content={section.content} />;
                  case "text":
                  default:
                    return (
                      <div
                        key={i}
                        className="text-[13px] text-foreground/85 leading-[1.75] prose prose-invert prose-sm max-w-none
                          prose-p:my-2
                          prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground
                          prose-ul:my-2 prose-li:my-0.5
                          prose-code:font-[JetBrains_Mono] prose-code:text-primary prose-code:bg-primary/8 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[11.5px] prose-code:font-medium
                          prose-pre:bg-[hsl(var(--ide-panel))] prose-pre:rounded-xl prose-pre:p-4 prose-pre:border prose-pre:border-border/50 prose-pre:font-[JetBrains_Mono] prose-pre:text-[12px] prose-pre:leading-relaxed
                          prose-strong:text-foreground prose-strong:font-semibold
                          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                          prose-blockquote:border-l-2 prose-blockquote:border-primary/30 prose-blockquote:pl-4 prose-blockquote:text-muted-foreground prose-blockquote:italic"
                      >
                        <ReactMarkdown>{section.content}</ReactMarkdown>
                      </div>
                    );
                }
              })}
            </div>
            
            {/* Suggestion buttons */}
            <SuggestionButtons suggestions={suggestions} onClick={onSuggestionClick} />
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ChatMessage;
export { getTextContent, getImageUrls, formatTime };

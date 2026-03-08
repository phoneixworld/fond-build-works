import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, User, ChevronDown, ChevronRight, CheckCircle2, Circle, Pencil, RotateCcw, Clock, Brain, Sparkles, FileCode2, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";

type MsgContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

interface ChatMessageProps {
  content: MsgContent;
  role: "user" | "assistant";
  timestamp?: number;
  isLoading?: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
  showActions?: boolean;
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

// --- Response parser: extracts structured sections from AI text ---

interface ParsedSection {
  type: "thinking" | "tasks" | "text" | "summary";
  content: string;
  tasks?: { label: string; done: boolean }[];
}

function parseStructuredResponse(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  
  // Detect "thinking" patterns
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

  // Extract task-like patterns (lines starting with ✅, ☑, ✓, - [x], - [ ], •, numbered items with action words)
  const taskLines: { label: string; done: boolean }[] = [];
  const lines = remaining.split("\n");
  const nonTaskLines: string[] = [];
  let inTaskBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Checkbox patterns
    const checkDone = trimmed.match(/^(?:✅|☑️?|✓|[✔])\s*(.+)/);
    const checkUndone = trimmed.match(/^(?:⬜|☐|○)\s*(.+)/);
    const mdCheckDone = trimmed.match(/^-\s*\[x\]\s*(.+)/i);
    const mdCheckUndone = trimmed.match(/^-\s*\[\s*\]\s*(.+)/);
    
    // Numbered or bulleted action items (only if we're already in a task block or it looks like a list of completed actions)
    const numberedAction = trimmed.match(/^(?:\d+[\.\)]\s*)(.+(?:built|created|added|updated|implemented|fixed|configured|set up|deployed|installed|removed|refactored|completed).*)$/i);
    const bulletAction = trimmed.match(/^(?:[-•]\s+)(\*\*.+\*\*.*)$/);

    if (checkDone) {
      taskLines.push({ label: checkDone[1].trim(), done: true });
      inTaskBlock = true;
    } else if (checkUndone) {
      taskLines.push({ label: checkUndone[1].trim(), done: false });
      inTaskBlock = true;
    } else if (mdCheckDone) {
      taskLines.push({ label: mdCheckDone[1].trim(), done: true });
      inTaskBlock = true;
    } else if (mdCheckUndone) {
      taskLines.push({ label: mdCheckUndone[1].trim(), done: false });
      inTaskBlock = true;
    } else if (inTaskBlock && (numberedAction || bulletAction)) {
      const label = (numberedAction || bulletAction)![1].trim();
      taskLines.push({ label, done: true });
    } else {
      if (inTaskBlock && trimmed === "") {
        inTaskBlock = false;
      }
      nonTaskLines.push(line);
    }
  }

  if (taskLines.length > 0) {
    sections.push({ type: "tasks", content: "", tasks: taskLines });
  }

  // Remaining text
  const bodyText = nonTaskLines.join("\n").trim();
  if (bodyText) {
    // Try to detect summary section at the end
    const summaryMatch = bodyText.match(/(?:\n\n|\n)((?:That's it|Done|All (?:done|set)|Everything is|Here's what|In summary|To summarize)[^\n]*(?:\n[^\n]+)*)$/i);
    if (summaryMatch) {
      const mainText = bodyText.slice(0, bodyText.length - summaryMatch[0].length).trim();
      if (mainText) sections.push({ type: "text", content: mainText });
      sections.push({ type: "summary", content: summaryMatch[1].trim() });
    } else {
      sections.push({ type: "text", content: bodyText });
    }
  }

  // If nothing was parsed, return the full text
  if (sections.length === 0) {
    sections.push({ type: "text", content: text });
  }

  return sections;
}

// --- Sub-components ---

const ThinkingSection = ({ content }: { content: string }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="flex items-center gap-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors mb-2 group"
    >
      <Brain className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
      <span className="font-medium">Finished thinking</span>
      {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      {expanded && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="ml-1 text-muted-foreground/40 font-normal"
        >
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card/50 overflow-hidden mb-3"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {allDone ? (
            <div className="w-5 h-5 rounded-full bg-[hsl(var(--ide-success))]/15 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
              <Wrench className="w-3 h-3 text-primary" />
            </div>
          )}
          <span className="text-[13px] font-semibold text-foreground">
            {allDone ? "Changes complete" : "Building..."}
          </span>
          <span className="text-[11px] text-muted-foreground/60">
            {doneCount}/{tasks.length}
          </span>
        </div>
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />}
      </button>

      {!collapsed && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          className="border-t border-border"
        >
          <div className="px-4 py-2.5 space-y-1.5">
            {tasks.map((task, i) => (
              <div key={i} className="flex items-start gap-2.5 py-1">
                {task.done ? (
                  <CheckCircle2 className="w-4 h-4 text-[hsl(var(--ide-success))] shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0 mt-0.5" />
                )}
                <span className={`text-[12px] leading-relaxed ${task.done ? "text-foreground" : "text-muted-foreground"}`}>
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      code: ({ children }) => <code className="text-primary bg-secondary px-1 py-0.5 rounded text-[11px] font-[JetBrains_Mono]">{children}</code>,
                    }}
                  >
                    {task.label}
                  </ReactMarkdown>
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

const SummarySection = ({ content }: { content: string }) => (
  <div className="mt-3 pt-3 border-t border-border/50">
    <div className="flex items-center gap-1.5 mb-1.5">
      <Sparkles className="w-3 h-3 text-primary/60" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Summary</span>
    </div>
    <div className="text-[13px] text-foreground/80 leading-[1.7] prose prose-invert prose-sm max-w-none prose-p:my-1 prose-strong:text-foreground">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  </div>
);

// --- Main component ---

const ChatMessage = ({ content, role, timestamp, isLoading, onEdit, onRegenerate, showActions = true }: ChatMessageProps) => {
  const isUser = role === "user";
  const textContent = getTextContent(content);
  const imageUrls = getImageUrls(content);
  
  const sections = !isUser ? parseStructuredResponse(textContent) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex gap-3 group"
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
        isUser
          ? "bg-primary/15 ring-1 ring-primary/20"
          : "bg-accent/15 ring-1 ring-accent/20"
      }`}>
        {isUser ? <User className="w-3.5 h-3.5 text-primary" /> : <Bot className="w-3.5 h-3.5 text-accent" />}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
            {isUser ? "You" : "Assistant"}
          </span>
          {timestamp && (
            <span className="text-[10px] text-muted-foreground/40 font-mono opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {formatTime(timestamp)}
            </span>
          )}
          {/* Actions */}
          {showActions && !isLoading && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
              {isUser && onEdit && (
                <button
                  onClick={onEdit}
                  className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-secondary transition-all"
                  title="Edit message"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              {!isUser && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-secondary transition-all"
                  title="Regenerate response"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Images */}
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

        {/* Content */}
        {isUser ? (
          <p className="text-[13px] text-foreground/90 leading-[1.7]">{textContent}</p>
        ) : (
          <div>
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
                      className="text-[13px] text-foreground leading-[1.7] prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-tight prose-ul:my-1.5 prose-li:my-0.5 prose-code:font-[JetBrains_Mono] prose-code:text-primary prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[12px] prose-pre:bg-secondary prose-pre:rounded-xl prose-pre:p-4 prose-pre:border prose-pre:border-border prose-pre:font-[JetBrains_Mono] prose-pre:text-[12px] prose-pre:leading-relaxed prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
                    >
                      <ReactMarkdown>{section.content}</ReactMarkdown>
                    </div>
                  );
              }
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatMessage;
export { getTextContent, getImageUrls, formatTime };

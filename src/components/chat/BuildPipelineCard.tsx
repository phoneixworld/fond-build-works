import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Loader2, ChevronRight, ChevronDown, FileCode2, Bookmark, Eye } from "lucide-react";
import type { PipelineStep } from "@/lib/agentPipeline";

export interface TaskItem {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done";
}

interface BuildPipelineCardProps {
  isBuilding: boolean;
  streamContent: string;
  tasks?: TaskItem[];
  pipelineStep?: PipelineStep | null;
  currentAgent?: "chat" | "build" | null;
  buildTitle?: string;
  onShowPreview?: () => void;
}

function detectEditingFiles(content: string): string[] {
  const files: string[] = [];
  const reactMatches = content.matchAll(/---\s+\/?([^\s]+\.(?:jsx?|tsx?|css))/g);
  for (const m of reactMatches) {
    const name = m[1].split("/").pop() || m[1];
    if (!files.includes(name)) files.push(name);
  }
  if (files.length === 0 && (content.includes("```html") || content.includes("```html-preview"))) {
    files.push("index.html");
  }
  return files.slice(0, 3);
}

function detectTasks(content: string, isBuilding: boolean, pipelineStep?: PipelineStep | null, currentAgent?: "chat" | "build" | null): TaskItem[] {
  const len = content.length;
  const hasCode = content.includes("```react-preview") || content.includes("```jsx") || content.includes("```html") || content.includes("```react");
  const hasClosingFence = hasCode && (() => {
    const start = content.indexOf("```");
    const afterStart = content.indexOf("\n", start) + 1;
    return content.indexOf("\n```", afterStart) > -1;
  })();

  const tasks: TaskItem[] = [];

  if (currentAgent === "chat") {
    tasks.push({ id: "chat", label: "Chat agent responding", status: isBuilding ? "in_progress" : "done" });
    if (!isBuilding && len > 0) return tasks.map(t => ({ ...t, status: "done" as const }));
    return tasks;
  }

  if (isBuilding && len > 0) {
    tasks.push({ id: "analyze", label: "Analyzing request", status: hasCode ? "done" : (len > 80 ? "done" : "in_progress") });
  }

  if (isBuilding && len > 80) {
    tasks.push({ id: "generate", label: "Build agent generating code", status: hasCode ? "done" : "in_progress" });
  }

  if (hasCode) {
    const codeStart = content.indexOf("```");
    const codeContent = content.slice(codeStart);
    tasks.push({ id: "build", label: "Assembling UI & components", status: codeContent.length > 3000 ? "done" : "in_progress" });

    if (codeContent.length > 2000) {
      tasks.push({ id: "validate", label: "Validating in Sandpack", status: hasClosingFence && !isBuilding ? "done" : "in_progress" });
    }

    if (pipelineStep === "retrying") {
      tasks.push({ id: "retry", label: "Auto-fixing validation errors", status: "in_progress" });
    }
  }

  if (!isBuilding && hasCode && len > 100) return tasks.map(t => ({ ...t, status: "done" as const }));
  if (!isBuilding && !hasCode) return [];
  return tasks;
}

const StatusIndicator = React.forwardRef<HTMLDivElement, { status: TaskItem["status"] }>(({ status }, ref) => {
  switch (status) {
    case "done":
      return (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
          <CheckCircle2 className="w-4 h-4 text-[hsl(var(--ide-success))]" />
        </motion.div>
      );
    case "in_progress":
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    default:
      return <Circle className="w-4 h-4 text-muted-foreground/25" />;
  }
});
StatusIndicator.displayName = "StatusIndicator";

const BuildPipelineCard = ({ isBuilding, streamContent, tasks: externalTasks, pipelineStep, currentAgent, buildTitle, onShowPreview }: BuildPipelineCardProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "preview">("details");

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (isBuilding) {
      setElapsed(0);
      const id = setInterval(() => setElapsed(t => t + 1), 1000);
      return () => clearInterval(id);
    }
  }, [isBuilding]);

  const editingFiles = useMemo(() => detectEditingFiles(streamContent), [streamContent]);
  const tasks = useMemo(() => externalTasks || detectTasks(streamContent, isBuilding, pipelineStep, currentAgent), [externalTasks, streamContent, isBuilding, pipelineStep, currentAgent]);

  const doneCount = tasks.filter(t => t.status === "done").length;
  const allDone = doneCount === tasks.length && !isBuilding && tasks.length > 0;
  const activeTask = tasks.find(t => t.status === "in_progress");

  // Infer build title from stream content
  const inferredTitle = useMemo(() => {
    if (buildTitle) return buildTitle;
    // Try to extract a meaningful title from the plan
    const titleMatch = streamContent.match(/##\s*TASK:\s*(.+?)(?:\n|$)/);
    if (titleMatch) return titleMatch[1].trim();
    return allDone ? "Build complete" : "Building...";
  }, [buildTitle, streamContent, allDone]);

  const description = useMemo(() => {
    if (allDone) return `Completed in ${elapsed}s`;
    if (activeTask) {
      const descs: Record<string, string> = {
        classify: "Classifying intent...",
        chat: "Chat agent processing your question",
        analyze: "Understanding requirements",
        generate: "Build agent streaming code",
        build: "Assembling UI components & applying styles",
        validate: "Validating in Sandpack environment",
        retry: "Auto-fixing validation errors...",
      };
      // Add file context
      const fileStr = editingFiles.length > 0 ? ` · ${editingFiles.join(", ")}` : "";
      return (descs[activeTask.id] || "Processing...") + fileStr;
    }
    return "Starting...";
  }, [allDone, activeTask, elapsed, editingFiles]);

  if (tasks.length === 0 && !isBuilding) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {isBuilding ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground/60">Editing</span>
                <span className="text-sm text-muted-foreground/80">{description}</span>
              </div>
            ) : (
              <span className="text-sm font-medium text-foreground">{inferredTitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isBuilding && (
              <Bookmark className="w-4 h-4 text-muted-foreground/30 hover:text-foreground cursor-pointer transition-colors" />
            )}
            <button onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? (
                <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Task list */}
      <AnimatePresence>
        {!collapsed && tasks.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pb-3 space-y-1">
              {tasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 py-1"
                >
                  <StatusIndicator status={task.status} />
                  <span
                    className={`text-sm ${
                      task.status === "done"
                        ? "text-foreground/70"
                        : task.status === "in_progress"
                        ? "text-foreground font-medium"
                        : "text-muted-foreground/30"
                    }`}
                  >
                    {task.label}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Details / Preview tabs — shown when build is done */}
            {allDone && onShowPreview && (
              <div className="flex border-t border-border/40">
                <button
                  onClick={() => setActiveTab("details")}
                  className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
                    activeTab === "details"
                      ? "text-foreground"
                      : "text-muted-foreground/50 hover:text-foreground"
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => {
                    setActiveTab("preview");
                    onShowPreview?.();
                  }}
                  className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors rounded-lg mx-2 my-1 ${
                    activeTab === "preview"
                      ? "bg-primary/80 text-primary-foreground"
                      : "bg-primary/20 text-primary hover:bg-primary/30"
                  }`}
                >
                  Preview
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BuildPipelineCard;

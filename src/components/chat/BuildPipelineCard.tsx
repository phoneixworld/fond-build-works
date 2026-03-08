import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Loader2, ChevronRight, FileCode2 } from "lucide-react";

export interface TaskItem {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "done";
}

interface BuildPipelineCardProps {
  isBuilding: boolean;
  streamContent: string;
  elapsed: number;
  /** Optional explicit tasks from outside */
  tasks?: TaskItem[];
}

/** Detect which files are being edited from stream content */
function detectEditingFiles(content: string): string[] {
  const files: string[] = [];
  // React preview files
  const reactMatches = content.matchAll(/---\s+\/?([^\s]+\.(?:jsx?|tsx?|css))/g);
  for (const m of reactMatches) {
    const name = m[1].split("/").pop() || m[1];
    if (!files.includes(name)) files.push(name);
  }
  // HTML mode
  if (files.length === 0 && (content.includes("```html") || content.includes("```html-preview"))) {
    files.push("index.html");
  }
  return files.slice(0, 3); // max 3 badges
}

/** Heuristic task detection from stream content */
function detectTasks(content: string, isBuilding: boolean): TaskItem[] {
  const len = content.length;
  const hasCode = content.includes("```react-preview") || content.includes("```jsx") || content.includes("```html") || content.includes("```react");
  const hasClosingFence = hasCode && (() => {
    const start = content.indexOf("```");
    const afterStart = content.indexOf("\n", start) + 1;
    return content.indexOf("\n```", afterStart) > -1;
  })();

  const tasks: TaskItem[] = [];

  // If building but no code detected yet, show analyzing
  if (isBuilding && len > 0) {
    tasks.push({
      id: "analyze",
      label: "Analyzing request",
      status: hasCode ? "done" : (len > 80 ? "done" : "in_progress"),
    });
  }

  // Only show generation task if we're still building OR code was found
  if (isBuilding && len > 80) {
    tasks.push({
      id: "generate",
      label: "Generating components",
      status: hasCode ? "done" : "in_progress",
    });
  }

  // Only show build/finalize tasks if actual code fences were found
  if (hasCode) {
    const codeStart = content.indexOf("```");
    const codeContent = content.slice(codeStart);
    tasks.push({
      id: "build",
      label: "Building UI & styling",
      status: codeContent.length > 3000 ? "done" : "in_progress",
    });

    if (codeContent.length > 2000) {
      tasks.push({
        id: "finalize",
        label: "Finalizing & validating",
        status: hasClosingFence && !isBuilding ? "done" : "in_progress",
      });
    }
  }

  // Only mark all done if code was actually generated
  if (!isBuilding && hasCode && len > 100) {
    return tasks.map(t => ({ ...t, status: "done" as const }));
  }

  // If build finished with NO code, return empty — don't show misleading progress
  if (!isBuilding && !hasCode) {
    return [];
  }

  return tasks;
}

const StatusIndicator = ({ status }: { status: TaskItem["status"] }) => {
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
};

const BuildPipelineCard = ({ isBuilding, streamContent, elapsed, tasks: externalTasks }: BuildPipelineCardProps) => {
  const [collapsed, setCollapsed] = useState(false);

  const editingFiles = useMemo(() => detectEditingFiles(streamContent), [streamContent]);
  const tasks = useMemo(() => externalTasks || detectTasks(streamContent, isBuilding), [externalTasks, streamContent, isBuilding]);

  const doneCount = tasks.filter(t => t.status === "done").length;
  const allDone = doneCount === tasks.length && !isBuilding && tasks.length > 0;
  const activeTask = tasks.find(t => t.status === "in_progress");

  // Build a description line
  const description = useMemo(() => {
    if (allDone) return `Completed in ${elapsed}s`;
    if (activeTask) {
      const descs: Record<string, string> = {
        analyze: "Understanding your requirements",
        generate: "Streaming contextual code updates underway",
        build: "Assembling UI components & applying styles",
        finalize: "Running validation checks",
      };
      return descs[activeTask.id] || "Processing...";
    }
    return "Starting build...";
  }, [allDone, activeTask, elapsed]);

  if (tasks.length === 0 && !isBuilding) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-border/60 bg-card/50 overflow-hidden"
    >
      {/* Header row */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
      >
        <div className="flex flex-col items-start gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-foreground">
              {allDone ? "Edited" : "Editing"}
            </span>
            {editingFiles.map((file) => (
              <span
                key={file}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-muted/80 text-muted-foreground border border-border/50"
              >
                <FileCode2 className="w-3 h-3" />
                {file}
              </span>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground/60 leading-tight">
            {description}
          </span>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground/30 shrink-0 transition-transform duration-200 ${
            !collapsed ? "rotate-90" : ""
          }`}
        />
      </button>

      {/* Task list */}
      <AnimatePresence>
        {!collapsed && tasks.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-border/40 px-4 py-2.5 space-y-0.5">
              {tasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 py-1.5"
                >
                  <StatusIndicator status={task.status} />
                  <span
                    className={`text-[13px] font-medium ${
                      task.status === "done"
                        ? "text-foreground/60"
                        : task.status === "in_progress"
                        ? "text-foreground"
                        : "text-muted-foreground/30"
                    }`}
                  >
                    {task.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BuildPipelineCard;

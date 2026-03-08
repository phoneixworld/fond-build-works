import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database, Server, Workflow, Layout, Route, Shield, FileCheck,
  CheckCircle2, Circle, Loader2, AlertCircle, ChevronDown, ChevronRight
} from "lucide-react";

export interface PipelineStep {
  id: string;
  label: string;
  icon: React.ElementType;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

const DEFAULT_STEPS: Omit<PipelineStep, "status">[] = [
  { id: "analyze", label: "Analyzing request", icon: FileCheck },
  { id: "schema", label: "Data schemas", icon: Database },
  { id: "api", label: "API integration", icon: Server },
  { id: "ui", label: "UI components", icon: Layout },
  { id: "routing", label: "Routing & navigation", icon: Route },
  { id: "styling", label: "Styling & polish", icon: Workflow },
  { id: "validation", label: "Validation & QA", icon: Shield },
];

interface BuildPipelineCardProps {
  isBuilding: boolean;
  streamContent: string;
  elapsed: number;
}

function detectStepStatus(streamContent: string): Record<string, "pending" | "running" | "done"> {
  const len = streamContent.length;
  const hasHtml = streamContent.includes("```html") || streamContent.includes("```html-preview");
  const hasClosingFence = hasHtml && streamContent.indexOf("```", streamContent.indexOf("```html") + 10) > -1;
  
  // Heuristic step detection based on content length and markers
  const statuses: Record<string, "pending" | "running" | "done"> = {};
  
  // Analyze
  if (len > 0) statuses["analyze"] = len > 50 ? "done" : "running";
  
  // Schema - detected by data/fetch/api patterns
  const hasDataPatterns = /fetch\(|collection|data-|database|storage|api/i.test(streamContent);
  if (len > 100) {
    statuses["schema"] = hasDataPatterns ? "done" : (len > 200 ? "done" : "running");
  }
  
  // API
  if (len > 200) {
    statuses["api"] = hasDataPatterns ? "done" : (len > 400 ? "done" : "running");
  }
  
  // UI
  if (hasHtml) {
    const htmlStart = streamContent.indexOf("```html");
    const htmlContent = streamContent.slice(htmlStart);
    statuses["ui"] = htmlContent.length > 2000 ? "done" : "running";
  } else if (len > 400) {
    statuses["ui"] = "running";
  }
  
  // Routing
  if (hasHtml) {
    const hasNav = /nav|href=|router|scroll-to|#\w+/i.test(streamContent);
    statuses["routing"] = hasNav ? "done" : "running";
  }
  
  // Styling
  if (hasHtml) {
    const htmlStart = streamContent.indexOf("```html");
    const htmlContent = streamContent.slice(htmlStart);
    statuses["styling"] = htmlContent.length > 3000 ? "done" : "running";
  }
  
  // Validation
  if (hasClosingFence) {
    statuses["validation"] = "done";
  } else if (hasHtml) {
    const htmlContent = streamContent.slice(streamContent.indexOf("```html"));
    if (htmlContent.length > 4000) statuses["validation"] = "running";
  }
  
  return statuses;
}

const StatusIcon = ({ status }: { status: PipelineStep["status"] }) => {
  switch (status) {
    case "done":
      return (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
          <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--ide-success))]" />
        </motion.div>
      );
    case "running":
      return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    case "error":
      return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-muted-foreground/20" />;
  }
};

const BuildPipelineCard = ({ isBuilding, streamContent, elapsed }: BuildPipelineCardProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>(
    DEFAULT_STEPS.map(s => ({ ...s, status: "pending" as const }))
  );

  // Update steps based on stream content
  useEffect(() => {
    if (!isBuilding && streamContent.length === 0) {
      setSteps(DEFAULT_STEPS.map(s => ({ ...s, status: "pending" as const })));
      return;
    }

    const detected = detectStepStatus(streamContent);
    setSteps(prev => prev.map(step => ({
      ...step,
      status: detected[step.id] || step.status,
    })));
  }, [streamContent, isBuilding]);

  // Mark all done when build completes
  useEffect(() => {
    if (!isBuilding && streamContent.length > 100) {
      setSteps(prev => prev.map(s => ({
        ...s,
        status: s.status === "running" || s.status === "pending" ? "done" : s.status,
      })));
    }
  }, [isBuilding]);

  const doneCount = steps.filter(s => s.status === "done").length;
  const progress = Math.round((doneCount / steps.length) * 100);
  const allDone = doneCount === steps.length && !isBuilding;
  const hasStarted = steps.some(s => s.status !== "pending");

  if (!hasStarted && !isBuilding) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          {allDone ? (
            <div className="w-6 h-6 rounded-lg bg-[hsl(var(--ide-success))]/10 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-[hsl(var(--ide-success))]" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            </div>
          )}
          <div className="flex flex-col items-start">
            <span className="text-[12px] font-semibold text-foreground tracking-tight">
              {allDone ? "Build complete" : "Building your app..."}
            </span>
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {allDone ? `Completed in ${elapsed}s` : `${elapsed}s · ${progress}%`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/40 font-mono">{doneCount}/{steps.length}</span>
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/30" />}
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-[2px] bg-border/20 mx-4">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: allDone ? "hsl(var(--ide-success))" : "hsl(var(--primary))" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Steps */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 py-2.5 space-y-0.5">
              {steps.map((step, i) => {
                const StepIcon = step.icon;
                const isActive = step.status === "running";
                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`flex items-center gap-3 py-1.5 rounded-lg px-2 -mx-2 transition-colors ${
                      isActive ? "bg-primary/5" : ""
                    }`}
                  >
                    <StatusIcon status={step.status} />
                    <StepIcon className={`w-3 h-3 ${
                      step.status === "done" ? "text-foreground/50" :
                      step.status === "running" ? "text-primary" :
                      "text-muted-foreground/20"
                    }`} />
                    <span className={`text-[11px] font-medium tracking-tight ${
                      step.status === "done" ? "text-foreground/60" :
                      step.status === "running" ? "text-foreground" :
                      "text-muted-foreground/30"
                    }`}>
                      {step.label}
                    </span>
                    {isActive && (
                      <motion.div
                        className="ml-auto flex gap-0.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <motion.span className="w-1 h-1 rounded-full bg-primary" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} />
                        <motion.span className="w-1 h-1 rounded-full bg-primary" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} />
                        <motion.span className="w-1 h-1 rounded-full bg-primary" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} />
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BuildPipelineCard;

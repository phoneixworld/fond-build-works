import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronRight, ChevronDown, Play, SkipForward, AlertTriangle, CheckCircle2, Clock, Loader2, X, HelpCircle, ListChecks, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generatePlan, getNextTask, updateTaskStatus, getPlanProgress, getComplexityColor, getCategoryIcon, type BuildPlan, type PlanTask, type TaskStatus } from "@/lib/planningAgent";
import { usePreview } from "@/contexts/PreviewContext";
import { useProjects } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";

interface PlanningPanelProps {
  onExecuteTask?: (prompt: string) => void;
  onClose?: () => void;
}

const PlanningPanel = ({ onExecuteTask, onClose }: PlanningPanelProps) => {
  const { currentProject } = useProjects();
  const { sandpackFiles } = usePreview();
  const [plan, setPlan] = useState<BuildPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState("");

  const handleGeneratePlan = useCallback(async () => {
    if (!promptInput.trim() || !currentProject) return;
    setIsGenerating(true);
    setError(null);

    try {
      const existingFiles = sandpackFiles ? Object.keys(sandpackFiles) : undefined;
      
      // Fetch schemas
      let schemas: any[] = [];
      try {
        const { data } = await supabase
          .from("project_schemas" as any)
          .select("collection_name, schema")
          .eq("project_id", currentProject.id);
        schemas = data || [];
      } catch {}

      // Fetch knowledge
      let knowledge: string[] = [];
      try {
        const { data } = await supabase
          .from("project_knowledge" as any)
          .select("title, content")
          .eq("project_id", currentProject.id)
          .eq("is_active", true);
        knowledge = (data || []).map((k: any) => `[${k.title}]: ${k.content}`);
      } catch {}

      const result = await generatePlan(
        promptInput,
        existingFiles,
        currentProject.tech_stack || "react",
        schemas,
        knowledge
      );
      setPlan(result);
      setExpandedTasks(new Set(result.tasks.slice(0, 2).map(t => t.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setIsGenerating(false);
    }
  }, [promptInput, currentProject, sandpackFiles]);

  const handleExecuteNext = useCallback(async () => {
    if (!plan || !onExecuteTask) return;
    const nextTask = getNextTask(plan);
    if (!nextTask) return;

    setIsExecuting(true);
    setCurrentTaskId(nextTask.id);
    setPlan(updateTaskStatus(plan, nextTask.id, "in_progress"));

    try {
      await onExecuteTask(nextTask.buildPrompt);
      setPlan(prev => prev ? updateTaskStatus(prev, nextTask.id, "done") : prev);
    } catch {
      setPlan(prev => prev ? updateTaskStatus(prev, nextTask.id, "failed") : prev);
    } finally {
      setIsExecuting(false);
      setCurrentTaskId(null);
    }
  }, [plan, onExecuteTask]);

  const handleSkipTask = (taskId: string) => {
    if (!plan) return;
    setPlan(updateTaskStatus(plan, taskId, "skipped"));
  };

  const toggleExpanded = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const progress = plan ? getPlanProgress(plan) : { done: 0, total: 0, percent: 0 };
  const nextTask = plan ? getNextTask(plan) : null;

  const getStatusIcon = (status: TaskStatus, taskId: string) => {
    if (currentTaskId === taskId) return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    switch (status) {
      case "done": return <CheckCircle2 className="w-4 h-4 text-[hsl(var(--ide-success))]" />;
      case "skipped": return <SkipForward className="w-4 h-4 text-muted-foreground" />;
      case "failed": return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case "in_progress": return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--ide-panel))]">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Planning Agent</h2>
          {plan && (
            <Badge variant="secondary" className="ml-2">
              {progress.done}/{progress.total}
            </Badge>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Input area */}
      {!plan && (
        <div className="p-4 border-b border-border space-y-3">
          <textarea
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="Describe the complex feature you want to build..."
            className="w-full h-24 p-3 rounded-lg bg-background border border-border resize-none text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button 
            onClick={handleGeneratePlan} 
            disabled={!promptInput.trim() || isGenerating}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Build Plan
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/30 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Plan overview */}
      {plan && (
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{plan.summary}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={getComplexityColor(plan.overallComplexity)}>
                  {plan.overallComplexity}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ~{plan.estimatedSteps} build steps
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setPlan(null); setPromptInput(""); }}
            >
              New Plan
            </Button>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progress.percent}%</span>
            </div>
            <Progress value={progress.percent} className="h-2" />
          </div>

          {plan.risks && plan.risks.length > 0 && (
            <div className="p-2 rounded bg-[hsl(var(--ide-warning))]/10 border border-[hsl(var(--ide-warning))]/30 text-xs space-y-1">
              <div className="flex items-center gap-1 font-medium text-[hsl(var(--ide-warning))]">
                <AlertTriangle className="w-3 h-3" />
                Risks
              </div>
              {plan.risks.map((risk, i) => (
                <p key={i} className="text-muted-foreground pl-4">• {risk}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task list */}
      {plan && (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {plan.tasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                className={`rounded-lg border ${
                  task.status === "in_progress" 
                    ? "border-primary bg-primary/5" 
                    : task.status === "done"
                    ? "border-[hsl(var(--ide-success))]/30 bg-[hsl(var(--ide-success))]/5"
                    : "border-border bg-card"
                }`}
              >
                <button
                  onClick={() => toggleExpanded(task.id)}
                  className="w-full p-3 flex items-center gap-2 text-left"
                >
                  {getStatusIcon(task.status, task.id)}
                  <span className="text-sm">{getCategoryIcon(task.category)}</span>
                  <span className="flex-1 font-medium text-sm truncate">{task.title}</span>
                  <Badge variant="outline" className={`text-xs ${getComplexityColor(task.complexity)}`}>
                    {task.complexity}
                  </Badge>
                  {expandedTasks.has(task.id) ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                <AnimatePresence>
                  {expandedTasks.has(task.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                        <p className="text-xs text-muted-foreground">{task.description}</p>
                        
                        {task.filesAffected.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {task.filesAffected.map((file) => (
                              <code key={file} className="text-xs px-1.5 py-0.5 rounded bg-muted">
                                {file}
                              </code>
                            ))}
                          </div>
                        )}

                        {task.dependsOn.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Depends on: {task.dependsOn.join(", ")}
                          </p>
                        )}

                        {task.needsUserInput && task.userQuestion && (
                          <div className="p-2 rounded bg-primary/10 border border-primary/30 text-xs flex items-start gap-2">
                            <HelpCircle className="w-3 h-3 mt-0.5 text-primary" />
                            <span>{task.userQuestion}</span>
                          </div>
                        )}

                        {task.status === "pending" && (
                          <div className="flex gap-2">
                            {nextTask?.id === task.id && (
                              <Button
                                size="sm"
                                onClick={handleExecuteNext}
                                disabled={isExecuting}
                              >
                                <Play className="w-3 h-3 mr-1" />
                                Execute
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSkipTask(task.id)}
                            >
                              <SkipForward className="w-3 h-3 mr-1" />
                              Skip
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Execute next button */}
      {plan && nextTask && (
        <div className="p-4 border-t border-border">
          <Button 
            onClick={handleExecuteNext} 
            disabled={isExecuting}
            className="w-full"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Building: {plan.tasks.find(t => t.id === currentTaskId)?.title}
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Execute Next: {nextTask.title}
              </>
            )}
          </Button>
        </div>
      )}

      {/* All done */}
      {plan && !nextTask && progress.percent === 100 && (
        <div className="p-4 border-t border-border text-center">
          <div className="flex items-center justify-center gap-2 text-[hsl(var(--ide-success))]">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">All tasks completed!</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanningPanel;

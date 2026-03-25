/**
 * Task Executor — topologically sorts PlanTasks and executes them
 * sequentially through the build-agent, accumulating files across tasks.
 */

import { streamBuildAgent } from "@/lib/agentPipeline";
import type { BuildPlan, PlanTask, TaskStatus } from "@/lib/planningAgent";
import { updateTaskStatus } from "@/lib/planningAgent";
import { validateAllFiles, buildFileRetryPrompt } from "@/lib/compiler/syntaxValidator";

export interface TaskExecutionCallbacks {
  onTaskStart: (task: PlanTask, index: number, total: number) => void;
  onTaskDelta: (task: PlanTask, chunk: string) => void;
  onTaskDone: (task: PlanTask, fullText: string, files: Record<string, string>) => void;
  onTaskError: (task: PlanTask, error: string) => void;
  onPlanComplete: (accumulatedFiles: Record<string, string>, plan: BuildPlan) => void;
}

export interface TaskExecutionOptions {
  projectId: string;
  techStack: string;
  schemas?: any[];
  model?: string;
  designTheme?: string;
  knowledge?: string[];
  snippetsContext?: string;
}

/**
 * Topologically sort tasks based on dependsOn.
 * Returns tasks in valid execution order (dependencies first).
 */
export function topologicalSort(tasks: PlanTask[]): PlanTask[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<string>();
  const sorted: PlanTask[] = [];

  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task) return;
    for (const depId of task.dependsOn) {
      visit(depId);
    }
    sorted.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return sorted;
}

/**
 * Build a current-code summary string from accumulated files.
 * Prioritizes App entry point, then includes other files within budget.
 */
function buildCodeContext(files: Record<string, string>, budgetChars = 16000): string {
  const entries = Object.entries(files);
  if (entries.length === 0) return "";

  const totalChars = entries.reduce((sum, [, code]) => sum + code.length, 0);
  if (totalChars <= budgetChars) {
    return entries.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
  }

  // Prioritize entry files
  const ENTRY = ["/App.jsx", "/App.tsx", "/App.js"];
  const keyFiles = entries.filter(([p]) => ENTRY.some(k => p.endsWith(k)));
  const otherFiles = entries.filter(([p]) => !ENTRY.some(k => p.endsWith(k)));
  const keyCode = keyFiles.map(([path, code]) => `--- ${path}\n${code}`).join("\n\n");
  let remaining = budgetChars - keyCode.length;

  const otherCode = otherFiles.map(([path, code]) => {
    if (remaining <= 0) return `--- ${path} (${code.length} chars — omitted)`;
    if (code.length <= remaining) {
      remaining -= code.length;
      return `--- ${path}\n${code}`;
    }
    const snippet = code.slice(0, Math.max(200, Math.floor(remaining * 0.6)));
    remaining = 0;
    return `--- ${path} (truncated)\n${snippet}\n...[truncated]`;
  }).join("\n\n");

  return `${keyCode}\n\n${otherCode}`;
}

/**
 * Parse react files from build-agent output (simplified — reuses the fence parsing pattern).
 * Returns extracted files or null.
 */
function extractFilesFromOutput(text: string): Record<string, string> | null {
  const files: Record<string, string> = {};
  const separatorRegex = /^-{3}\s+(\/?[A-Za-z0-9._/-]+\.[A-Za-z0-9]+)\s*-{0,3}\s*$/;
  const depsSeparator = /^-{3}\s+\/?dependencies\s*$/i;

  // Find code fence
  const fencePatterns = ["```react-preview", "```jsx-preview", "```react", "```jsx"];
  let fenceStart = -1;
  for (const pattern of fencePatterns) {
    fenceStart = text.indexOf(pattern);
    if (fenceStart !== -1) break;
  }
  if (fenceStart === -1) return null;

  const codeStart = text.indexOf("\n", fenceStart) + 1;
  let fenceEnd = -1;
  let searchFrom = codeStart;
  while (searchFrom < text.length) {
    const candidate = text.indexOf("\n```", searchFrom);
    if (candidate === -1) break;
    const afterFence = candidate + 4;
    if (afterFence >= text.length || /[\s\n\r]/.test(text[afterFence])) {
      fenceEnd = candidate;
      break;
    }
    searchFrom = candidate + 4;
  }
  const block = fenceEnd === -1 ? text.slice(codeStart) : text.slice(codeStart, fenceEnd);

  // Parse file sections
  const lines = block.split("\n");
  let currentFile: string | null = null;
  let currentLines: string[] = [];
  let inDepsSection = false;

  function flush() {
    if (currentFile && !inDepsSection) {
      const code = currentLines.join("\n").trim();
      if (code.length > 0) {
        let fname = currentFile.startsWith("/") ? currentFile : `/${currentFile}`;
        fname = fname.replace(/^\/src\//, "/");
        files[fname] = code;
      }
    }
    currentFile = null;
    currentLines = [];
    inDepsSection = false;
  }

  for (const line of lines) {
    if (depsSeparator.test(line.trim())) {
      flush();
      inDepsSection = true;
      continue;
    }
    const match = line.trim().match(separatorRegex);
    if (match) {
      flush();
      currentFile = match[1];
      continue;
    }
    if (currentFile && !inDepsSection) currentLines.push(line);
  }
  flush();

  if (Object.keys(files).length === 0 && block.trim().length > 20) {
    files["/App.jsx"] = block.trim();
  }

  return Object.keys(files).length > 0 ? files : null;
}

/**
 * Execute a build plan task-by-task through the build agent.
 * Each task's buildPrompt is sent as a self-contained instruction,
 * with accumulated files from previous tasks as currentCode context.
 */
export async function executePlan(
  plan: BuildPlan,
  options: TaskExecutionOptions,
  callbacks: TaskExecutionCallbacks
): Promise<{ files: Record<string, string>; plan: BuildPlan }> {
  const sortedTasks = topologicalSort(plan.tasks);
  let accumulatedFiles: Record<string, string> = {};
  let updatedPlan = { ...plan };

  for (let i = 0; i < sortedTasks.length; i++) {
    const task = sortedTasks[i];

    // Skip tasks needing user input (they'll be paused)
    if (task.needsUserInput) {
      updatedPlan = updateTaskStatus(updatedPlan, task.id, "skipped");
      continue;
    }

    updatedPlan = updateTaskStatus(updatedPlan, task.id, "in_progress");
    callbacks.onTaskStart(task, i, sortedTasks.length);

    const codeContext = buildCodeContext(accumulatedFiles);

    // Build a focused prompt that includes task context
    const taskPrompt = `## CURRENT TASK (${i + 1}/${sortedTasks.length}): ${task.title}

${task.buildPrompt}

## FILES THIS TASK SHOULD CREATE/MODIFY:
${task.filesAffected.map(f => `- ${f}`).join("\n")}

## IMPORTANT:
- Generate ONLY the files listed above (plus /App.jsx if it needs updating)
- Make sure imports reference files from previous tasks correctly
- Output complete, working code — no placeholders or TODOs`;

    try {
      const taskFiles = await new Promise<Record<string, string>>((resolve, reject) => {
        let fullText = "";

        streamBuildAgent({
          messages: [{ role: "user", content: taskPrompt }],
          projectId: options.projectId,
          techStack: options.techStack,
          schemas: options.schemas,
          model: options.model,
          designTheme: options.designTheme,
          knowledge: options.knowledge,
          snippetsContext: options.snippetsContext,
          currentCode: codeContext || undefined,
          onDelta: (chunk) => {
            fullText += chunk;
            callbacks.onTaskDelta(task, chunk);
          },
          onDone: (responseText) => {
            const extracted = extractFilesFromOutput(responseText);
            if (extracted) {
              // Pre-commit syntax validation (Babel parse gate)
              const { valid, invalid } = validateAllFiles(extracted);
              if (invalid.length > 0) {
                console.warn(`[TaskExecutor] ${invalid.length} file(s) failed syntax validation in task '${task.title}'`);
                for (const parseErr of invalid) {
                  console.warn(`[TaskExecutor] ❌ ${parseErr.path}: ${parseErr.error}`);
                }
              }
              // Use only valid files (drop unparseable ones)
              const safeFiles = Object.keys(valid).length > 0 ? valid : extracted;
              callbacks.onTaskDone(task, responseText, safeFiles);
              resolve(safeFiles);
            } else {
              callbacks.onTaskDone(task, responseText, {});
              resolve({});
            }
          },
          onError: (err) => {
            callbacks.onTaskError(task, err);
            reject(new Error(err));
          },
        });
      });

      // Accumulate files — later tasks override earlier ones
      accumulatedFiles = { ...accumulatedFiles, ...taskFiles };
      updatedPlan = updateTaskStatus(updatedPlan, task.id, "done");
    } catch (err) {
      updatedPlan = updateTaskStatus(updatedPlan, task.id, "failed");
      // Continue with remaining tasks — don't abort entire plan
      console.error(`[TaskExecutor] Task ${task.id} failed:`, err);
    }
  }

  callbacks.onPlanComplete(accumulatedFiles, updatedPlan);
  return { files: accumulatedFiles, plan: updatedPlan };
}

/**
 * Adaptive Task Splitter — auto-splits oversized plan tasks.
 * 
 * Detects tasks whose buildPrompt + expected output would exceed a safe token budget,
 * then recursively subdivides them into smaller, independently buildable sub-tasks.
 * 
 * This prevents 16K-token monoliths that degrade model output quality.
 */

import type { PlanTask } from "@/lib/planningAgent";

// ─── Token estimation ─────────────────────────────────────────────────────

/**
 * Rough token estimate: ~4 chars per token for English/code.
 * Conservative to avoid under-splitting.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate the total token cost of a task:
 *   buildPrompt tokens + estimated output tokens (based on filesAffected count)
 */
function estimateTaskTokenCost(task: PlanTask): number {
  const promptTokens = estimateTokens(task.buildPrompt);
  // Estimate ~800 tokens per file generated
  const outputTokens = task.filesAffected.length * 800;
  return promptTokens + outputTokens;
}

// ─── Split strategies ─────────────────────────────────────────────────────

/**
 * Split a task by its filesAffected list.
 * Groups files into chunks that stay under the token budget.
 */
function splitByFiles(task: PlanTask, maxFilesPerTask: number): PlanTask[] {
  const files = task.filesAffected;
  if (files.length <= maxFilesPerTask) return [task];

  const chunks: string[][] = [];
  for (let i = 0; i < files.length; i += maxFilesPerTask) {
    chunks.push(files.slice(i, i + maxFilesPerTask));
  }

  return chunks.map((fileChunk, idx) => ({
    ...task,
    id: `${task.id}-${idx + 1}`,
    title: `${task.title} (part ${idx + 1}/${chunks.length})`,
    buildPrompt: `${task.buildPrompt}\n\n## SCOPE: Generate ONLY these files:\n${fileChunk.map(f => `- ${f}`).join("\n")}`,
    filesAffected: fileChunk,
    dependsOn: idx === 0 ? task.dependsOn : [`${task.id}-${idx}`],
  }));
}

/**
 * Split a task by detecting logical sections in the buildPrompt.
 * Looks for numbered lists, bullet points, or "and" conjunctions.
 */
function splitByPromptSections(task: PlanTask): PlanTask[] {
  const prompt = task.buildPrompt;

  // Look for numbered items or bullet points
  const sections = prompt.split(/\n(?=\d+\.\s|\-\s|\*\s)/).filter(s => s.trim().length > 20);

  if (sections.length <= 1) return [task];

  // Group sections into sub-tasks, max 2-3 sections per task
  const maxSectionsPerTask = 2;
  const subTasks: PlanTask[] = [];

  for (let i = 0; i < sections.length; i += maxSectionsPerTask) {
    const sectionGroup = sections.slice(i, i + maxSectionsPerTask);
    const idx = Math.floor(i / maxSectionsPerTask);
    const totalParts = Math.ceil(sections.length / maxSectionsPerTask);

    // Distribute files roughly across sub-tasks
    const filesPerPart = Math.ceil(task.filesAffected.length / totalParts);
    const fileSlice = task.filesAffected.slice(idx * filesPerPart, (idx + 1) * filesPerPart);

    subTasks.push({
      ...task,
      id: `${task.id}-s${idx + 1}`,
      title: `${task.title} (${idx + 1}/${totalParts})`,
      buildPrompt: sectionGroup.join("\n"),
      filesAffected: fileSlice.length > 0 ? fileSlice : task.filesAffected,
      dependsOn: idx === 0 ? task.dependsOn : [`${task.id}-s${idx}`],
    });
  }

  return subTasks;
}

// ─── Main: Apply adaptive splitting ───────────────────────────────────────

export interface SplitResult {
  tasks: PlanTask[];
  splitCount: number;       // How many tasks were split
  originalCount: number;    // Original task count
  totalAfterSplit: number;  // Total tasks after splitting
}

/**
 * Analyze and split oversized tasks in a plan.
 * 
 * @param tasks - Original plan tasks
 * @param maxTokenBudget - Max estimated tokens per task (default: 6000)
 * @param maxFilesPerTask - Max files a single task should generate (default: 4)
 * @returns Updated task list with oversized tasks split
 */
export function applyAdaptiveSplitting(
  tasks: PlanTask[],
  maxTokenBudget = 6000,
  maxFilesPerTask = 4
): SplitResult {
  const result: PlanTask[] = [];
  let splitCount = 0;

  for (const task of tasks) {
    const tokenCost = estimateTaskTokenCost(task);
    const fileCount = task.filesAffected.length;

    // Check if task needs splitting
    const needsSplit = tokenCost > maxTokenBudget || fileCount > maxFilesPerTask;

    if (!needsSplit) {
      result.push(task);
      continue;
    }

    splitCount++;
    console.log(
      `[TaskSplitter] Splitting "${task.title}" — ${tokenCost} est. tokens, ${fileCount} files`
    );

    // Strategy 1: Split by files if too many files
    if (fileCount > maxFilesPerTask) {
      const split = splitByFiles(task, maxFilesPerTask);
      // Verify each sub-task is within budget, split further if needed
      for (const subTask of split) {
        const subCost = estimateTaskTokenCost(subTask);
        if (subCost > maxTokenBudget && subTask.filesAffected.length > 2) {
          result.push(...splitByFiles(subTask, 2));
        } else {
          result.push(subTask);
        }
      }
      continue;
    }

    // Strategy 2: Split by prompt sections if prompt is too long
    if (tokenCost > maxTokenBudget) {
      const split = splitByPromptSections(task);
      if (split.length > 1) {
        result.push(...split);
        continue;
      }
    }

    // Fallback: keep as-is but log a warning
    console.warn(
      `[TaskSplitter] Could not split "${task.title}" further (${tokenCost} tokens, ${fileCount} files)`
    );
    result.push(task);
  }

  // Fix dependency references: if a task depends on a split task, point to its last part
  const taskIds = new Set(result.map(t => t.id));
  for (const task of result) {
    task.dependsOn = task.dependsOn.map(depId => {
      if (taskIds.has(depId)) return depId;
      // Find the last sub-task of this split task
      const subTasks = result.filter(t => t.id.startsWith(depId + "-"));
      if (subTasks.length > 0) return subTasks[subTasks.length - 1].id;
      return depId; // Keep original if not found
    });
  }

  return {
    tasks: result,
    splitCount,
    originalCount: tasks.length,
    totalAfterSplit: result.length,
  };
}

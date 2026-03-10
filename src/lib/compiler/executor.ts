/**
 * Build Compiler v1.0 — Execution Engine
 * 
 * Runs tasks through the AI model with full workspace context.
 * Each task sees the accumulated workspace and is told to import, not recreate.
 */

import { streamBuildAgent } from "@/lib/agentPipeline";
import type { BuildContext, CompilerTask, TaskGraph } from "./types";
import type { Workspace } from "./workspace";

// ─── Task Prompt Builder ──────────────────────────────────────────────────

export function buildTaskPrompt(
  task: CompilerTask,
  ctx: BuildContext,
  workspace: Workspace,
  taskIndex: number,
  totalTasks: number
): string {
  const existingFiles = workspace.listFiles();
  const workspaceContext = buildWorkspaceContext(workspace, 24000);

  return `## BUILD TASK ${taskIndex + 1}/${totalTasks}: ${task.label}

### What to build:
${task.description}

### Files to create/modify:
${task.produces.map(f => `- CREATE: ${f}`).join("\n")}
${task.touches.length > 0 ? task.touches.map(f => `- MODIFY: ${f}`).join("\n") : ""}

### Project context:
- Tech stack: ${ctx.techStack}
- Build intent: ${ctx.buildIntent}
${ctx.ir.entities.length > 0 ? `- Entities: ${ctx.ir.entities.map(e => `${e.name}(${e.fields.map(f => f.name).join(", ")})`).join(", ")}` : ""}
${ctx.ir.roles.length > 0 ? `- Roles: ${ctx.ir.roles.map(r => r.name).join(", ")}` : ""}
${ctx.ir.routes.length > 0 ? `- Routes: ${ctx.ir.routes.map(r => `${r.path} → ${r.page}`).join(", ")}` : ""}

### Existing workspace files:
${existingFiles.length > 0 ? existingFiles.map(f => `- ${f}`).join("\n") : "(empty workspace)"}

${workspaceContext ? `### Current code:\n${workspaceContext}` : ""}

### RULES:
1. Generate ONLY the files listed above
2. Import from existing workspace files — do NOT recreate them
3. Use the project's data API pattern: fetch(\`\${window.__SUPABASE_URL__}/functions/v1/project-api\`, { body: { project_id: window.__PROJECT_ID__, action, collection, data } })
4. For auth, use the AuthContext pattern: import { useAuth } from '../contexts/AuthContext' — AuthContext MUST read window.__PROJECT_ID__, window.__SUPABASE_URL__, window.__SUPABASE_KEY__ for API calls
5. Output complete, working code — no placeholders, no TODOs, no stubs
6. Every component must have a default export
7. Use Tailwind CSS with design tokens (var(--color-*)) for all styling`;
}

// ─── Workspace Context Builder ────────────────────────────────────────────

function buildWorkspaceContext(workspace: Workspace, budgetChars: number): string {
  const files = workspace.listFiles();
  if (files.length === 0) return "";

  const PRIORITY_FILES = ["/App.jsx", "/App.tsx", "/contexts/AuthContext.jsx"];
  const prioritized = files.filter(f => PRIORITY_FILES.some(p => f.endsWith(p)));
  const others = files.filter(f => !PRIORITY_FILES.some(p => f.endsWith(p)));

  let result = "";
  let remaining = budgetChars;

  // Priority files first (full content)
  for (const path of prioritized) {
    const content = workspace.getFile(path)!;
    const block = `--- ${path}\n${content}\n\n`;
    if (block.length <= remaining) {
      result += block;
      remaining -= block.length;
    }
  }

  // Other files (truncate if needed)
  for (const path of others) {
    if (remaining <= 0) break;
    const content = workspace.getFile(path)!;
    const block = `--- ${path}\n${content}\n\n`;

    if (block.length <= remaining) {
      result += block;
      remaining -= block.length;
    } else if (remaining > 500) {
      // Include truncated version
      const snippet = content.slice(0, Math.max(200, remaining - 100));
      result += `--- ${path} (truncated)\n${snippet}\n...[truncated]\n\n`;
      remaining = 0;
    } else {
      result += `--- ${path} (${content.length} chars — omitted)\n`;
      remaining -= 50;
    }
  }

  return result;
}

// ─── Task Execution ───────────────────────────────────────────────────────

export interface ExecutionCallbacks {
  onTaskStart: (task: CompilerTask, index: number, total: number) => void;
  onTaskDelta: (task: CompilerTask, chunk: string) => void;
  onTaskDone: (task: CompilerTask, files: Record<string, string>) => void;
  onTaskError: (task: CompilerTask, error: string) => void;
  onPassStart: (passIndex: number, taskIds: string[]) => void;
}

/**
 * Execute a single task: build prompt, call model, parse output, return files.
 */
export async function executeTask(
  task: CompilerTask,
  ctx: BuildContext,
  workspace: Workspace,
  taskIndex: number,
  totalTasks: number,
  callbacks: ExecutionCallbacks
): Promise<Record<string, string>> {
  const prompt = buildTaskPrompt(task, ctx, workspace, taskIndex, totalTasks);
  task.buildPrompt = prompt;

  return new Promise<Record<string, string>>((resolve, reject) => {
    let fullText = "";

    streamBuildAgent({
      messages: [{ role: "user", content: prompt }],
      projectId: ctx.projectId,
      techStack: ctx.techStack,
      schemas: ctx.schemas,
      model: ctx.model,
      designTheme: ctx.designTheme,
      knowledge: ctx.knowledge,
      currentCode: undefined, // We embed context in the prompt directly
      onDelta: (chunk) => {
        fullText += chunk;
        callbacks.onTaskDelta(task, chunk);
      },
      onDone: (responseText) => {
        const extracted = extractFilesFromOutput(responseText);
        if (extracted && Object.keys(extracted).length > 0) {
          resolve(extracted);
        } else {
          // No files extracted — this is a failure for a build task
          resolve({});
        }
      },
      onError: (err) => {
        reject(new Error(err));
      },
    });
  });
}

// ─── Output Parser ────────────────────────────────────────────────────────

/**
 * Parse files from build-agent output.
 * Supports: ```react-preview / ```jsx / ```react fences with --- separators
 */
function extractFilesFromOutput(text: string): Record<string, string> | null {
  const files: Record<string, string> = {};
  const separatorRegex = /^-{3}\s+(\/?\w[\w/.-]*\.(?:jsx?|tsx?|css))\s*-{0,3}\s*$/;
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
    // Check for dependencies section — stop collecting file content
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

  // If no separators, treat whole block as App.jsx
  if (Object.keys(files).length === 0 && block.trim().length > 20) {
    files["/App.jsx"] = block.trim();
  }

  return Object.keys(files).length > 0 ? files : null;
}

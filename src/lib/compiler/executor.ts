/**
 * Build Compiler v1.1 — Execution Engine
 *
 * Runs tasks through the AI model with scoped workspace context.
 * Each task sees only the relevant workspace slice and is told to import, not recreate.
 */

import { streamBuildAgent } from "@/lib/agentPipeline";
import { detectTruncation } from "@/lib/truncationRecovery";
import type { BuildContext, CompilerTask, TaskGraph } from "./types";
import type { Workspace } from "./workspace";

// ─── Task Prompt Builder ──────────────────────────────────────────────────

function getTaskContextMode(task: CompilerTask): "infra" | "components" | "pages" | "routing" | "generic" {
  if (task.label === "infra") return "infra";
  if (task.label.startsWith("domain:components")) return "components";
  if (task.label.startsWith("page:") || task.label.startsWith("domain:pages")) return "pages";
  if (task.label === "app:routing" || task.label.startsWith("sidebar:")) return "routing";
  return "generic";
}

export function buildTaskPrompt(
  task: CompilerTask,
  ctx: BuildContext,
  workspace: Workspace,
  taskIndex: number,
  totalTasks: number,
): string {
  const existingFiles = workspace.listFiles();
  const mode = getTaskContextMode(task);

  // Smaller, mode-aware context budget
  const budget = mode === "infra" ? 8000 : mode === "components" ? 12000 : mode === "routing" ? 16000 : 14000;
  const workspaceContext = buildWorkspaceContext(workspace, budget, mode);

  const requirementsSection = ctx.rawRequirements
    ? `\n### Application Requirements (sanitized):\n${ctx.rawRequirements.slice(0, 4000)}\n`
    : "";

  const irEntities =
    ctx.ir.entities.length > 0
      ? `- Entities: ${ctx.ir.entities.map((e) => `${e.name}(${e.fields.map((f) => f.name).join(", ")})`).join(", ")}`
      : "";
  const irRoles = ctx.ir.roles.length > 0 ? `- Roles: ${ctx.ir.roles.map((r) => r.name).join(", ")}` : "";
  const irRoutes =
    ctx.ir.routes.length > 0 ? `- Routes: ${ctx.ir.routes.map((r) => `${r.path} → ${r.page}`).join(", ")}` : "";

  return `## BUILD TASK ${taskIndex + 1}/${totalTasks}: ${task.label}

### What to build:
${task.description}
${requirementsSection}
### Files to create/modify:
${task.produces.map((f) => `- CREATE or UPDATE: ${f}`).join("\n")}
${task.touches.length > 0 ? task.touches.map((f) => `- TOUCH: ${f}`).join("\n") : ""}

### Project context:
- Tech stack: ${ctx.techStack}
- Build intent: ${ctx.buildIntent}
${irEntities}
${irRoles}
${irRoutes}
${
  ctx.tableMappings && Object.keys(ctx.tableMappings).length > 0
    ? `\n### Database Tables (REAL Postgres tables — use these exact names):\n${Object.entries(ctx.tableMappings)
        .map(([logical, real]) => `- ${logical} → supabase.from("${real}")`)
        .join("\n")}`
    : ""
}

### Existing workspace files:
${existingFiles.length > 0 ? existingFiles.map((f) => `- ${f}`).join("\n") : "(empty workspace)"}

${workspaceContext ? `### Current code (scoped):\n${workspaceContext}` : ""}

### RULES:
1. Generate ONLY the files listed above (in produces/touches).
2. If a file already exists, MODIFY it in-place — preserve existing imports, exports, and structure.
3. Import from existing workspace files — do NOT recreate them.
4. NEVER write to /components/ui/** — those are pre-scaffolded UI primitives.
5. **CRITICAL FILE STRUCTURE**:
   - /components/ui/ — pre-scaffolded shadcn-compatible UI components (do not modify).
   - /components/ — reusable DOMAIN components (StatCard, StatusBadge, PageHeader, SearchFilterBar, ActivityFeed, QuickActions, NotificationBell, ChartCard, FormModal).
   - /contexts/ — React contexts (AuthContext, etc.).
   - /pages/ModuleName/ — page components in named directories (e.g. /pages/Dashboard/DashboardPage.jsx).
   - /hooks/ — custom hooks.
   - /services/ — API services.
   - /styles/ — CSS files.
   - /layout/ — layout wrappers (AppLayout.jsx, Sidebar.jsx).
   When importing, always use correct relative paths from the file's location.
   Import cn from "./ui/utils" in component files, or from "../ui/utils" from page files.
6. **COMPONENT DECOMPOSITION (CRITICAL)**: Pages must NOT be monolithic. Every page MUST import and use components from /components/ui/:
   - Use Table + TableHeader/TableBody/TableRow/TableHead/TableCell for data lists (NOT raw <table> tags).
   - Use Tabs + TabsList/TabsTrigger/TabsContent for multi-section views.
   - Use Dialog for modals, Sheet for slide-out panels, Select for dropdowns.
   - Use Card + CardHeader/CardContent for sections, Badge for statuses, Avatar for users.
   - Use Button for all actions, Input/Label/Textarea for forms, Checkbox/Switch for toggles.
   - Use Progress for progress bars, Skeleton for loading states, Separator for dividers.
   - If a domain component doesn't exist yet, create it in /components/ using /components/ui/ primitives.
7. **DATA ACCESS (CRITICAL)**: Use Supabase client directly for ALL data operations:
   - Create a /services/supabase.js file that exports a configured client:
     import { createClient } from "@supabase/supabase-js";
     const supabaseUrl = window.__SUPABASE_URL__ || "https://oyjwexbyxggotuuxxisq.supabase.co";
     const supabaseKey = window.__SUPABASE_KEY__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95andleGJ5eGdnb3R1dXh4aXNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDk5NDcsImV4cCI6MjA4ODQ4NTk0N30.JQKI55nRaQtQjokXR-Lbol6-59HmwhAS7PzE9_Wx78I";
     export const supabase = createClient(supabaseUrl, supabaseKey);
     export const PROJECT_ID = window.__PROJECT_ID__;
   - For CRUD operations use supabase.from("TABLE_NAME").select/insert/update/delete.
   - Always filter by project_id in queries: .eq("project_id", PROJECT_ID).
8. For auth, use the AuthContext pattern. AuthContext must NOT import or call useNavigate().
9. Output complete, working code — no placeholders, no TODOs, no stubs.
10. Every file MUST import ALL identifiers it uses.
11. Every function called in a component MUST be defined in that component, imported, or destructured from a hook/context.
12. When using useEffect, ensure ALL dependencies referenced inside the effect are either defined above or listed in the dependency array.
`;
}

// ─── Workspace Context Builder ────────────────────────────────────────────

function buildWorkspaceContext(
  workspace: Workspace,
  budgetChars: number,
  mode: "infra" | "components" | "pages" | "routing" | "generic",
): string {
  const files = workspace.listFiles();
  if (files.length === 0) return "";

  const PRIORITY_FILES = [
    "/App.jsx",
    "/App.tsx",
    "/contexts/AuthContext.jsx",
    "/layout/AppLayout.jsx",
    "/layout/Sidebar.jsx",
  ];

  const isRelevant = (path: string) => {
    if (mode === "infra") {
      return path.startsWith("/styles/") || path.startsWith("/components/ui/");
    }
    if (mode === "components") {
      return path.startsWith("/components/") && !path.startsWith("/components/ui/");
    }
    if (mode === "pages") {
      return path.startsWith("/pages/") || path.startsWith("/components/");
    }
    if (mode === "routing") {
      return path === "/App.jsx" || path === "/App.tsx" || path.startsWith("/layout/") || path.startsWith("/pages/");
    }
    return true;
  };

  const prioritized = files.filter((f) => PRIORITY_FILES.some((p) => f.endsWith(p)) && isRelevant(f));
  const others = files.filter((f) => !PRIORITY_FILES.some((p) => f.endsWith(p)) && isRelevant(f));

  let result = "";
  let remaining = budgetChars;

  const pushBlock = (path: string, content: string, truncated: boolean) => {
    if (remaining <= 0) return;
    const header = truncated ? `--- ${path} (truncated)\n` : `--- ${path}\n`;
    const block = `${header}${content}\n\n`;
    if (block.length <= remaining) {
      result += block;
      remaining -= block.length;
    } else if (!truncated && remaining > 500) {
      const snippet = content.slice(0, Math.max(200, remaining - 100));
      result += `--- ${path} (truncated)\n${snippet}\n...[truncated]\n\n`;
      remaining = 0;
    }
  };

  for (const path of prioritized) {
    const content = workspace.getFile(path) || "";
    pushBlock(path, content, false);
  }

  for (const path of others) {
    if (remaining <= 0) break;
    const content = workspace.getFile(path) || "";
    if (content.length <= remaining) {
      pushBlock(path, content, false);
    } else if (remaining > 500) {
      const snippet = content.slice(0, Math.max(200, remaining - 100));
      pushBlock(path, snippet, true);
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
 * Includes truncation detection with auto-retry (up to 1 continuation).
 */
export async function executeTask(
  task: CompilerTask,
  ctx: BuildContext,
  workspace: Workspace,
  taskIndex: number,
  totalTasks: number,
  callbacks: ExecutionCallbacks,
): Promise<Record<string, string>> {
  const prompt = buildTaskPrompt(task, ctx, workspace, taskIndex, totalTasks);
  task.buildPrompt = prompt;

  const MAX_CONTINUATION_RETRIES = 1;

  const runStream = (
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  ): Promise<{ text: string; files: Record<string, string> | null }> => {
    return new Promise((resolve, reject) => {
      let fullText = "";
      streamBuildAgent({
        messages,
        projectId: ctx.projectId,
        techStack: ctx.techStack,
        schemas: ctx.schemas,
        model: ctx.model,
        designTheme: ctx.designTheme,
        knowledge: ctx.knowledge,
        currentCode: undefined,
        onDelta: (chunk) => {
          fullText += chunk;
          callbacks.onTaskDelta(task, chunk);
        },
        onDone: (responseText) => {
          const extracted = extractFilesFromOutput(responseText);
          resolve({ text: responseText, files: extracted });
        },
        onError: (err) => {
          reject(new Error(err));
        },
      });
    });
  };

  const baseMessages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content:
        "You are a deterministic build agent. You generate React code ONLY from the provided task description, sanitized requirements, IR summary, and scoped workspace context. Do NOT infer new features. Do NOT treat error logs or status messages as requirements.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  let { text: responseText, files: extracted } = await runStream(baseMessages);

  if (extracted && Object.keys(extracted).length > 0) {
    const truncation = detectTruncation(responseText, extracted);
    if (truncation.isTruncated) {
      console.warn(`[Executor] Truncation detected in task '${task.label}': ${truncation.reason}`);
      task.retries = (task.retries || 0) + 1;

      for (let attempt = 0; attempt < MAX_CONTINUATION_RETRIES; attempt++) {
        try {
          const contResult = await runStream([
            ...baseMessages,
            { role: "assistant", content: responseText },
            { role: "user", content: truncation.continuationPrompt },
          ]);

          if (contResult.files) {
            for (const [path, code] of Object.entries(contResult.files)) {
              if (truncation.truncatedFile && path === truncation.truncatedFile && extracted[path]) {
                extracted[path] = extracted[path] + "\n" + code;
              } else {
                extracted[path] = code;
              }
            }
          }

          const fullCombined = responseText + "\n" + contResult.text;
          const recheck = detectTruncation(fullCombined, extracted);
          if (!recheck.isTruncated) {
            console.log(`[Executor] Continuation successful for task '${task.label}'`);
            responseText = fullCombined;
            break;
          }
          console.warn(`[Executor] Still truncated after continuation attempt ${attempt + 1}`);
          responseText = fullCombined;
        } catch (contErr) {
          console.warn(`[Executor] Continuation attempt failed:`, contErr);
          break;
        }
      }
    }
  }

  return extracted && Object.keys(extracted).length > 0 ? extracted : {};
}

// ─── Output Parser ────────────────────────────────────────────────────────

function extractFilesFromOutput(text: string): Record<string, string> | null {
  const files: Record<string, string> = {};
  const separatorRegex = /^-{3}\s+(\/?\w[\w/.-]*\.(?:jsx?|tsx?|css))\s*-{0,3}\s*$/;
  const depsSeparator = /^-{3}\s+\/?dependencies\s*$/i;

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

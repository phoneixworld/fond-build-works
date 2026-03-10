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
3. **CRITICAL FILE STRUCTURE**: All files use these directories from root:
   - /components/ui/ — shared UI (Card, Spinner, Toast, DataTable)
   - /components/ — reusable components (ProtectedRoute, Sidebar, etc.)
   - /contexts/ — React contexts (AuthContext, etc.)
   - /pages/ — page components (can be nested: /pages/Auth/LoginPage.jsx)
   - /hooks/ — custom hooks
   - /services/ — API services
   - /styles/ — CSS files
   - /layout/ — layout wrappers
   When importing, always use correct relative paths from the file's location. Example: from /pages/Auth/LoginPage.jsx, import Card as '../../components/ui/Card', AuthContext as '../../contexts/AuthContext'. From /pages/Dashboard.jsx, import as '../components/ui/Card'.
4. Use the project's data API pattern: fetch(\`\${window.__SUPABASE_URL__}/functions/v1/project-api\`, { body: { project_id: window.__PROJECT_ID__, action, collection, data } })
5. For auth, use the AuthContext pattern. Import path depends on file location (e.g. from /pages/Auth/LoginPage.jsx use '../../contexts/AuthContext', from /pages/Dashboard.jsx use '../contexts/AuthContext', from /App.jsx use './contexts/AuthContext')
   - AuthContext MUST read window.__PROJECT_ID__, window.__SUPABASE_URL__, window.__SUPABASE_KEY__ for API calls
   - AuthContext MUST call project-auth edge function for signup/login/me actions
   - On app load, AuthContext checks localStorage for a saved token and calls "me" to restore the session
   - **CRITICAL**: If the "me" call fails (expired/invalid token), AuthContext MUST clear the token from localStorage, set user to null, and set loading to false — do NOT throw or crash
   - AuthContext must expose: { user, token, loading, login, signup, logout }
   - The login/signup functions must save the token to localStorage on success and return the result (do NOT navigate inside AuthContext)
   - The logout function must clear localStorage and set user to null (do NOT navigate inside AuthContext)
   - **CRITICAL**: AuthContext must NOT import or call useNavigate(). Navigation must be handled by the consuming components (e.g. LoginPage calls navigate after login succeeds). AuthContext must be usable OUTSIDE a Router.
   - While loading is true, show a loading spinner — never render routes until loading is false
   - Protected routes must redirect to /login when user is null (not crash or go blank)
5. Output complete, working code — no placeholders, no TODOs, no stubs
6. Every component must have a default export
7. Use Tailwind CSS with design tokens (var(--color-*)) for all styling
8. App.jsx MUST wrap all routes in AuthContext provider. AuthProvider MUST be placed OUTSIDE HashRouter/BrowserRouter since it must not use useNavigate.
9. Protected pages must check useAuth().user and redirect to /login if null
10. **CRITICAL**: Every function called in a component MUST be defined in that component, imported, or destructured from a hook/context. Never reference undefined functions like fetchBoards() without defining them first. If you need data-fetching functions, define them inside the component or a custom hook using the Data API pattern.
11. When using useEffect, ensure ALL dependencies (functions, variables) referenced inside the effect are either defined above or listed in the dependency array. Define fetch functions with useCallback or inside the effect itself.`;
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

/**
 * Build Compiler v1.0 — Execution Engine
 * 
 * Runs tasks through the AI model with full workspace context.
 * Each task sees the accumulated workspace and is told to import, not recreate.
 */

import { streamBuildAgent } from "@/lib/agentPipeline";
import { detectTruncation } from "@/lib/truncationRecovery";
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

  // Always include raw requirements so the build-agent understands the domain
  const requirementsSection = ctx.rawRequirements
    ? `\n### Application Requirements:\n${ctx.rawRequirements.slice(0, 4000)}\n`
    : "";

  return `## BUILD TASK ${taskIndex + 1}/${totalTasks}: ${task.label}

### What to build:
${task.description}
${requirementsSection}
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
   - /components/ui/ — shared UI library (Card, Button, Modal, DataTable, Toast, Spinner, Dialog, Sheet, Badge, Tabs, Select, Avatar, Input, Dropdown, Alert)
   - /components/ — reusable components (ProtectedRoute, Sidebar, etc.)
   - /contexts/ — React contexts (AuthContext, etc.)
   - /pages/ — page components (can be nested: /pages/Auth/LoginPage.jsx)
   - /hooks/ — custom hooks
   - /services/ — API services
   - /styles/ — CSS files
   - /layout/ — layout wrappers
   When importing, always use correct relative paths from the file's location.
4. Use the project's data API pattern: fetch(\`\${window.__SUPABASE_URL__}/functions/v1/project-api\`, { body: { project_id: window.__PROJECT_ID__, action, collection, data } })
5. For auth, use the AuthContext pattern. Import path depends on file location.
   - AuthContext MUST read window.__PROJECT_ID__, window.__SUPABASE_URL__, window.__SUPABASE_KEY__ for API calls
   - AuthContext MUST call project-auth edge function for signup/login/me actions
   - On app load, AuthContext checks localStorage for a saved token and calls "me" to restore the session
   - **CRITICAL**: If the "me" call fails (expired/invalid token), AuthContext MUST clear the token from localStorage, set user to null, and set loading to false — do NOT throw or crash
   - AuthContext must expose: { user, token, loading, login, signup, logout }
   - The login/signup functions must save the token to localStorage on success and return the result (do NOT navigate inside AuthContext)
   - The logout function must clear localStorage and set user to null (do NOT navigate inside AuthContext)
   - **CRITICAL**: AuthContext must NOT import or call useNavigate(). Navigation must be handled by the consuming components. AuthContext must be usable OUTSIDE a Router.
   - While loading is true, show a loading spinner — never render routes until loading is false
   - Protected routes must redirect to /login when user is null (not crash or go blank)
   - **CRITICAL ROLE SAFETY**: If you add allowedRoles checks, include "user" in the allowed list unless explicit role requirements were provided.
6. Output complete, working code — no placeholders, no TODOs, no stubs
7. Every component must have a default export
8. Use Tailwind CSS with design tokens (var(--color-*)) for all styling
9. **CRITICAL PROVIDER ORDERING in App.jsx**: ToastProvider (outermost) → AuthProvider → HashRouter → Routes.
10. Protected pages must check useAuth().user and redirect to /login if null
11. **CRITICAL**: Every file MUST import ALL identifiers it uses.
12. **CRITICAL**: Every function called in a component MUST be defined in that component, imported, or destructured from a hook/context.
13. When using useEffect, ensure ALL dependencies referenced inside the effect are either defined above or listed in the dependency array.

### UI QUALITY REQUIREMENTS (CRITICAL — follow these for EVERY page):
- **NO placeholder text**: Never generate "Loading content...", "Coming soon", or "TODO". Every page must render real, functional UI.
- **Realistic sample data**: Use useState with hardcoded arrays of 5-10 realistic rows (real names, dates, numbers). Example: \`const [students] = useState([{ id: 1, name: "Sarah Johnson", grade: "10th", gpa: 3.8 }, ...])\`
- **Rich dashboard pages**: Dashboard pages MUST include:
  - 4 stat cards using "stat-card" class with "stat-value", "stat-label", "stat-trend stat-trend-up"
  - At least one data table with 5+ rows using "table" class + "badge" classes for status
  - At least one simple chart or visual (can be a CSS bar chart if recharts is unavailable)
- **Data tables**: Use "table" class with thead/tbody, alternating row colors, "badge" status cells, action buttons
- **Forms**: Include proper labels, "input" class fields, validation states, "btn btn-primary" submit buttons
- **Navigation**: Sidebar must highlight the active route, show icons (from lucide-react), and have a professional look
- **Status badges**: Use "badge badge-success", "badge-warning", "badge-danger" for statuses
- **Loading states**: Use "skeleton" class for shimmer loading, "spinner" for inline spinners
- **Empty states**: Use "empty-state" class pattern with "empty-state-icon", "empty-state-title", "empty-state-text", and a CTA button
- **Modals/Dialogs**: Use "modal-overlay" → "modal" with "modal-header", "modal-body", "modal-actions"
- **Toast feedback**: Use "toast" classes for CRUD operation feedback
- **Tabs**: Use "tab-list" + "tab" / "tab tab-active" for multi-section pages
- **Avatars**: Use "avatar avatar-md" in user lists, comments, team views, "avatar-group" for stacks
- **Animations**: Add "stagger" class on list parents for entrance animations, "animate-fade-in" on page loads
- **Glass cards**: Use "card-glass" for hero overlays or premium feature sections
- **Layout polish**: Consistent spacing (p-6), rounded corners (rounded-xl), "surface-elevated" for elevated panels
- **Color tokens**: Use CSS variables: var(--color-primary), var(--color-bg), var(--color-text), var(--color-border), var(--color-success), var(--color-warning), var(--color-danger)`;

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
 * Includes truncation detection with auto-retry (up to 1 continuation).
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

  const MAX_CONTINUATION_RETRIES = 1;

  const runStream = (messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ text: string; files: Record<string, string> | null }> => {
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

  // Initial run
  let { text: responseText, files: extracted } = await runStream([
    { role: "user", content: prompt },
  ]);

  // Check for truncation and auto-continue
  if (extracted && Object.keys(extracted).length > 0) {
    const truncation = detectTruncation(responseText, extracted);
    if (truncation.isTruncated) {
      console.warn(`[Executor] Truncation detected in task '${task.label}': ${truncation.reason}`);
      task.retries = (task.retries || 0) + 1;

      for (let attempt = 0; attempt < MAX_CONTINUATION_RETRIES; attempt++) {
        try {
          const contResult = await runStream([
            { role: "user", content: prompt },
            { role: "assistant", content: responseText },
            { role: "user", content: truncation.continuationPrompt },
          ]);

          // Merge continuation files into existing extracted files
          if (contResult.files) {
            for (const [path, code] of Object.entries(contResult.files)) {
              // If the file was truncated and this is its continuation, append
              if (truncation.truncatedFile && path === truncation.truncatedFile && extracted[path]) {
                extracted[path] = extracted[path] + "\n" + code;
              } else {
                extracted[path] = code;
              }
            }
          }

          // Check if still truncated
          const fullCombined = responseText + "\n" + contResult.text;
          const recheck = detectTruncation(fullCombined, extracted);
          if (!recheck.isTruncated) {
            console.log(`[Executor] Continuation successful for task '${task.label}'`);
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

/**
 * Build Compiler v1.1 — Execution Engine
 *
 * Runs tasks through the AI model with scoped workspace context.
 * Each task sees only the relevant workspace slice and is told to import, not recreate.
 *
 * Canonical app runtime: Sandpack-only, browser-only, client-side React.
 * Generated app code MUST be preview-agnostic and MUST NOT read preview-engine globals directly.
 */

import { streamBuildAgent } from "@/lib/agentPipeline";
import { detectTruncation } from "@/lib/truncationRecovery";
import { repairBrokenDataHooks } from "./hookSafetyGuard";
import type { BuildContext, CompilerTask, TaskGraph } from "./types";
import type { Workspace } from "./workspace";
import { getDesignThemePrompt } from "./designThemes";
import { validateAllFiles, buildFileRetryPrompt, type ParseResult } from "./syntaxValidator";
import { selectLayoutSnippets, formatLayoutSnippetsForPrompt } from "./layoutSnippets";
import { ANIMATION_PROMPT_SECTION } from "./animations";

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
  const budget = mode === "infra" ? 7000 : mode === "components" ? 10000 : mode === "routing" ? 12000 : 10000;
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

  const designThemeSection = getDesignThemePrompt(ctx.designTheme);

  // Select applicable layout snippets for this task
  const layoutSnippets = selectLayoutSnippets(task.label, task.description);
  const layoutSection = formatLayoutSnippetsForPrompt(layoutSnippets);

  return `## BUILD TASK ${taskIndex + 1}/${totalTasks}: ${task.label}

### What to build:
${task.description}
${requirementsSection}
${designThemeSection ? `### Design Theme:\n${designThemeSection}\n` : ""}
${layoutSection ? `${layoutSection}\n` : ""}
${ANIMATION_PROMPT_SECTION}
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

### RUNTIME CONTRACT (CANONICAL APP RUNTIME):

- This project has a **real Supabase backend** via Lovable Cloud.
- Generated app code is client-side React running in the browser.
- Supabase client:
  - Import the pre-configured Supabase client: \`import { supabase } from "../integrations/supabase/client";\`
  - Adjust the relative path based on file location.
  - Use \`supabase.from("table").select("*")\` for data queries.
  - Use \`supabase.auth\` for authentication.
  - Do NOT create your own Supabase client or config files — the client is pre-configured.
  - Do NOT generate \`/lib/config.ts\` or \`/lib/supabase.ts\` — these are unnecessary.
- Imports:
  - ALL imports MUST be **relative paths only** (e.g. \`../../lib/utils\`).
  - \`@/\` aliases are FORBIDDEN and will cause build rejection.
- Data access:
  - Use \`supabase.from()\` directly for database queries.
  - Import the supabase client from the integrations module.
- Verifier:
  - Any occurrence of \`window.__PROJECT_ID__\`, \`window.__SUPABASE_URL__\`, \`window.__SUPABASE_KEY__\`, or \`@/\` imports in generated app files will cause the build to be rejected.

### RULES:

## ══════════════════════════════════════════════════════════════════
## ABSOLUTE BANS (violating ANY of these = build rejection)
## ══════════════════════════════════════════════════════════════════
- **BAN-1**: NEVER generate inline sample/mock data arrays (e.g. \`const SAMPLE_DATA = [...]\`). ALL data comes from database queries.
- **BAN-2**: NEVER use \`@/\` import aliases. Use RELATIVE paths only (e.g. \`../../lib/utils\`).
- **BAN-3**: NEVER import from \`@radix-ui/*\`, \`class-variance-authority\`, or \`tailwind-variants\`.
- **BAN-4**: NEVER generate \`.jsx\` or \`.js\` files. ALL source files must be \`.tsx\` or \`.ts\`.
- **BAN-6**: NEVER write to \`/components/ui/**\` — those are pre-scaffolded UI primitives.
- **BAN-7**: NEVER add \`export { X }\` alongside \`export default X\` for the same symbol.
- **BAN-8**: NEVER leave placeholders, TODOs, or stubs. Output COMPLETE working code.
- **BAN-9**: NEVER call \`useNavigate()\` inside AuthContext. AuthContext must be router-agnostic.
- **BAN-10**: NEVER generate \`/lib/config.ts\` or \`/lib/supabase.ts\` — the Supabase client is pre-configured.

## ══════════════════════════════════════════════════════════════════
## CRITICAL RULES (output quality)
## ══════════════════════════════════════════════════════════════════

1. Generate ONLY the files listed in produces/touches.
2. If a file already exists, MODIFY it in-place — preserve existing imports, exports, and structure.
3. Import from existing workspace files — do NOT recreate them.

4. **EXPORT RULES**:
   - /components/ui/ files: NAMED exports (export function Button, export function Card, etc.)
   - ALL other files (pages, domain components, layout, hooks): DEFAULT export only.

5. **COMPLETE FILES ONLY**: Every file MUST import ALL identifiers it uses. Every function called MUST be defined, imported, or destructured from a hook/context. useEffect dependencies MUST be complete.

6. **NAV-ROUTE CONSISTENCY**: Every navigation link in Sidebar MUST have a matching <Route> in App. Every <Route> in App MUST have a matching nav link. Mismatches = blank pages.

7. **DATA ACCESS (CRITICAL — Real Supabase Backend)**:
   - This project has a REAL Supabase backend via Lovable Cloud.
   - Use the Supabase client directly for ALL CRUD operations:
     \`\`\`ts
     import { supabase } from "../integrations/supabase/client"; // adjust relative path
     
     export async function listEmployees() {
       const { data, error } = await supabase.from("employees").select("*");
       if (error) throw error;
       return data || [];
     }
     \`\`\`
   - Show loading skeleton while fetching, empty state with CTA when data is empty.

8. **DATA HOOKS MUST BE SHORT (CRITICAL — prevents truncation)**:
    Data hooks MUST follow this EXACT compact template (UNDER 40 lines):
    \`\`\ts
    import { useState, useEffect } from "react";
    import { supabase } from "../../integrations/supabase/client"; // adjust relative path

    export default function useXxx() {
      const [data, setData] = useState<any[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<Error | null>(null);

      useEffect(() => {
        async function load() {
          try {
            setLoading(true);
            const { data: rows, error: err } = await supabase.from("xxx").select("*");
            if (err) throw err;
            setData(rows || []);
          } catch (err) {
            setError(err as Error);
          } finally {
            setLoading(false);
          }
        }
        load();
      }, []);

      return { data, loading, error };
    }
    \`\`\`

9. **BACKEND ARTIFACTS (REQUIRED FOR DATA FEATURES)**:
   - When the task involves schema/database/backend, you MUST generate:
     - /migrations/001_schema.sql — CREATE TABLE statements
     - /migrations/002_rls.sql — RLS policies for each table
     - /schema.json — JSON schema describing entities
   - Without these files, the build will be REJECTED.

## ══════════════════════════════════════════════════════════════════
## FILE STRUCTURE
## ══════════════════════════════════════════════════════════════════

10. **File layout**:
    - /lib/utils.ts — cn() class-merge utility. NEVER put utils in /components/ui/ or /utils/.
    - /integrations/supabase/client.ts — pre-configured Supabase client. NEVER modify or recreate.
    - /components/ui/ — pre-scaffolded shadcn-compatible UI components (NAMED exports, do not modify).
    - /components/ — reusable DOMAIN components (StatCard, StatusBadge, PageHeader, etc.). DEFAULT exports.
    - /contexts/ — React contexts (AuthContext, etc.).
    - /pages/ModuleName/ — page components in named directories. DEFAULT exports.
    - /hooks/ — custom hooks (.ts files). /hooks/data/ for data-fetching hooks.
    - /layout/ — layout wrappers (AppLayout.tsx, Sidebar.tsx). DEFAULT exports.
    Import cn from "../lib/utils" (adjust relative path based on file depth).
    Import supabase from "../integrations/supabase/client" (adjust relative path).

11. **COMPONENT DECOMPOSITION**: Pages must NOT be monolithic. Every page MUST import and use components from /components/ui/:
    - Table + TableHeader/TableBody/TableRow/TableHead/TableCell for data lists
    - Tabs + TabsList/TabsTrigger/TabsContent for multi-section views
    - Dialog for modals, Sheet for slide-out panels, Select for dropdowns
    - Card + CardHeader/CardContent for sections, Badge for statuses, Avatar for users
    - Button for all actions, Input/Label/Textarea for forms
    - Skeleton for loading states, Separator for dividers

## ══════════════════════════════════════════════════════════════════
## DESIGN QUALITY (appendix — follow these for visual polish)
## ══════════════════════════════════════════════════════════════════

12. **Typography**: Page titles: text-2xl font-bold. Sections: text-lg font-semibold. Body: text-sm. Labels: text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)].
13. **Spacing**: var(--space-2) tight, var(--space-4) standard, var(--space-6) card padding, var(--space-8) section gaps.
14. **Color**: Primary for CTAs. Success/Warning/Danger for status ONLY. Max 3 prominent colors per page.
15. **Interactive States**: EVERY clickable element needs hover, focus, disabled states.
16. **Loading & Empty**: Skeleton shimmer while loading. Empty state with icon + title + CTA.
17. **Responsive**: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 for card grids.
18. **Micro-Interactions**: animate-fade-in on page containers, hover scale on cards, transition-all duration-200.
19. **Page Structure**: PageHeader → content. Dashboards lead with stat cards grid.
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
    "/App.tsx",
    "/App.jsx",
    "/contexts/AuthContext.tsx",
    "/layout/AppLayout.tsx",
    "/layout/Sidebar.tsx",
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

// ─── Runtime Contract Verifier ────────────────────────────────────────────

function verifyRuntimeContracts(files: Record<string, string>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const forbiddenWindowPatterns = ["window.__PROJECT_ID__", "window.__SUPABASE_URL__", "window.__SUPABASE_KEY__"];
  const forbiddenImportAlias = "@/";

  for (const [path, code] of Object.entries(files)) {
    // Skip config and supabase modules themselves; they are allowed to read env/globals.
    const isConfig = path === "/lib/config.ts" || path.endsWith("/lib/config.ts");
    const isSupabase = path === "/lib/supabase.ts" || path.endsWith("/lib/supabase.ts") ||
      path.includes("/integrations/supabase/");

    if (!isConfig && !isSupabase) {
      for (const pattern of forbiddenWindowPatterns) {
        if (code.includes(pattern)) {
          errors.push(
            `File ${path} illegally reads preview/global value via '${pattern}'. Use /lib/config.ts instead.`,
          );
          break;
        }
      }
    }

    if (code.includes(forbiddenImportAlias)) {
      errors.push(`File ${path} uses '@/'. All imports must be relative paths only.`);
    }

    // NOTE: supabase.from() is ALLOWED — the project has a real Supabase backend via Lovable Cloud.
    // The old project-api proxy restriction has been removed.
  }

  return { ok: errors.length === 0, errors };
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
 * Includes:
 *  - Truncation detection with auto-retry (up to 3 continuations)
 *  - Runtime contract verification (Sandpack-only, preview-agnostic app code)
 *  - Pre-commit syntax validation (Babel parse gate)
 *  - Per-file retry for files that fail to parse
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

  const MAX_CONTINUATION_RETRIES = 3;
  const MAX_FILE_RETRIES = 2;

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
    // ── Truncation handling ───────────────────────────────────────────
    const initialTruncation = detectTruncation(responseText, extracted);
    if (initialTruncation.isTruncated) {
      console.warn(`[Executor] Truncation detected in task '${task.label}': ${initialTruncation.reason}`);
      task.retries = (task.retries || 0) + 1;

      let activeTruncation = initialTruncation;
      for (let attempt = 0; attempt < MAX_CONTINUATION_RETRIES; attempt++) {
        try {
          const contResult = await runStream([
            ...baseMessages,
            { role: "assistant", content: responseText },
            { role: "user", content: activeTruncation.continuationPrompt },
          ]);

          if (contResult.files) {
            for (const [path, code] of Object.entries(contResult.files)) {
              let stitched: string;
              if (activeTruncation.truncatedFile && path === activeTruncation.truncatedFile && extracted[path]) {
                stitched = extracted[path] + "\n" + code;
              } else {
                stitched = code;
              }
              // Validate stitched file before accepting it
              const stitchCheck = validateAllFiles({ [path]: stitched });
              if (stitchCheck.invalid.length > 0) {
                console.warn(`[Executor] ⛔ Stitched continuation for ${path} failed parse — keeping original`);
                // Don't update extracted[path] — keep the pre-stitch version (or nothing)
              } else {
                extracted[path] = stitched;
              }
            }
          }

          const fullCombined = responseText + "\n" + contResult.text;
          const recheck = detectTruncation(fullCombined, extracted);
          if (!recheck.isTruncated) {
            console.log(`[Executor] Continuation successful for task '${task.label}' (attempt ${attempt + 1})`);
            responseText = fullCombined;
            break;
          }

          console.warn(`[Executor] Still truncated after continuation attempt ${attempt + 1}`);
          responseText = fullCombined;
          activeTruncation = recheck;
        } catch (contErr) {
          console.warn(`[Executor] Continuation attempt ${attempt + 1} failed:`, contErr);
          break;
        }
      }

      const finalTruncation = detectTruncation(responseText, extracted);
      if (finalTruncation.isTruncated && finalTruncation.truncatedFile && extracted[finalTruncation.truncatedFile]) {
        console.warn(
          `[Executor] Dropping unsafe truncated file '${finalTruncation.truncatedFile}' to avoid syntax crash`,
        );
        delete extracted[finalTruncation.truncatedFile];
      }
    }

    // ── Runtime contract verification (Sandpack-only, preview-agnostic app code) ─
    const runtimeCheck = verifyRuntimeContracts(extracted);
    if (!runtimeCheck.ok) {
      console.warn(
        `[Executor] Runtime contract violations in task '${task.label}':\n` +
          runtimeCheck.errors.map((e) => ` - ${e}`).join("\n"),
      );
      throw new Error(
        `Runtime contract violation in task '${task.label}'. Generated files violate Sandpack-only, preview-agnostic runtime rules.`,
      );
    }

    // ── Pre-commit syntax validation (Babel parse gate) ───────────────
    const { valid, invalid } = validateAllFiles(extracted);

    if (invalid.length > 0) {
      console.warn(`[Executor] ${invalid.length} file(s) failed syntax validation in task '${task.label}'`);

      // Per-file retry: re-request only the broken files
      for (const parseErr of invalid) {
        const originalCode = extracted[parseErr.path];
        if (!originalCode) continue;

        let fixed = false;
        for (let retryAttempt = 0; retryAttempt < MAX_FILE_RETRIES; retryAttempt++) {
          try {
            // Build workspace context from files that import this one
            const relatedContext = buildRelatedFilesContext(parseErr.path, valid, workspace);
            const retryPrompt = buildFileRetryPrompt(parseErr, originalCode, relatedContext);

            console.log(`[Executor] 🔄 Per-file retry ${retryAttempt + 1}/${MAX_FILE_RETRIES} for ${parseErr.path}`);

            const retryResult = await runStream([
              {
                role: "system",
                content:
                  "You are a syntax repair agent. Fix the syntax error in the provided file. Output ONLY the corrected file with a file header (--- /path/to/file.tsx).",
              },
              { role: "user", content: retryPrompt },
            ]);

            if (retryResult.files) {
              // Find the matching file in retry output
              const retryCode = retryResult.files[parseErr.path] || Object.values(retryResult.files)[0]; // Fallback to first file

              if (retryCode) {
                const revalidation = validateAllFiles({ [parseErr.path]: retryCode });
                if (revalidation.invalid.length === 0) {
                  valid[parseErr.path] = retryCode;
                  fixed = true;
                  console.log(`[Executor] ✅ Per-file retry fixed ${parseErr.path} (attempt ${retryAttempt + 1})`);
                  break;
                } else {
                  console.warn(
                    `[Executor] ⚠️ Per-file retry ${retryAttempt + 1} for ${parseErr.path} still has errors`,
                  );
                }
              }
            }
          } catch (retryErr: any) {
            console.warn(`[Executor] Per-file retry failed for ${parseErr.path}:`, retryErr.message);
            break;
          }
        }

        if (!fixed) {
          console.warn(`[Executor] ❌ Dropping unparseable file ${parseErr.path} after ${MAX_FILE_RETRIES} retries`);
        }
      }

      extracted = valid;
    }
  }

  // ── Hook Safety Guard: detect & repair broken data hooks ───────────
  if (extracted && Object.keys(extracted).length > 0) {
    extracted = repairBrokenDataHooks(extracted);
  }

  return extracted && Object.keys(extracted).length > 0 ? extracted : {};
}

/**
 * Build context of related files for per-file retry.
 * Includes files that the broken file likely imports from.
 */
function buildRelatedFilesContext(
  brokenPath: string,
  validFiles: Record<string, string>,
  workspace: Workspace,
): string {
  const parts: string[] = [];
  let budget = 4000;

  // Check workspace index for files that import or are imported by the broken file
  const idx = workspace.index;
  const imports = idx.imports[brokenPath] || [];

  for (const imp of imports) {
    const resolved = workspace.resolveImport(brokenPath, imp.from);
    if (!resolved) continue;

    // Check valid files first, then workspace
    const content = validFiles[resolved] || workspace.getFile(resolved);
    if (content && content.length < budget) {
      parts.push(`--- ${resolved}\n${content}`);
      budget -= content.length;
    }
  }

  return parts.join("\n\n");
}

// ─── Path Sanitizer ───────────────────────────────────────────────────────

/**
 * Sanitizes AI-generated file paths:
 * - Removes spaces from directory and file names
 * - PascalCases multi-word segments (e.g., "Project View" → "ProjectView")
 * - Preserves extensions
 */
function sanitizeFilePath(rawPath: string): string {
  const parts = rawPath.split("/").filter(Boolean);
  const sanitized = parts.map((segment, i) => {
    // Preserve extension on last segment
    const extMatch = segment.match(/^(.+)(\.\w+)$/);
    const name = extMatch ? extMatch[1] : segment;
    const ext = extMatch ? extMatch[2] : "";

    // If segment has spaces or special chars, PascalCase it
    if (/[^a-zA-Z0-9._-]/.test(name) || /\s/.test(name)) {
      const pascal = name
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
      return pascal + ext;
    }
    return segment;
  });
  return "/" + sanitized.join("/");
}

// ─── Output Parser ────────────────────────────────────────────────────────

function extractFilesFromOutput(text: string): Record<string, string> | null {
  const files: Record<string, string> = {};
  const headerRegex = /^-{3}\s+(.+?)\s*$/;

  const parseHeader = (header: string): { type: "deps" | "file"; path?: string } | null => {
    const cleaned = header
      .replace(/\s*-{0,3}\s*$/, "")
      .replace(/\s*\(truncated\)\s*$/i, "")
      .trim();

    if (/^\/?dependencies\b/i.test(cleaned)) {
      return { type: "deps" };
    }

    const pathMatch = cleaned.match(/\/?[A-Za-z0-9._/-]+\.[A-Za-z0-9]+/);
    if (!pathMatch) return null;

    let path = pathMatch[0].trim();
    path = path.replace(/^src\//i, "");
    if (!path.startsWith("/")) path = `/${path}`;
    path = path.replace(/^\/src\//, "/");

    // Sanitize: remove spaces from path segments and PascalCase filenames
    path = sanitizeFilePath(path);

    return { type: "file", path };
  };

  const fencePatterns = [
    "```react-preview",
    "```jsx-preview",
    "```tsx",
    "```typescript",
    "```react",
    "```jsx",
    "```javascript",
    "```sql",
    "```json",
    "```css",
    "```html",
  ];

  let fenceStart = -1;
  for (const pattern of fencePatterns) {
    fenceStart = text.indexOf(pattern);
    if (fenceStart !== -1) break;
  }

  // If no typed fence found, try generic triple-backtick fence with file headers
  if (fenceStart === -1) {
    const genericFence = text.indexOf("```\n---");
    if (genericFence !== -1) fenceStart = genericFence;
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
        files[currentFile] = code;
      }
    }
    currentFile = null;
    currentLines = [];
    inDepsSection = false;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(headerRegex);

    if (headerMatch) {
      const parsed = parseHeader(headerMatch[1]);
      if (parsed?.type === "deps") {
        flush();
        inDepsSection = true;
        continue;
      }
      if (parsed?.type === "file" && parsed.path) {
        flush();
        currentFile = parsed.path;
        continue;
      }
    }

    if (currentFile && !inDepsSection) {
      currentLines.push(line);
    }
  }
  flush();

  if (Object.keys(files).length === 0 && block.trim().length > 20) {
    const hasSectionMarkers = /^\s*-{3}\s+/m.test(block);
    if (hasSectionMarkers) {
      console.warn("[Executor] File-section markers detected but no valid files parsed; skipping unsafe fallback");
      return null;
    }
    files["/App.jsx"] = block.trim();
  }

  return Object.keys(files).length > 0 ? files : null;
}

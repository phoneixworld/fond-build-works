import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Build Agent — enterprise-grade code generation agent.
 * Prompt v3.1: tighter structure, prompt caching, improved iteration.
 */

// ─── Prompt Cache (in-memory, per-isolate) ────────────────────────────────

const promptCache = new Map<string, { prompt: string; timestamp: number }>();
const PROMPT_CACHE_TTL = 30 * 60 * 1000; // 30 min

function hashConfig(projectId: string, techStack: string, schemas?: any[], designTheme?: string, knowledge?: string[]): string {
  const parts = [projectId, techStack, designTheme || "", JSON.stringify(schemas || []), (knowledge || []).join("|")];
  let hash = 2166136261;
  const str = parts.join("||");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

function getOrBuildSystemPrompt(projectId: string, techStack: string, schemas?: any[], designTheme?: string, knowledge?: string[]): string {
  const key = hashConfig(projectId, techStack, schemas, designTheme, knowledge);
  const cached = promptCache.get(key);
  if (cached && Date.now() - cached.timestamp < PROMPT_CACHE_TTL) {
    return cached.prompt;
  }
  const prompt = buildSystemPrompt(projectId, techStack, schemas, designTheme, knowledge);
  promptCache.set(key, { prompt, timestamp: Date.now() });
  // Evict old entries
  if (promptCache.size > 20) {
    const oldest = [...promptCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) promptCache.delete(oldest[0]);
  }
  return prompt;
}

function buildSystemPrompt(projectId: string, techStack: string, schemas?: any[], designTheme?: string, knowledge?: string[]): string {
  const apiBase = `${SUPABASE_URL}/functions/v1`;

  const isReactStack = ["react-cdn", "react-node", "react-python", "react-go", "nextjs"].includes(techStack);

  return `You are Phoenix Build Agent — a world-class React engineer that outputs production-ready, beautiful, fully functional code on the first try.

## IDENTITY
- You are NOT a chatbot. You are a CODE GENERATOR.
- Output ONLY: brief task summary (2-3 lines with ✅) + complete code in fence format.
- NEVER converse, ask questions, explain at length, or output partial/truncated code.
- Response MUST contain a \`\`\`react-preview code fence. No exceptions.
- You build FUNCTIONAL APPLICATIONS with real UI, real interactions, real data flows.
- When asked to build "a task board" → build the actual working task board with drag targets, status columns, task cards — NOT a landing page.
- NEVER render the user's requirements/prompt text as page content.
- QUALITY BAR: Your output must look like it was built by a senior engineer at a top startup. Beautiful typography, thoughtful spacing, polished micro-interactions, professional color usage.

${isReactStack ? `## OUTPUT FORMAT — MANDATORY
\`\`\`react-preview
--- /App.jsx
import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
export default function App() { return <HashRouter><Routes>...</Routes></HashRouter>; }
--- /layout/AppLayout.jsx
--- /layout/Sidebar.jsx
--- /pages/Module/ModulePage.jsx
--- /components/ui/Card.jsx
--- /hooks/useFetch.js
--- /styles/globals.css
--- dependencies
{"lucide-react":"^0.400.0"}
\`\`\`

### File Rules
- Paths start with / (no /src/). /App.jsx MUST export default.
- Structure: /App.jsx → /layout/ → /pages/Module/ → /components/ui/ → /hooks/ → /styles/
- Each page gets its OWN folder. Min 10-15 files for simple apps, 15-25 for complex.` : `## OUTPUT FORMAT
Generate a SINGLE complete index.html inside a \`\`\`html-preview code fence.`}

## ITERATION RULES (CRITICAL FOR FOLLOW-UP REQUESTS)
When CURRENT CODE is provided below:
1. Read ALL existing files carefully before generating
2. ONLY output files you are CHANGING or ADDING — do NOT regenerate unchanged files
3. PRESERVE all existing routes, imports, sidebar items, and navigation
4. When adding a feature: add the new route to /App.jsx, add nav item to /layout/Sidebar.jsx
5. When modifying a component: output the COMPLETE modified file (no partial snippets)
6. NEVER remove existing functionality unless explicitly asked

## CODE STANDARDS
- Production React JSX + Tailwind CSS — zero TODOs, zero shortcuts, zero placeholders
- Icons: import { Heart } from "lucide-react" — Animations: framer-motion
- Available packages: react, react-dom, lucide-react, framer-motion, date-fns, recharts, react-router-dom, clsx, tailwind-merge
- NEVER: external images (use CSS/SVGs/icons), bracket notation in JSX, require(), react-hot-toast, sonner, @headlessui, @radix-ui
- Build Toast in /components/ui/Toast.jsx instead
- ALL <Route> elements MUST self-close. Adjacent JSX needs wrapper fragment.
- ALL fetch calls: try/catch + loading skeleton + error state + empty state with CTA
- Accessibility: labels, 4.5:1 contrast, focus rings, keyboard nav, semantic HTML
- Performance: React.memo for lists, useCallback for handlers, debounce search 300ms
- **CRITICAL — COMPLETE FILES ONLY**: Every file you output MUST be syntactically complete with all braces/brackets closed, all functions finished, and a default export. NEVER output a file that ends mid-function or mid-JSX. If you are running out of space, output FEWER files but make each one 100% complete rather than outputting many truncated files.
- **AuthContext rules**: AuthContext MUST NOT use useNavigate or any react-router-dom hooks. It must work OUTSIDE a Router. Use window.__PROJECT_ID__, window.__SUPABASE_URL__, window.__SUPABASE_KEY__ globals. Handle failed "me" calls gracefully (clear token, set user to null, set loading to false). NEVER throw from AuthContext.
- **Toast component**: Build a simple self-contained Toast using useState + useEffect + createContext. Do NOT use window events, CustomEvent, or dispatchEvent. Keep it simple: ToastProvider wraps the app, useToast() returns { addToast }, ToastContainer renders the toasts.
- **cn utility — CRITICAL**: If you create /lib/utils.js or /components/ui/utils.js with a \`cn\` helper, it MUST be a classname merger function, NOT a React component. Correct: \`export function cn(...inputs) { return inputs.filter(Boolean).join(" "); }\`. NEVER make cn return JSX or render a <div>.
- **Export rules — CRITICAL**: Use ONLY \`export default X\` for components. NEVER add a separate \`export { X }\` for the same symbol. The ONLY export statement per component file should be \`export default function ComponentName\` or \`export default ComponentName\` at the end.
- **Nav-Route consistency — CRITICAL**: Every path listed in Sidebar/Navigation NavLink items MUST have a matching \`<Route path="..." />\` in App.jsx. Do NOT add sidebar items for pages that don't exist yet. If the sidebar has 9 items, App.jsx must have 9 corresponding routes with real page components.

## REQUIREMENTS TRANSLATION
1. Extract EVERY noun/feature → each = at least 1 component file
2. Multi-module → React Router + sidebar/tab nav
3. Infer data collections → full CRUD for each (list, create, edit, delete)
4. Every screen: header, main content, action buttons, empty states, loading skeletons

## PHONEIX DESIGN SYSTEM (MANDATORY)
/styles/globals.css provides a PREMIUM design system. You MUST use semantic tokens AND pre-built component classes:

### Colors (Tailwind arbitrary values):
- Primary: bg-[var(--color-primary)], text-[var(--color-primary)], hover:bg-[var(--color-primary-hover)]
- Surfaces: bg-[var(--color-bg)], bg-[var(--color-bg-secondary)], bg-[var(--color-bg-tertiary)]
- Sidebar: bg-[var(--color-sidebar)], text-[var(--color-sidebar-text)], active: bg-[var(--color-sidebar-active)]
- Text: text-[var(--color-text)], text-[var(--color-text-secondary)], text-[var(--color-text-muted)]
- Borders: border-[var(--color-border)], border-[var(--color-border-light)]
- Status: text-[var(--color-success)], text-[var(--color-warning)], text-[var(--color-danger)]

### Pre-Built Component Classes (USE THESE for beautiful UI):
- **Cards**: "card" (hover glow), "card-glass" (glassmorphism), "card-featured" (highlight)
- **Buttons**: "btn btn-primary", "btn btn-secondary", "btn btn-danger"
- **Badges**: "badge badge-primary", "badge-success", "badge-warning", "badge-danger"
- **Inputs**: "input" — **Tables**: "table" with th/td
- **Stat Cards**: "stat-card" with "stat-value", "stat-label", "stat-trend stat-trend-up/down"
- **Modals**: "modal-overlay" → "modal" with "modal-header", "modal-body", "modal-actions"
- **Toasts**: "toast toast-success/error/warning/info"
- **Tabs**: "tab-list" with "tab" / "tab tab-active"
- **Toggle**: "toggle" / "toggle toggle-active"
- **Avatar**: "avatar avatar-sm/md/lg/xl", groups: "avatar-group"
- **Progress**: "progress" → "progress-bar" (width %)
- **Spinner**: "spinner" / "spinner-lg" — **Skeleton**: "skeleton" (shimmer)
- **Empty States**: "empty-state" → "empty-state-icon", "empty-state-title", "empty-state-text"
- **Dividers**: "divider" or "divider-gradient"
- **Gradient Text**: "text-gradient" — **Surfaces**: "surface", "surface-elevated"
- **Stagger Animations**: "stagger" on parent for sequential entrance
- **Animations**: "animate-fade-in", "animate-slide-in", "animate-scale-in", "animate-bounce-in"
- **Tooltip**: "tooltip-wrapper" → "tooltip"

### BANNED raw colors:
❌ bg-gray-50, bg-gray-900, text-gray-400, bg-blue-500, bg-red-500, bg-white, text-black
✅ ONLY var(--color-*) tokens

## BACKEND API
POST JSON to ${apiBase}/project-api:
- project_id: "${projectId}", collection: "name", action: "list"|"get"|"create"|"update"|"delete"
- data: {...}, id: "uuid", filters: {limit:10}
- Headers: {"Content-Type":"application/json","Authorization":"Bearer ${ANON_KEY}"}

Auth: ${apiBase}/project-auth — actions: "signup"|"login"|"me"
Functions: ${apiBase}/project-exec — function_name + params

### RUNTIME GLOBALS (available in browser at runtime)
The host environment injects these globals before your code runs:
- window.__PROJECT_ID__ — the current project's UUID (use this for project_id in ALL API calls)
- window.__SUPABASE_URL__ — the API base URL
- window.__SUPABASE_KEY__ — the anon/public API key

**CRITICAL**: In your AuthContext and data hooks, ALWAYS read project_id from \`window.__PROJECT_ID__\`, API base from \`window.__SUPABASE_URL__\`, and API key from \`window.__SUPABASE_KEY__\`. Do NOT hardcode these values. Example:
\`\`\`
const projectId = window.__PROJECT_ID__;
const apiBase = window.__SUPABASE_URL__;
const apiKey = window.__SUPABASE_KEY__;
fetch(\`\${apiBase}/functions/v1/project-auth\`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": \`Bearer \${apiKey}\` },
  body: JSON.stringify({ project_id: projectId, action: "signup", email, password })
});
\`\`\`

### Backend Rules (MANDATORY — VIOLATIONS WILL FAIL THE BUILD):
- EVERY app with persistent data MUST use the Data API (project-api) for ALL CRUD operations. This is NON-NEGOTIABLE.
- NEVER use useState with inline data arrays as primary data source. ALL data MUST come from API calls.
- NEVER define const SAMPLE_DATA, const mockData, const fakeData, or any inline array as a data source.
- EVERY list/dashboard page MUST fetch from project-api with proper loading skeleton + empty state UI.
- Data hooks pattern (MANDATORY):
\`\`\`
// hooks/useContacts.js — CORRECT pattern
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch(\\\`\\\${window.__SUPABASE_URL__}/functions/v1/project-api\\\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": \\\`Bearer \\\${window.__SUPABASE_KEY__}\\\` },
    body: JSON.stringify({ project_id: window.__PROJECT_ID__, collection: "contacts", action: "list" })
  }).then(r => r.json()).then(d => { setData(d.data || []); setLoading(false); })
    .catch(() => setLoading(false));
}, []);
\`\`\`
- Show loading skeleton while fetching, empty state with "Add first item" CTA when data is empty — NEVER fake data
- If window.__SUPABASE_URL__ is not set, show a clean empty state — NEVER inject fake/sample data arrays

${schemas && schemas.length > 0 ? `## DATA MODELS\n${schemas.map((s: any) => {
  const fields = s.schema?.fields || [];
  return `### "${s.collection_name}"\n${fields.map((f: any) => `  - ${f.name} (${f.type}${f.required ? ", required" : ""})`).join("\n") || "  (no fields)"}`;
}).join("\n\n")}` : ""}

## ROUTING
- ALWAYS HashRouter (NOT BrowserRouter) — required for iframe sandbox
- Nested: <Route path="/" element={<AppLayout />}> with <Outlet />
- /layout/Sidebar.jsx: NavLink with isActive styling
- NEVER dump all features on single page — use ROUTES for each module

## AUTH PATTERN (when needed)
/components/AuthContext.jsx: login/signup/logout + /components/LoginPage.jsx
ProtectedRoute wrapper. Login MUST call auth API.

## COMPLETENESS CHECKLIST
✅ Multiple views with HashRouter + nested routes + catch-all redirect
✅ Sidebar/tab navigation connecting ALL modules
✅ Full CRUD: forms + validation + loading + toast feedback
✅ Search, filter, sort for data lists. Empty states with CTAs.
✅ Responsive: mobile-first with sm/md/lg breakpoints
✅ Real contextual content — ZERO placeholder text
✅ Data tables: pagination + action buttons + modal forms for add/edit
✅ Dashboard: KPI cards + at least one chart (recharts)

## ABSOLUTE BANS
❌ "Coming Soon" / "Under Construction" / placeholder pages
❌ Landing pages / marketing pages ABOUT the app — BUILD THE ACTUAL APP with working features
❌ Hero sections that just display the requirements text — that is NOT an app
❌ Empty route targets — every nav item → fully implemented page
❌ console.log spam — max 1 per file for errors only
❌ Inline styles — use Tailwind + design tokens
❌ Hardcoded mock data in pages — ALL data MUST come from API calls with loading skeletons and empty states
❌ Rendering the user's prompt/requirements as page content — IMPLEMENT the features instead

## ═══════════════════════════════════════════════════════════════════
## BACKEND GENERATION RULES (MANDATORY FOR ANY DATA/AUTH FEATURES)
## ═══════════════════════════════════════════════════════════════════

### REQUIRED — You MUST follow these rules when generating backend features:
1. ALWAYS use the Supabase client (\`@supabase/supabase-js\`) or the project Data API (\`project-api\`, \`project-auth\`) for ALL persistence. Every data operation must hit a real backend.
2. ALWAYS generate SQL migrations BEFORE generating any backend or frontend code that references tables. Include a \`--- /migrations/001_schema.sql\` file with CREATE TABLE statements.
3. ALWAYS generate RLS (Row-Level Security) policies for every table. Include them in a \`--- /migrations/002_rls.sql\` file.
4. ALWAYS generate typed queries using the schema. Hooks must reference real table/column names.
5. ALWAYS use \`project-auth\` and \`project-api\` utilities for auth/session management.
6. ALWAYS return a migration artifact (\`migration.sql\`) when backend changes are requested.
7. ALWAYS include a \`--- /schema.json\` file describing the data model (entities, fields, types, relations).

### FORBIDDEN — You MUST NEVER do any of the following:
1. NEVER use \`localStorage\` for authentication or session persistence (localStorage for UI preferences like theme is OK).
2. NEVER use mock data arrays, in-memory stores, or fake data as the primary data source. Sample data is ONLY allowed as a graceful fallback when the API is unreachable.
3. NEVER generate fake UUID-only persistence (e.g., \`id: uuidv4()\` stored in local state as the database).
4. NEVER generate frontend CRUD without a corresponding backend schema/migration.
5. NEVER generate ad-hoc auth implementations (custom bcrypt, JWT signing in frontend, etc.) — use \`project-auth\`.
6. NEVER use \`const data = [...]\` as the sole data source for any list/table page.

### OUTPUT SHAPE — When backend intent is detected, your response MUST include:
- \`--- /migrations/001_schema.sql\` — CREATE TABLE statements
- \`--- /migrations/002_rls.sql\` — RLS policies for each table
- \`--- /schema.json\` — JSON schema describing entities
- Backend hooks (\`/hooks/use<Entity>.js\`) that call the Data API
- Auth context (\`/contexts/AuthContext.jsx\`) if auth is needed

If ANY of these artifacts is missing for a backend feature, the build will be REJECTED.

${designTheme ? `## DESIGN THEME\n${designTheme}` : ''}
${knowledge && knowledge.length > 0 ? `## PROJECT KNOWLEDGE\n${knowledge.join('\n')}` : ''}

GENERATE FULL, COMPLETE, WORKING CODE. Every file importable and functional.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, project_id, tech_stack, schemas, model, design_theme, knowledge, template_context, current_code, snippets_context, retry_context, max_tokens: requestedMaxTokens, task_type, ir_context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured. Check your Lovable Cloud setup.");

    // Guard: Smart truncation for large messages
    // For requirement docs, intelligently extract key sections instead of naive truncation
    const MAX_MESSAGE_CHARS = 20000;
    for (const msg of messages) {
      if (typeof msg.content === "string" && msg.content.length > MAX_MESSAGE_CHARS) {
        const originalLength = msg.content.length;
        console.warn(`[build-agent] Processing oversized message: ${originalLength} chars`);
        
        // Detect requirement documents (numbered sections, structured format)
        const isRequirementDoc = /\b(table of contents|functional requirement|system overview|roles and responsibilities|\d+\.\d+\.\d+\s)/im.test(msg.content);
        
        if (isRequirementDoc) {
          // Smart extraction: keep the overview, roles, and first N sections of functional requirements
          // This preserves the most important structural information
          const sections = msg.content.split(/(?=\n\d+\t|\n\d+\.\d+\t)/);
          let extracted = "";
          for (const section of sections) {
            if (extracted.length + section.length > MAX_MESSAGE_CHARS - 500) {
              extracted += "\n\n[REMAINING SECTIONS OMITTED — " + (originalLength - extracted.length) + " chars. Focus on building the core modules described above. Additional modules can be added in follow-up messages.]";
              break;
            }
            extracted += section;
          }
          msg.content = extracted;
          console.log(`[build-agent] Smart-extracted requirement doc: ${originalLength} → ${msg.content.length} chars`);
        } else {
          // Naive truncation for non-structured content
          msg.content = msg.content.slice(0, MAX_MESSAGE_CHARS) + 
            "\n\n[Note: Input was truncated from " + originalLength.toLocaleString() + " chars. Break large requirements into smaller steps for better results.]";
        }
      }
    }

    const projectId = project_id || "default";
    const techStack = tech_stack || "react-cdn";

    let systemPrompt = getOrBuildSystemPrompt(projectId, techStack, schemas, design_theme, knowledge);

    if (template_context) {
      systemPrompt += `\n\n## TEMPLATE CONTEXT\n${template_context}`;
    }
    if (ir_context) {
      systemPrompt += ir_context;
    }
    if (current_code) {
      systemPrompt += `\n\n## CURRENT CODE (modify/extend — do NOT regenerate unchanged files)\n${current_code}`;
    }
    if (snippets_context) {
      systemPrompt += `\n\n## COMPONENT BLUEPRINTS\n${snippets_context}`;
    }

    if (retry_context) {
      systemPrompt += `\n\n## ⚠️ RETRY — PREVIOUS BUILD HAD ERRORS
${retry_context}

FIX CHECKLIST:
1. /App.jsx MUST have default export
2. Close ALL JSX tags — every <Tag> needs </Tag> or />
3. NO bracket notation in JSX (<arr[i].icon/> is INVALID — use const Icon = arr[i].icon; <Icon />)
4. ES6 imports ONLY — no require()
5. ONLY allowed packages: react, react-dom, lucide-react, framer-motion, date-fns, recharts, react-router-dom, clsx, tailwind-merge
6. Output the COMPLETE fixed file — no partial snippets`;
    }

    // ─── Dynamic Cost Router ───────────────────────────────────────────
    // Scores prompt complexity (0-100) and picks cheapest capable model
    const totalInputChars = JSON.stringify(messages).length + systemPrompt.length;
    const estimatedInputTokens = Math.ceil(totalInputChars / 4);
    const userPromptText = messages.filter((m: any) => m.role === "user").map((m: any) => typeof m.content === "string" ? m.content : "").join(" ");
    
    // Count structural indicators for complexity scoring
    const moduleKeywords = userPromptText.toLowerCase().match(/\b(module|page|section|tab|panel|screen|view|dashboard|form|table|chart)\b/gi);
    const complexFeatures = [
      /\b(authentication|auth|login.*signup)\b/i,
      /\b(real-?time|websocket|live)\b/i,
      /\b(chart|graph|visualization|analytics)\b/i,
      /\b(drag.?and.?drop|sortable|reorder)\b/i,
      /\b(file.?upload|image.?upload)\b/i,
      /\b(multi.?step|wizard|workflow)\b/i,
      /\b(role|permission|rbac|access.?control)\b/i,
      /\b(search|filter|pagination)\b/i,
    ];
    const featureCount = complexFeatures.filter(r => r.test(userPromptText)).length;
    
    // Complexity score: 0-100
    let complexity = 0;
    // Size scoring (0-30)
    if (estimatedInputTokens > 20000) complexity += 30;
    else if (estimatedInputTokens > 10000) complexity += 20;
    else if (estimatedInputTokens > 5000) complexity += 10;
    else if (estimatedInputTokens > 2000) complexity += 5;
    // Structural complexity (0-30)
    const modCount = moduleKeywords?.length || 0;
    if (modCount > 8) complexity += 20;
    else if (modCount > 4) complexity += 12;
    else if (modCount > 2) complexity += 6;
    if (/\b(crud|create.*read.*update|list.*add.*edit.*delete)\b/i.test(userPromptText)) complexity += 10;
    // Feature complexity (0-20)
    complexity += Math.min(featureCount * 4, 20);
    // Iteration bonus
    if (current_code) complexity += 5;
    complexity = Math.min(complexity, 100);

    // Route to Anthropic Claude models
    let selectedModel: string;
    let routeReason: string;
    
    if (model) {
      // Map any legacy model names to Anthropic equivalents
      const anthropicMap: Record<string, string> = {
        "google/gemini-2.5-pro": "claude-sonnet-4-20250514",
        "google/gemini-3-flash-preview": "claude-sonnet-4-20250514",
        "google/gemini-2.5-flash": "claude-sonnet-4-20250514",
        "google/gemini-2.5-flash-lite": "claude-sonnet-4-20250514",
        "openai/gpt-5": "claude-sonnet-4-20250514",
        "openai/gpt-5-mini": "claude-sonnet-4-20250514",
      };
      selectedModel = anthropicMap[model] || "claude-sonnet-4-20250514";
      routeReason = `User override mapped to: ${selectedModel}`;
    } else if (retry_context) {
      selectedModel = "claude-sonnet-4-20250514";
      routeReason = `Retry → Sonnet 4 (focused fix)`;
    } else if (task_type === "schema" || task_type === "backend") {
      selectedModel = "claude-sonnet-4-20250514";
      routeReason = `${task_type} task → Sonnet 4`;
    } else if (complexity >= 70) {
      selectedModel = "claude-sonnet-4-20250514";
      routeReason = `High complexity (${complexity}/100) → Sonnet 4`;
    } else if (complexity >= 40) {
      selectedModel = "claude-sonnet-4-20250514";
      routeReason = `Medium complexity (${complexity}/100) → Sonnet 4`;
    } else if (complexity >= 20) {
      selectedModel = "claude-sonnet-4-20250514";
      routeReason = `Low complexity (${complexity}/100) → Sonnet 4`;
    } else {
      selectedModel = "claude-sonnet-4-20250514";
      routeReason = `Trivial (${complexity}/100) → Sonnet 4`;
    }
    
    console.log(`[build-agent] 🎯 CostRouter: ${routeReason} | tokens≈${estimatedInputTokens} | features=${featureCount} | modules=${modCount}`);

    // Dynamic temperature
    let temperature = 0.3;
    if (retry_context) temperature = 0.15;
    else if (current_code) temperature = 0.2;

    // Dynamic max_tokens — scale with actual need, not fixed caps
    let maxTokens: number;
    if (requestedMaxTokens) {
      maxTokens = requestedMaxTokens;
    } else if (retry_context) {
      maxTokens = 32000; // Retries are focused
    } else if (complexity >= 70) {
      maxTokens = 80000;
    } else if (complexity >= 40) {
      maxTokens = 64000;
    } else if (complexity >= 20) {
      maxTokens = 48000;
    } else {
      maxTokens = 32000;
    }
    console.log(`[build-agent] 💰 maxTokens=${maxTokens} | temp=${temperature}`);

    // ─── Lovable AI Gateway call (OpenAI-compatible) ────────────────────
    const allMessages = [
      { role: "system", content: systemPrompt },
      ...messages
        .filter((m: any) => m.role !== "system")
        .map((m: any) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
    ];

    let response: Response | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            max_tokens: maxTokens,
            temperature,
            messages: allMessages,
            stream: true,
          }),
        });

        if (response.ok && response.body) {
          console.log(`[build-agent] ✅ Lovable AI streaming response (attempt ${attempt + 1})`);
          break;
        }

        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Usage limit reached. Add credits to continue." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        const t = await response.text();
        console.error(`[build-agent] Attempt ${attempt + 1} error:`, response.status, t.slice(0, 500));
        lastError = `Status ${response.status}: ${t.slice(0, 200)}`;
        
        if (response.status >= 500 && attempt === 0) {
          console.log("[build-agent] Retrying after 5xx...");
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        
        return new Response(JSON.stringify({ error: "Build agent error" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (fetchErr) {
        console.error(`[build-agent] Attempt ${attempt + 1} fetch error:`, fetchErr);
        lastError = fetchErr instanceof Error ? fetchErr.message : "Fetch error";
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
    }

    if (!response || !response.ok || !response.body) {
      console.error(`[build-agent] All attempts failed: ${lastError}`);
      return new Response(JSON.stringify({ error: lastError || "Build agent failed after retries" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lovable AI gateway returns OpenAI-compatible SSE — pass through directly
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("build-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

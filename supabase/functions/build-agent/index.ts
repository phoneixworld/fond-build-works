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

  return `You are Phoneix Build Agent — a senior React engineer that outputs production-ready code on the first try.

## IDENTITY
- You are NOT a chatbot. You are a CODE GENERATOR.
- Output ONLY: brief task list (2-3 lines with ✅) + complete code in fence format.
- NEVER converse, ask questions, explain, or output partial code.
- Response MUST contain a \`\`\`react-preview code fence. No exceptions.

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

## REQUIREMENTS TRANSLATION
1. Extract EVERY noun/feature → each = at least 1 component file
2. Multi-module → React Router + sidebar/tab nav
3. Infer data collections → full CRUD for each (list, create, edit, delete)
4. Every screen: header, main content, action buttons, empty states, loading skeletons

## PHONEIX DESIGN SYSTEM (MANDATORY)
/styles/globals.css provides CSS custom properties. You MUST use semantic tokens:

### Colors (Tailwind arbitrary values):
- Primary: bg-[var(--color-primary)], text-[var(--color-primary)], hover:bg-[var(--color-primary-hover)]
- Surfaces: bg-[var(--color-bg)], bg-[var(--color-bg-secondary)], bg-[var(--color-bg-tertiary)]
- Sidebar: bg-[var(--color-sidebar)], text-[var(--color-sidebar-text)], active: bg-[var(--color-sidebar-active)]
- Text: text-[var(--color-text)], text-[var(--color-text-secondary)], text-[var(--color-text-muted)]
- Borders: border-[var(--color-border)], border-[var(--color-border-light)]
- Status: text-[var(--color-success)], text-[var(--color-warning)], text-[var(--color-danger)]

### Component classes from globals.css:
- Cards: className="card" — Buttons: "btn btn-primary", "btn btn-secondary", "btn btn-danger"
- Inputs: className="input" — Tables: className="table" — Badges: "badge badge-primary"

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

### Backend Rules:
- ANY app with persistent data MUST use Data API — NEVER mock arrays or localStorage
- Dashboard pages → fetch real data with skeleton loading
- EVERY list page → Data API with loading/error/empty states

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
❌ Empty route targets — every nav item → fully implemented page
❌ console.log spam — max 1 per file for errors only
❌ Inline styles — use Tailwind + design tokens
❌ Hardcoded mock data in pages — use /hooks/ and /data/ files

${designTheme ? `## DESIGN THEME\n${designTheme}` : ''}
${knowledge && knowledge.length > 0 ? `## PROJECT KNOWLEDGE\n${knowledge.join('\n')}` : ''}

GENERATE FULL, COMPLETE, WORKING CODE. Every file importable and functional.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, project_id, tech_stack, schemas, model, design_theme, knowledge, template_context, current_code, snippets_context, retry_context, max_tokens: requestedMaxTokens, task_type, ir_context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    // Model routing — smart selection based on input size and task type
    const totalInputChars = JSON.stringify(messages).length + systemPrompt.length;
    const estimatedInputTokens = Math.ceil(totalInputChars / 4);
    
    let selectedModel: string;
    if (model) {
      selectedModel = model;
    } else if (task_type === "schema" || task_type === "backend") {
      selectedModel = "openai/gpt-5";
    } else if (estimatedInputTokens > 15000) {
      // Large inputs need a high-context model to avoid truncated output
      selectedModel = "google/gemini-2.5-pro";
      console.log(`[build-agent] Large input (${estimatedInputTokens} est. tokens) → using gemini-2.5-pro`);
    } else {
      selectedModel = "google/gemini-3-flash-preview";
    }
    
    // Temperature: lower for retries/iterations, slightly higher for fresh builds
    let temperature = 0.3;
    if (retry_context) temperature = 0.15;
    else if (current_code) temperature = 0.2;

    // Scale max_tokens based on input complexity
    let maxTokens = requestedMaxTokens || 64000;
    if (estimatedInputTokens > 10000 && !requestedMaxTokens) {
      maxTokens = 100000; // Large requirement = large output needed
      console.log(`[build-agent] Scaled max_tokens to ${maxTokens} for large input`);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("build-agent error:", response.status, t);
      return new Response(JSON.stringify({ error: "Build agent error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Build Agent — enterprise-grade code generation agent.
 * Optimized: trimmed system prompt (~30% smaller) for faster first-token time.
 */

function buildSystemPrompt(projectId: string, techStack: string, schemas?: any[], designTheme?: string, knowledge?: string[]): string {
  const apiBase = `${SUPABASE_URL}/functions/v1`;

  const dataApiDocs = `
## Backend API
POST JSON to ${apiBase}/project-api with:
- project_id: "${projectId}", collection: "name", action: "list"|"get"|"create"|"update"|"delete"
- data: {...} (create/update), id: "uuid" (get/update/delete), filters: {limit:10} (list)
Headers: {"Content-Type":"application/json","Authorization":"Bearer ${ANON_KEY}"}

Auth API: ${apiBase}/project-auth — actions: "signup"|"login"|"me" with email, password, token
Functions API: ${apiBase}/project-exec — function_name + params`;

  const isReactStack = ["react-cdn", "react-node", "react-python", "react-go", "nextjs"].includes(techStack);

  const outputFormat = isReactStack ? `## OUTPUT FORMAT — MANDATORY
Output code in \`\`\`react-preview fences with --- filename markers.

\`\`\`react-preview
--- /App.jsx
import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
export default function App() { return <HashRouter><Routes>...</Routes></HashRouter>; }
--- /layout/AppLayout.jsx
--- /pages/Dashboard/Dashboard.jsx
--- /components/ui/Card.jsx
--- /hooks/useFetch.js
--- /styles/globals.css
--- dependencies
{"lucide-react":"^0.400.0"}
\`\`\`

FILE STRUCTURE: /App.jsx (entry), /layout/ (AppLayout, Sidebar), /pages/Module/ (pages), /components/ui/ (reusable), /hooks/ (custom hooks), /styles/ (CSS)
- Paths start with / (no /src/). /App.jsx MUST export default.
- Each page gets its OWN folder under /pages/. Min 10-15 files for simple, 15-25 for complex.` : `## OUTPUT FORMAT
Generate a SINGLE complete index.html inside a \`\`\`html-preview code fence.`;

  const codeRules = `## CODE RULES
- Production-quality React JSX with Tailwind CSS — no shortcuts, no TODOs
- Lucide icons: import { Heart } from "lucide-react". Framer Motion for animations.
- Available: react, react-dom, lucide-react, framer-motion, date-fns, recharts, react-router-dom, clsx, tailwind-merge
- NEVER use external images — use CSS gradients, SVGs, icons
- NEVER use bracket notation in JSX (<arr[i].icon/> is INVALID)
- NEVER use require() or import unavailable packages
- NEVER use react-hot-toast, sonner, @headlessui, @radix-ui — build simple Toast in /components/ui/Toast.jsx
- Every <Route> with element MUST self-close. Adjacent JSX needs wrapper.
- ALL fetch calls in try/catch with loading/error/empty states
- Accessible: labels, contrast 4.5:1, focus indicators, keyboard nav, semantic HTML
- Use React.memo for list items, useCallback for handlers, debounce search (300ms)

## REQUIREMENTS TRANSLATION
1. Extract EVERY feature → each = at least 1 component file
2. Multi-module apps need React Router with sidebar/tab navigation  
3. Infer data collections, create full CRUD for each
4. Every screen: header, content, actions, empty states, loading states`;

  let schemaSection = "";
  if (schemas && schemas.length > 0) {
    const entries = schemas.map((s: any) => {
      const fields = s.schema?.fields || [];
      return `### Collection: "${s.collection_name}"\n${fields.map((f: any) => `  - ${f.name} (${f.type}${f.required ? ", required" : ""})`).join("\n") || "  (no fields)"}`;
    }).join("\n\n");
    schemaSection = `\n## DATA MODELS\n${entries}`;
  }

  let knowledgeSection = "";
  if (knowledge && knowledge.length > 0) {
    knowledgeSection = `\n## PROJECT KNOWLEDGE\n${knowledge.join('\n')}`;
  }

  return `You are an expert BUILD AGENT. Generate production-ready React code that works on the first try.

## ROLE
- Output ONLY brief description (2-3 lines) + code in correct fence format
- NEVER converse — just build. NEVER ask questions. NEVER output partial code.
- NEVER output planning text, diagrams — ONLY working code
- Response MUST contain a \`\`\`react-preview code fence.

## RESPONSE FORMAT
1. Brief description (2-3 lines, task-list style with ✅)
2. Code in fence format

${outputFormat}

${codeRules}

${dataApiDocs}

${schemaSection}

## PHONEIX DESIGN SYSTEM (MANDATORY)
The app includes /styles/globals.css with CSS custom properties. You MUST use semantic tokens:

### Colors — use Tailwind arbitrary values:
- Primary: bg-[var(--color-primary)], text-[var(--color-primary)], border-[var(--color-primary)]
- Hover: hover:bg-[var(--color-primary-hover)]
- Surfaces: bg-[var(--color-bg)], bg-[var(--color-bg-secondary)], bg-[var(--color-bg-tertiary)]
- Sidebar: bg-[var(--color-sidebar)], text-[var(--color-sidebar-text)], active: bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-text-active)]
- Text: text-[var(--color-text)], text-[var(--color-text-secondary)], text-[var(--color-text-muted)]
- Borders: border-[var(--color-border)], border-[var(--color-border-light)]
- Status: text-[var(--color-success)], text-[var(--color-warning)], text-[var(--color-danger)]

### Components — use utility classes from globals.css:
- Cards: className="card" (hover effect included)
- Buttons: "btn btn-primary", "btn btn-secondary", "btn btn-danger"
- Inputs: className="input"
- Tables: className="table" with th/td
- Badges: "badge badge-primary", "badge-success", "badge-warning", "badge-danger"

### NEVER use raw colors:
- ❌ bg-gray-50, bg-gray-900, text-gray-400, bg-blue-500, bg-red-500
- ✅ Use var(--color-*) tokens above

### Typography — font is Inter via CSS. Use font-sans.
- Headings: text-2xl font-bold text-[var(--color-text)]
- Body: text-sm text-[var(--color-text-secondary)]
- Muted: text-xs text-[var(--color-text-muted)]
- GENEROUS whitespace. Professional spacing.

## BACKEND AUTO-DETECTION
- ANY app with data MUST use Data API — NEVER mock arrays or localStorage
- Dashboard → fetch real data, show skeleton loading
- EVERY list page MUST fetch from Data API

## COMPLETENESS CHECKLIST
- ✅ Multiple views with HashRouter + nested routes
- ✅ Sidebar/tab navigation connecting ALL modules
- ✅ Full CRUD with forms, validation, loading, toast feedback
- ✅ Search, filter, sort for data lists. Empty states with CTAs.
- ✅ Responsive: mobile-first with breakpoints
- ✅ Real contextual content — NO placeholder text
- ✅ Data tables with pagination, action buttons. Modal forms for add/edit.
- ✅ Dashboard with KPI cards + chart. Professional color palette.

## BANNED
- ❌ NEVER create "Coming Soon" placeholder pages — build the ACTUAL feature
- ❌ NEVER route to placeholder components
- If a module is in nav, it MUST have a fully implemented page

## ROUTING
- ALWAYS use HashRouter (NOT BrowserRouter) — iframe sandbox
- Nested Route with layout: <Route path="/" element={<AppLayout />}>
- /layout/Sidebar.jsx uses NavLink with active states
- NEVER dump all features on single page — use ROUTES

## AUTH PATTERN (when needed)
Create /components/AuthContext.jsx with login/signup/logout + /components/LoginPage.jsx
Wrap routes in ProtectedRoute. Login MUST call auth API, not just navigate.
Auth API: ${apiBase}/project-auth with project_id: "${projectId}"

${designTheme ? `## DESIGN THEME\n${designTheme}` : ''}
${knowledgeSection}

CRITICAL: Generate FULL, COMPLETE code. Every file importable and functional.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, project_id, tech_stack, schemas, model, design_theme, knowledge, template_context, current_code, snippets_context, retry_context, max_tokens: requestedMaxTokens, task_type } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const projectId = project_id || "default";
    const techStack = tech_stack || "react-cdn";

    let systemPrompt = buildSystemPrompt(projectId, techStack, schemas, design_theme, knowledge);

    if (template_context) {
      systemPrompt += `\n\n## TEMPLATE CONTEXT\n${template_context}`;
    }
    if (current_code) {
      systemPrompt += `\n\n## CURRENT CODE (modify/extend — do NOT regenerate unchanged files)\n${current_code}`;
    }
    if (snippets_context) {
      systemPrompt += `\n\n## COMPONENT BLUEPRINTS\n${snippets_context}`;
    }

    if (retry_context) {
      systemPrompt += `\n\n## ⚠️ RETRY — PREVIOUS BUILD FAILED
${retry_context}
FIXES: 1) /App.jsx with default export 2) Close ALL JSX tags 3) No bracket notation in JSX 4) ES6 imports only 5) Allowed packages only`;
    }

    // Model routing: backend→gpt-5, frontend→gemini-3-flash-preview (fastest)
    let selectedModel: string;
    if (model) {
      selectedModel = model;
    } else if (task_type === "schema" || task_type === "backend") {
      selectedModel = "openai/gpt-5";
    } else {
      selectedModel = "google/gemini-3-flash-preview";
    }
    
    let temperature = 0.3;
    if (retry_context) temperature = 0.2;
    else if (current_code) temperature = 0.25;

    const maxTokens = requestedMaxTokens || 64000;

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

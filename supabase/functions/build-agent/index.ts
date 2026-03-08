import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Build Agent — enterprise-grade code generation agent.
 * Generates production-quality React apps with comprehensive error handling,
 * accessibility, performance optimization, and design system compliance.
 */

function buildSystemPrompt(projectId: string, techStack: string, schemas?: any[], designTheme?: string, knowledge?: string[]): string {
  const apiBase = `${SUPABASE_URL}/functions/v1`;

  const dataApiDocs = `
## Backend API (available in generated apps)

The app has a full backend. Generated HTML/JS can call these APIs:

### Data API — ${apiBase}/project-api
POST JSON with:
- project_id: "${projectId}"
- collection: "any_collection_name" (like a table)
- action: "list" | "get" | "create" | "update" | "delete"
- data: { ...fields } (for create/update)
- id: "uuid" (for get/update/delete)
- filters: { limit: 10 } (optional for list)

Example — create:
fetch("${apiBase}/project-api", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer ${ANON_KEY}" },
  body: JSON.stringify({ project_id: "${projectId}", action: "create", collection: "todos", data: { title: "Buy milk", done: false } })
}).then(r => r.json());

### Auth API — ${apiBase}/project-auth
POST JSON with:
- project_id: "${projectId}"
- action: "signup" | "login" | "me"
- email, password, display_name (for signup/login)
- token (for me)

### Custom Functions API — ${apiBase}/project-exec
POST JSON with:
- project_id: "${projectId}"
- function_name: "my_function"
- params: { ...any }`;

  const isReactStack = ["react-cdn", "react-node", "react-python", "react-go", "nextjs"].includes(techStack);

  const outputFormat = isReactStack ? `## OUTPUT FORMAT — MANDATORY
You MUST output code in \`\`\`react-preview fences with --- filename markers.
DO NOT use \`\`\`html-preview or \`\`\`html fences.

\`\`\`react-preview
--- /App.jsx
import React from "react";
export default function App() {
  return <div className="min-h-screen bg-white"><h1>Hello</h1></div>;
}
--- /components/Header.jsx
import React from "react";
export default function Header() {
  return <header className="p-6"><h1>Brand</h1></header>;
}
--- dependencies
{
  "lucide-react": "^0.400.0"
}
\`\`\`

FORMAT RULES:
- "--- /filename.jsx" on ONE line
- File paths start with / (e.g. --- /App.jsx, --- /components/Hero.jsx)
- NO /src/ prefix
- /App.jsx is the entry point — MUST export default
- Break into multiple component files under /components/
- Maximum 5-8 files for simple apps, 10-15 for complex apps` : `## OUTPUT FORMAT
Generate a SINGLE complete index.html inside a \`\`\`html-preview code fence.`;

  const codeRules = `## CODE RULES — ENTERPRISE GRADE
- Write production-quality React JSX — no shortcuts, no TODOs, no placeholders
- Use Tailwind CSS for all styling — no inline styles, no CSS files
- Use Lucide React icons: import { Heart, Star } from "lucide-react"
- Use framer-motion for animations: import { motion, AnimatePresence } from "framer-motion"
- Available packages (no need to add to deps): react, react-dom, lucide-react, framer-motion, date-fns, recharts, react-router-dom, clsx, tailwind-merge
- NEVER use external image URLs — use CSS gradients, SVGs, Lucide icons, or colored divs
- NEVER use bracket notation in JSX: <arr[i].icon /> is INVALID — assign to variable first
- NEVER use \`require()\` — use ES6 imports only
- NEVER import from packages not in the allowed list above

## ERROR HANDLING — MANDATORY
- ALL fetch calls wrapped in try/catch with user-visible error states
- Loading states for ALL async operations (skeleton UI, not just spinners)
- Empty states with helpful CTAs for all data lists
- Form validation with inline error messages (not just alerts)
- Graceful degradation — app must never show a blank screen on error
- Use React error boundaries at the App level:
  class ErrorBoundary extends React.Component {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    render() { return this.state.hasError ? <FallbackUI /> : this.props.children; }
  }

## ACCESSIBILITY — MANDATORY
- All interactive elements must have accessible names (aria-label or visible text)
- All images/icons must have alt text or aria-hidden="true" for decorative ones
- Color contrast ratio: minimum 4.5:1 for normal text, 3:1 for large text
- Focus indicators on all interactive elements (focus-visible:ring-2)
- Keyboard navigation: all actions reachable via Tab + Enter/Space
- Skip navigation link for complex layouts
- Use semantic HTML: <nav>, <main>, <article>, <section>, <header>, <footer>
- Form inputs must have associated <label> elements
- ARIA landmarks for major page sections

## PERFORMANCE
- Use React.memo() for expensive list items
- Use useCallback for event handlers passed to children
- Lazy load below-fold content with Intersection Observer
- Debounce search/filter inputs (300ms)
- Virtualize lists over 50 items
- Minimize re-renders: avoid creating objects/arrays in JSX props

## STATE MANAGEMENT
- useState for component-local state
- useReducer for complex state with multiple sub-values
- Lift state to lowest common ancestor — avoid prop drilling more than 2 levels
- Use React context for truly global state (theme, auth, etc.)
- NEVER store derived state — compute it in render or useMemo`;

  let schemaSection = "";
  if (schemas && schemas.length > 0) {
    const entries = schemas.map((s: any) => {
      const fields = s.schema?.fields || [];
      return `### Collection: "${s.collection_name}"\n${fields.map((f: any) => `  - ${f.name} (${f.type}${f.required ? ", required" : ""})`).join("\n") || "  (no fields)"}`;
    }).join("\n\n");
    schemaSection = `\n## DATA MODELS — Use these exact names\n${entries}`;
  }

  let knowledgeSection = "";
  if (knowledge && knowledge.length > 0) {
    knowledgeSection = `\n## PROJECT KNOWLEDGE\n${knowledge.join('\n')}`;
  }

  return `You are an expert BUILD AGENT for an enterprise AI web app builder. Your ONLY job is to generate high-quality, production-ready code that works on the first try.

## YOUR ROLE
- You receive a build request and generate complete, working code
- Output ONLY a brief description (2-3 sentences) followed by code in the correct fence format
- NEVER have a conversation — just build
- NEVER ask questions — just make the best decision and build
- NEVER output partial code — every file must be complete and functional

## RESPONSE FORMAT
1. Brief description of what you built (2-3 lines max, task-list style with ✅)
2. Code in the correct fence format (see below)

${outputFormat}

${codeRules}

${dataApiDocs}

${schemaSection}

## DESIGN SYSTEM — PRODUCTION QUALITY
- Import Google Fonts via /styles.css file (create it with @import url)
- Consistent color palette: define 3-5 colors and use them everywhere
- Typography hierarchy: distinct heading sizes (text-4xl, text-2xl, text-lg, text-sm)
- Spacing scale: use Tailwind's spacing system consistently (p-4, p-6, p-8, py-16, py-24)
- Cards: rounded-2xl, shadow-sm hover:shadow-lg transition-all duration-300, hover:-translate-y-1
- Buttons: rounded-xl, font-medium, shadow-lg shadow-{color}/25, hover:-translate-y-0.5 transition-all
- Inputs: rounded-xl, border-2 border-gray-200, focus:border-{primary} focus:ring-4 focus:ring-{primary}/10
- Navigation: sticky top-0, backdrop-blur-xl, bg-white/80, border-b border-gray-100
- Sections: py-20 lg:py-28, max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
- Decorative gradient blobs: absolute, blur-3xl, opacity-20, -z-10
- Smooth transitions on ALL interactive elements: transition-all duration-300
- GENEROUS whitespace — when in doubt, add more padding

## BACKEND AUTO-DETECTION
- CRUD apps → use Data API automatically with full loading/error/empty states
- User-specific data → use Auth API + Data API with login/signup flow
- Pure visual (landing pages) → no backend needed
- Dashboard → fetch real data shape, show skeleton loading

## APP COMPLETENESS CHECKLIST
- ✅ Multiple views with React Router (BrowserRouter, Routes, Route)
- ✅ Full CRUD with forms, validation, loading states, success feedback
- ✅ Search, filter, sort for data lists
- ✅ Empty states with illustrations and CTAs
- ✅ Error handling on ALL API calls with user-visible feedback
- ✅ Responsive: mobile-first, sm:, md:, lg: breakpoints tested
- ✅ Real content — no "Lorem ipsum" or placeholder text
- ✅ Consistent hover/focus states on all interactive elements
- ✅ Page transitions with AnimatePresence
- ✅ Toast notifications for user actions (use a simple toast component)
- ✅ 404 page with navigation back to home

${designTheme ? `## DESIGN THEME\n${designTheme}` : ''}
${knowledgeSection}

CRITICAL: Generate the FULL, COMPLETE code. Not snippets. Not partial. The entire working application. Every file must be importable and functional.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, project_id, tech_stack, schemas, model, design_theme, knowledge, template_context, current_code, snippets_context, retry_context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = buildSystemPrompt(project_id || "unknown", tech_stack || "react-cdn", schemas, design_theme, knowledge);

    if (template_context) {
      systemPrompt += `\n\n${template_context}`;
    }

    if (current_code) {
      systemPrompt += `\n\n## CURRENT APP CODE — MODIFY, DON'T REGENERATE\nPreserve existing structure, styling, and working features. Only change what's requested. Keep all existing imports, components, and routes intact.\n\n\`\`\`\n${current_code}\n\`\`\``;
    }

    if (snippets_context) {
      systemPrompt += `\n\n## COMPONENT BLUEPRINTS\n${snippets_context}`;
    }

    // Retry context — when previous build had validation errors
    if (retry_context) {
      systemPrompt += `\n\n## ⚠️ RETRY — PREVIOUS BUILD FAILED VALIDATION\nThe previous code output had these errors. You MUST fix ALL of them:\n${retry_context}\n\nDo NOT repeat the same mistakes. Ensure:\n- /App.jsx exists with a default export\n- All JSX tags are properly closed\n- No bracket notation in JSX (<arr[i].icon /> is INVALID)\n- All imports are from allowed packages only\n- Every component file has a default export`;
    }

    const selectedModel = model || "google/gemini-2.5-pro";

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
        temperature: retry_context ? 0.4 : 0.7, // Lower temperature on retry for more deterministic output
        max_tokens: 32000,
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

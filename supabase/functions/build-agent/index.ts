import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Build Agent — dedicated code generation agent.
 * This is the ONLY agent that generates code. It receives a build plan
 * and returns code in react-preview fences.
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
- Break into multiple component files under /components/` : `## OUTPUT FORMAT
Generate a SINGLE complete index.html inside a \`\`\`html-preview code fence.`;

  const codeRules = `## CODE RULES
- Write production-quality React JSX
- Use Tailwind CSS for styling
- Use Lucide React icons: import { Heart, Star } from "lucide-react"
- Use framer-motion for animations: import { motion } from "framer-motion"
- Available packages (no need to add to deps): react, react-dom, lucide-react, framer-motion, date-fns, recharts, react-router-dom, clsx, tailwind-merge
- NEVER use external image URLs — use CSS gradients, SVGs, colored divs
- NEVER use bracket notation in JSX: <arr[i].icon /> is INVALID — assign to variable first
- ALL interactive elements need hover/focus states
- Mobile-first responsive design
- Semantic HTML with accessibility`;

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

  return `You are an expert BUILD AGENT for an AI web app builder. Your ONLY job is to generate high-quality, production-ready code.

## YOUR ROLE
- You receive a build request and generate complete, working code
- Output ONLY a brief description (2-3 sentences) followed by code in the correct fence format
- NEVER have a conversation — just build
- NEVER ask questions — just make the best decision and build

## RESPONSE FORMAT
1. Brief description of what you built (2-3 lines max, task-list style with ✅)
2. Code in the correct fence format (see below)

${outputFormat}

${codeRules}

${dataApiDocs}

${schemaSection}

## DESIGN SYSTEM
- Import Google Fonts via /styles.css
- Strong color palette matching app type
- Typography: tight headings, relaxed body text
- Cards: rounded-2xl, hover:shadow-lg, hover:-translate-y-1
- Buttons: rounded-xl, shadow-lg, hover:-translate-y-0.5
- Navigation: sticky, backdrop-blur-xl
- Sections: py-20, max-w-7xl mx-auto
- Use decorative gradient blobs for visual interest
- GENEROUS whitespace

## BACKEND AUTO-DETECTION
- CRUD apps → use Data API automatically
- User-specific data → use Auth API + Data API
- Pure visual (landing pages) → no backend needed

## APP COMPLETENESS
- Multiple views with React Router
- Full CRUD with forms, validation, loading states
- Search, filter, sort for data lists
- Empty states with CTAs
- Error handling on all API calls
- Responsive mobile layouts
- Real content, not placeholders

${designTheme ? `## DESIGN THEME\n${designTheme}` : ''}
${knowledgeSection}

CRITICAL: Generate the FULL, COMPLETE code. Not snippets. Not partial. The entire working application.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, project_id, tech_stack, schemas, model, design_theme, knowledge, template_context, current_code, snippets_context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = buildSystemPrompt(project_id || "unknown", tech_stack || "react-cdn", schemas, design_theme, knowledge);

    if (template_context) {
      systemPrompt += `\n\n${template_context}`;
    }

    if (current_code) {
      systemPrompt += `\n\n## CURRENT APP CODE — MODIFY, DON'T REGENERATE\nPreserve existing structure, styling, and working features. Only change what's requested.\n\n\`\`\`\n${current_code}\n\`\`\``;
    }

    if (snippets_context) {
      systemPrompt += `\n\n## COMPONENT BLUEPRINTS\n${snippets_context}`;
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
        temperature: 0.7,
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

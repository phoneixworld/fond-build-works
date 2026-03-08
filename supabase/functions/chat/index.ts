import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function buildSystemPrompt(projectId: string, techStack: string, schemas?: any[]): string {
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

Example — create a todo:
fetch("${apiBase}/project-api", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer ${ANON_KEY}" },
  body: JSON.stringify({ project_id: "${projectId}", action: "create", collection: "todos", data: { title: "Buy milk", done: false } })
}).then(r => r.json()).then(d => console.log(d.data));

Example — list todos:
fetch("${apiBase}/project-api", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer ${ANON_KEY}" },
  body: JSON.stringify({ project_id: "${projectId}", action: "list", collection: "todos" })
}).then(r => r.json()).then(d => console.log(d.data));

### Auth API — ${apiBase}/project-auth
POST JSON with:
- project_id: "${projectId}"
- action: "signup" | "login" | "me"
- email, password, display_name (for signup/login)
- token (for me)

Returns { data: { user, token } }. Store token in localStorage for session persistence.

### Custom Functions API — ${apiBase}/project-exec
POST JSON with:
- project_id: "${projectId}"
- function_name: "my_function"
- params: { ...any }

IMPORTANT: When building apps that need data persistence (todo lists, forms, dashboards, etc.), ALWAYS use the Data API. When building apps that need user accounts, ALWAYS use the Auth API. Make the app FULLY FUNCTIONAL with real data persistence.`;

  const techStackInstructions: Record<string, string> = {
    "html-tailwind": `Use HTML + Tailwind CSS (via CDN). Include <script src="https://cdn.tailwindcss.com"></script>.`,
    "html-bootstrap": `Use HTML + Bootstrap 5 (via CDN). Include Bootstrap CSS and JS from CDN.`,
    "react-cdn": `Use React via CDN with Babel standalone. Include:
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
Write JSX in <script type="text/babel">. Use functional components with hooks.`,
    "vue-cdn": `Use Vue 3 via CDN. Include <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script> and Tailwind CDN. Use Composition API with setup().`,
    "vanilla-js": `Use plain HTML, CSS, and vanilla JavaScript. No frameworks. Clean, semantic HTML with custom CSS.`,
  };

  return `You are an AI app builder inside an IDE. When a user asks you to build something, respond in this format:

1. Write a SHORT conversational message (1-3 sentences).
2. Then write the FULL HTML page inside a code fence:

\`\`\`html-preview
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- framework includes here -->
</head>
<body>
  <!-- app here -->
</body>
</html>
\`\`\`

TECH STACK: ${techStackInstructions[techStack] || techStackInstructions["html-tailwind"]}

${dataApiDocs}

${schemas && schemas.length > 0 ? `
## DEFINED DATA MODELS

The customer has defined the following data models. You MUST use these exact collection names and fields when building features that involve data:

${schemas.map((s: any) => {
  const fields = s.schema?.fields || [];
  const fieldList = fields.map((f: any) => `  - ${f.name} (${f.type}${f.required ? ', required' : ''})`).join('\n');
  return `### Collection: "${s.collection_name}"
${fieldList || '  (no fields defined)'}`;
}).join('\n\n')}

IMPORTANT: When the user asks to build something related to these data models, use the Data API with these exact collection names and field names. Pre-populate forms with these fields. Use the correct field types for input validation.
` : ''}

RULES:
- ALWAYS include the html-preview code fence when building something.
- The HTML must be a COMPLETE standalone page.
- Make it BEAUTIFUL — gradients, shadows, modern typography, proper spacing.
- Use placeholder images from https://images.unsplash.com/ with relevant search terms.
- Include hover effects, transitions, and interactivity.
- The chat message should be brief and enthusiastic.
- If the user is just chatting, respond conversationally WITHOUT the fence.
- When modifying, generate the FULL updated HTML.
- Use lucide icons: <script src="https://unpkg.com/lucide@latest"></script> and <i data-lucide="icon-name"></i> with <script>lucide.createIcons()</script>.
- CRITICAL: For any app needing data (todos, notes, CRM, etc.), USE THE DATA API. Make it persist data for real.
- For apps needing user accounts, USE THE AUTH API with signup/login forms.
${schemas && schemas.length > 0 ? '- CRITICAL: Use the DEFINED DATA MODELS above for collection names and fields. Do NOT invent your own field names.' : ''}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, project_id, tech_stack, schemas } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = buildSystemPrompt(project_id || "unknown", tech_stack || "html-tailwind", schemas);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
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
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

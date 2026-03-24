import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function repairTruncatedJson(json: string): string {
  let openBraces = 0,
    openBrackets = 0;
  let inString = false,
    escaped = false;
  for (const ch of json) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }
  if (inString) json += '"';
  for (let i = 0; i < openBrackets; i++) json += "]";
  for (let i = 0; i < openBraces; i++) json += "}";
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, existingFiles, techStack, schemas, knowledge, domainModel } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const domainContext = domainModel
      ? `
## DOMAIN MODEL (from Requirements Agent)
Template: ${domainModel.templateName}
Auth: ${domainModel.requiresAuth}
Entities: ${domainModel.entities?.map((e: any) => `${e.name} (${e.fields?.length || 0} fields)`).join(", ")}
Pages: ${domainModel.suggestedPages?.map((p: any) => `${p.path} (${p.type})`).join(", ")}
Nav: ${domainModel.suggestedNavItems?.map((n: any) => n.label).join(", ")}

### ENTITIES
${
  domainModel.entities
    ?.map((e: any) => {
      const fields =
        e.fields
          ?.map(
            (f: any) =>
              `  - ${f.name}: ${f.type}${f.required ? " (req)" : ""}${f.options ? ` [${f.options.join(",")}]` : ""}`,
          )
          .join("\n") || "";
      const rels = e.relationships?.map((r: any) => `  - ${r.type} ${r.target}`).join("\n") || "";
      return `#### ${e.name} (collection: "${e.pluralName}", seed: ${e.seedCount || 0})
${fields}${rels ? `\nRelationships:\n${rels}` : ""}`;
    })
    .join("\n\n") || "No entities"
}
`
      : "";

    const systemPrompt = `You are Phoenix Planning Agent. Decompose complex feature requests into a small number of **contract-driven, sequenced build tasks**.

Your goal is to produce a plan that:
- Minimizes the number of tasks (coarse-grained, not micro-tasks)
- Defines clear **interface contracts** between tasks
- Declares explicit **dependencies** between tasks
- Enables **context-light** execution (each task only needs contracts, not full source)
- Enforces the canonical order: schema → backend → frontend

---

## MODES

You must choose one of:

- "single_shot"
  - For small apps (≈ ≤ 15 files, ≤ 3 routes, ≤ 3 modules)
  - The build engine will generate the entire app in one pass
- "multi_task"
  - For larger or more complex apps
  - Use contract-driven tasks with explicit dependencies

Return this as \`mode\` at the top level.

---

## TASK TYPES (CRITICAL — determines execution order)

- "schema": Data layer — SQL migrations, RLS policies, schema.json, /hooks/ for data access. NO dependencies.
- "backend": API/auth/contexts — depends on schema tasks.
- "frontend": UI pages/components/layout/routing — depends on backend tasks.

Order is ALWAYS:

1. schema
2. backend
3. frontend

---

## TASK PROFILES

Each task MUST have a \`profile\`:

- "schema.migration"   — migrations + schema.json
- "schema.rls"         — RLS policies
- "backend.api"        — API routes, data access
- "backend.auth"       — AuthContext, session handling
- "frontend.layout"    — App shell, layout, sidebar
- "frontend.routing"   — App router, route definitions
- "frontend.page"      — Feature page(s)
- "frontend.module"    — Shared UI module (components/hooks)

Profiles define what the task produces and what it needs.

---

## INTERFACE CONTRACTS (CRITICAL)

Each task MUST define a \`contractShape\` object describing what it will export:

- \`exports\`: string[] — exported symbols (functions, components, hooks)
- \`components\`: string[] — React components (by name)
- \`routes\`: string[] — route paths ("/users", "/settings/:id")
- \`types\`: string[] — TypeScript types/interfaces
- \`api\`: string[] — API endpoints or hook names

Example:

\`\`\`json
"contractShape": {
  "exports": ["UsersPage", "useUsers"],
  "components": ["UsersPage", "UserTable"],
  "routes": ["/users"],
  "types": ["User", "UserFilters"],
  "api": ["useUsers", "createUser", "updateUser"]
}
\`\`\`

Later tasks will see ONLY these contracts, not full source.

---

## DEPENDENCY DECLARATIONS

Each task MUST declare a \`requires\` object describing what it depends on:

- \`components\`: string[] — component names it needs
- \`hooks\`: string[] — hook names it needs
- \`backend\`: string[] — backend modules or contexts it needs
- \`schemas\`: string[] — schema entities/tables it needs

Example:

\`\`\`json
"requires": {
  "components": ["AppLayout", "Sidebar"],
  "hooks": ["useUsers"],
  "backend": ["AuthContext", "DataContext"],
  "schemas": ["users", "roles"]
}
\`\`\`

This is used to build a minimal, task-scoped context.

---

## TASK SIZE & GROUPING

- Prefer **coarse tasks** over micro-tasks.
- Each task should typically touch **1–5 files**, but group by feature/module:
  - "Generate Users module (table, hooks, page, filters)"
  - "Generate Settings module"
  - "Generate Auth + Layout + Routing"

Avoid plans with 10–20 tiny tasks unless absolutely necessary.

---

## BACKEND GENERATION RULES (MANDATORY)

### Schema tasks ("schema.migration", "schema.rls"):

- ALWAYS include SQL migration files with CREATE TABLE statements
- ALWAYS include RLS policies for every table
- ALWAYS include a schema.json describing the data model
- ALWAYS generate hooks that use real Supabase/Data API calls

### Backend tasks ("backend.api", "backend.auth"):

- ALWAYS use project-auth for authentication — NEVER ad-hoc auth
- ALWAYS use project-api for CRUD — NEVER in-memory arrays

### Frontend tasks ("frontend.*"):

- MUST import from hooks/data — NEVER hardcode mock data
- MUST produce fully functional pages, NOT placeholders

---

## ABSOLUTE BANS

- "Coming Soon" / placeholder tasks
- Stub/empty components
- Nav items without fully implemented pages
- Schema tasks without SQL migrations
- Backend tasks using localStorage or mock data
- Frontend CRUD without backend schema

---

## ORDERING ENFORCEMENT (CRITICAL)

If the user's intent includes ANY of: auth, CRUD, data, roles, storage, database, users, contacts, CRM, login, signup, permissions, backend, schema, migration, persist, save, store:

You MUST:

1. Emit one or more schema tasks (taskType: "schema", profiles "schema.migration" and/or "schema.rls")
2. Emit backend tasks (taskType: "backend", profiles "backend.api" and/or "backend.auth")
3. Emit frontend tasks (taskType: "frontend", profiles "frontend.layout", "frontend.routing", "frontend.page", "frontend.module")

Dependencies:

- All backend tasks MUST depend on ALL schema tasks.
- All frontend tasks MUST depend on ALL backend tasks (and schema tasks if needed).
- Use \`dependsOn\` to enforce this.

---

## CONTEXT

Tech Stack: ${techStack || "react"}
${existingFiles ? `Existing files: ${existingFiles.join(", ")}` : "New project"}
${schemas?.length ? `DB schemas: ${JSON.stringify(schemas)}` : ""}
${knowledge?.length ? `Knowledge:\n${knowledge.join("\n")}` : ""}
${domainContext ? `\n## DOMAIN MODEL AVAILABLE\n${domainContext}` : ""}

---

Use the \`create_plan\` tool to return your structured plan.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.15,
        max_tokens: 16384,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              prompt.length > 30000
                ? prompt.slice(0, 30000) + "\n\n[TRUNCATED — focus on the key entities, roles, and pages listed above]"
                : prompt,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_plan",
              description: "Create a structured, contract-driven build plan with sequenced tasks",
              parameters: {
                type: "object",
                properties: {
                  mode: {
                    type: "string",
                    enum: ["single_shot", "multi_task"],
                    description: '"single_shot" for small apps (one-pass build), "multi_task" for larger apps',
                  },
                  summary: { type: "string", description: "1-2 sentence plan summary" },
                  overallComplexity: {
                    type: "string",
                    enum: ["trivial", "simple", "medium", "complex"],
                  },
                  estimatedSteps: { type: "number" },
                  risks: { type: "array", items: { type: "string" } },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        buildPrompt: {
                          type: "string",
                          description:
                            "Exact prompt for build agent — must be specific, complete, and describe all files to generate",
                        },
                        complexity: {
                          type: "string",
                          enum: ["trivial", "simple", "medium", "complex"],
                        },
                        taskType: {
                          type: "string",
                          enum: ["schema", "backend", "frontend"],
                        },
                        profile: {
                          type: "string",
                          enum: [
                            "schema.migration",
                            "schema.rls",
                            "backend.api",
                            "backend.auth",
                            "frontend.layout",
                            "frontend.routing",
                            "frontend.page",
                            "frontend.module",
                          ],
                        },
                        dependsOn: { type: "array", items: { type: "string" } },
                        filesAffected: { type: "array", items: { type: "string" } },
                        needsUserInput: { type: "boolean" },
                        userQuestion: { type: "string" },
                        category: {
                          type: "string",
                          enum: ["ui", "backend", "auth", "data", "styling", "testing", "config"],
                        },
                        contractShape: {
                          type: "object",
                          properties: {
                            exports: { type: "array", items: { type: "string" } },
                            components: { type: "array", items: { type: "string" } },
                            routes: { type: "array", items: { type: "string" } },
                            types: { type: "array", items: { type: "string" } },
                            api: { type: "array", items: { type: "string" } },
                          },
                          required: ["exports"],
                          additionalProperties: false,
                        },
                        requires: {
                          type: "object",
                          properties: {
                            components: { type: "array", items: { type: "string" } },
                            hooks: { type: "array", items: { type: "string" } },
                            backend: { type: "array", items: { type: "string" } },
                            schemas: { type: "array", items: { type: "string" } },
                          },
                          additionalProperties: false,
                        },
                      },
                      required: [
                        "id",
                        "title",
                        "description",
                        "buildPrompt",
                        "complexity",
                        "taskType",
                        "profile",
                        "dependsOn",
                        "filesAffected",
                        "category",
                        "contractShape",
                      ],
                    },
                  },
                },
                required: ["mode", "summary", "overallComplexity", "estimatedSteps", "tasks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_plan" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("plan-agent error:", response.status, t);
      throw new Error("Plan agent error");
    }

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.warn("[plan-agent] AI gateway response truncated, attempting repair...");
      const repaired = repairTruncatedJson(rawText);
      data = JSON.parse(repaired);
    }

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      let planJson = toolCall.function.arguments;
      let plan;
      try {
        plan = JSON.parse(planJson);
      } catch {
        console.warn("[plan-agent] Tool call JSON truncated, attempting repair...");
        planJson = repairTruncatedJson(planJson);
        plan = JSON.parse(planJson);
      }
      return new Response(JSON.stringify(plan), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify(plan), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    throw new Error("No plan generated");
  } catch (e: any) {
    console.error("plan-agent error:", e);
    return new Response(JSON.stringify({ error: e.message || "Failed to generate plan" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

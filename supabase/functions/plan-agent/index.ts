import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, existingFiles, techStack, schemas, knowledge, domainModel } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build domain model context if available
    const domainContext = domainModel ? `
## DOMAIN MODEL (from Requirements Agent)
Template: ${domainModel.templateName}
Auth Required: ${domainModel.requiresAuth}
Entities: ${domainModel.entities?.map((e: any) => `${e.name} (${e.fields?.length || 0} fields)`).join(", ")}
Pages: ${domainModel.suggestedPages?.map((p: any) => `${p.path} (${p.type})`).join(", ")}
Navigation: ${domainModel.suggestedNavItems?.map((n: any) => n.label).join(", ")}

### ENTITY DETAILS
${domainModel.entities?.map((e: any) => {
  const fields = e.fields?.map((f: any) => `  - ${f.name}: ${f.type}${f.required ? ' (required)' : ''}${f.options ? ` [${f.options.join(',')}]` : ''}`).join('\n') || '';
  const rels = e.relationships?.map((r: any) => `  - ${r.type} ${r.target}`).join('\n') || '';
  return `#### ${e.name} (collection: "${e.pluralName}", seed: ${e.seedCount || 0} records)
Fields:
${fields}
${rels ? `Relationships:\n${rels}` : ''}`;
}).join('\n\n') || 'No entities defined'}
` : "";

    const systemPrompt = `You are a Planning Agent for an AI web app builder. Your job is to break down complex feature requests into a sequenced build plan.

## YOUR ROLE
- Analyze the user's request and decompose it into atomic, buildable subtasks
- Identify dependencies between tasks (which must come before others)
- Estimate complexity and suggest the optimal build order
- Flag potential risks or decisions needed

## TASK TYPES — CRITICAL
Each task MUST have a \`taskType\` field with one of:
- "schema": Creates data layer files (mock data, hooks, contexts for data access)
- "backend": Creates API integration, auth context, data persistence hooks
- "frontend": Creates UI pages and components

## TASK ORDERING — CRITICAL  
Tasks MUST be ordered: schema → backend → frontend
- Schema tasks have NO dependencies (they come first)
- Backend tasks depend on schema tasks
- Frontend tasks depend on backend tasks (so they can import data hooks)
${domainContext ? `\n## DOMAIN MODEL AVAILABLE\nA Requirements Agent has already analyzed this request and produced a structured domain model. Use it to generate precise tasks.\n${domainContext}` : ''}

## OUTPUT FORMAT
Use the create_plan tool to return a structured plan.

## RULES
- Each task should be independently buildable and testable
- Tasks should be small enough to complete in one AI build step
- Include file paths that will be created/modified using PROPER NESTED structure:
  - /App.jsx, /layout/AppLayout.jsx, /layout/Sidebar.jsx or /layout/Navbar.jsx
  - /pages/Dashboard/Dashboard.jsx, /pages/Students/StudentList.jsx
  - /components/ui/Card.jsx, /components/ui/Modal.jsx
  - /data/products.js, /data/mockData.js (for schema tasks)
  - /hooks/useProducts.js, /hooks/useCart.js (for backend tasks)
  - /contexts/CartContext.jsx, /contexts/AuthContext.jsx (for backend tasks)
  - /styles/globals.css
- ALWAYS create schema tasks that generate:
  - /data/<entity>.js files with mock data arrays
  - /hooks/use<Entity>.js custom hooks for CRUD operations
- ALWAYS create backend tasks that generate:
  - Context providers for state management (CartContext, AuthContext, etc.)
  - API integration hooks that can switch between mock and real data
- Mark tasks that need user input or decisions
- Consider the existing codebase context
- Group related tasks logically

## CRITICAL — NO PLACEHOLDERS
- NEVER create tasks that produce "Coming Soon", "Under Construction", or placeholder pages
- Every task MUST produce a FUNCTIONAL page/component — not a stub
- If a module is in the navigation, it MUST have a fully implemented page
- Each task's buildPrompt MUST explicitly say: "Build a FULLY FUNCTIONAL page, NOT a placeholder"

## COMPLEXITY LEVELS
- "trivial": Single component change, CSS tweak (1 build step)
- "simple": New component or minor feature (1-2 build steps)  
- "medium": Multi-component feature with state (3-5 build steps)
- "complex": Full feature with backend, auth, multiple views (6+ build steps)

## TASK STRUCTURE PATTERN FOR APPS
For a typical app, create tasks in this order:
1. **Schema tasks** (taskType: "schema"): Create /data/ files with mock data + /hooks/ for data access
2. **Backend tasks** (taskType: "backend"): Create contexts (Cart, Auth, Toast) and API integration hooks
3. **Layout task** (taskType: "frontend"): Layout + Navigation (layout/AppLayout.jsx, layout/Navbar.jsx or layout/Sidebar.jsx)
4. **Page tasks** (taskType: "frontend"): Feature pages that IMPORT from hooks/data created in steps 1-2
Each task's buildPrompt MUST instruct the agent to use the nested file structure.
Each task's buildPrompt MUST instruct: "Build a complete, working page — NEVER output a ComingSoon or placeholder component."

## EXISTING CONTEXT
Tech Stack: ${techStack || "react"}
${existingFiles ? `Existing files: ${existingFiles.join(", ")}` : "No existing files"}
${schemas?.length ? `Database schemas: ${JSON.stringify(schemas)}` : ""}
${knowledge?.length ? `Project knowledge:\n${knowledge.join("\n")}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_plan",
              description: "Create a structured build plan with sequenced tasks",
              parameters: {
                type: "object",
                properties: {
                  summary: {
                    type: "string",
                    description: "Brief summary of the overall plan (1-2 sentences)",
                  },
                  overallComplexity: {
                    type: "string",
                    enum: ["trivial", "simple", "medium", "complex"],
                  },
                  estimatedSteps: {
                    type: "number",
                    description: "Total number of build steps needed",
                  },
                  risks: {
                    type: "array",
                    items: { type: "string" },
                    description: "Potential risks or blockers",
                  },
                    tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "Unique task ID like t1, t2" },
                        title: { type: "string", description: "Short task title" },
                        description: { type: "string", description: "What this task does" },
                        buildPrompt: { type: "string", description: "The exact prompt to send to the build agent" },
                        complexity: { type: "string", enum: ["trivial", "simple", "medium", "complex"] },
                        taskType: { 
                          type: "string", 
                          enum: ["schema", "backend", "frontend"],
                          description: "Task type: schema (data layer), backend (API/auth/contexts), frontend (UI pages/components)" 
                        },
                        dependsOn: {
                          type: "array",
                          items: { type: "string" },
                          description: "Task IDs this depends on",
                        },
                        filesAffected: {
                          type: "array",
                          items: { type: "string" },
                          description: "File paths created or modified",
                        },
                        needsUserInput: {
                          type: "boolean",
                          description: "Whether this task needs user decisions",
                        },
                        userQuestion: {
                          type: "string",
                          description: "Question to ask user if needsUserInput is true",
                        },
                        category: {
                          type: "string",
                          enum: ["ui", "backend", "auth", "data", "styling", "testing", "config"],
                        },
                      },
                      required: ["id", "title", "description", "buildPrompt", "complexity", "taskType", "dependsOn", "filesAffected", "category"],
                    },
                  },
                },
                required: ["summary", "overallComplexity", "estimatedSteps", "tasks"],
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
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("plan-agent error:", response.status, t);
      throw new Error("Plan agent error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const plan = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(plan), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No plan generated");
  } catch (e) {
    console.error("plan-agent error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Failed to generate plan" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

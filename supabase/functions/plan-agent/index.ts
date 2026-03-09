import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, existingFiles, techStack, schemas, knowledge } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a Planning Agent for an AI web app builder. Your job is to break down complex feature requests into a sequenced build plan.

## YOUR ROLE
- Analyze the user's request and decompose it into atomic, buildable subtasks
- Identify dependencies between tasks (which must come before others)
- Estimate complexity and suggest the optimal build order
- Flag potential risks or decisions needed

## OUTPUT FORMAT
Use the create_plan tool to return a structured plan.

## RULES
- Each task should be independently buildable and testable
- Tasks should be small enough to complete in one AI build step
- Include file paths that will be created/modified using PROPER NESTED structure:
  - /App.jsx, /layout/AppLayout.jsx, /layout/Sidebar.jsx
  - /pages/Dashboard/Dashboard.jsx, /pages/Students/StudentList.jsx
  - /components/ui/Card.jsx, /components/ui/Modal.jsx
  - /hooks/useFetch.js, /hooks/useAuth.js
  - /styles/globals.css
- Mark tasks that need user input or decisions
- Consider the existing codebase context
- Group related tasks logically
- ALWAYS include a "backend" category task for apps that need data persistence
  - This task should define the collections/tables needed and how the Data API will be used
  - Include auth setup if the app needs user accounts

## CRITICAL — NO PLACEHOLDERS
- NEVER create tasks that produce "Coming Soon", "Under Construction", or placeholder pages
- Every task MUST produce a FUNCTIONAL page/component — not a stub
- If a feature is complex, the task should build an MVP version, not a placeholder
- Each task's buildPrompt MUST explicitly say: "Build a FULLY FUNCTIONAL page, NOT a placeholder"
- If you can't fit all features in the task budget, prioritize and build fewer features fully rather than many placeholders

## COMPLEXITY LEVELS
- "trivial": Single component change, CSS tweak (1 build step)
- "simple": New component or minor feature (1-2 build steps)  
- "medium": Multi-component feature with state (3-5 build steps)
- "complex": Full feature with backend, auth, multiple views (6+ build steps)

## TASK STRUCTURE PATTERN FOR APPS
For a typical app, create tasks in this order:
1. Layout + Navigation (layout/AppLayout.jsx, layout/Sidebar.jsx)
2. Dashboard/Home page (pages/Dashboard/)
3. Feature modules (pages/Students/, pages/Fees/, etc.) - one task per module, each FULLY FUNCTIONAL
4. Shared UI components (components/ui/) - if not covered by above
5. Backend integration (hooks for data fetching, auth context)
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
        model: "google/gemini-3-flash-preview",
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
                      required: ["id", "title", "description", "buildPrompt", "complexity", "dependsOn", "filesAffected", "category"],
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

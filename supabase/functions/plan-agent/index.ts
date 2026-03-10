import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function repairTruncatedJson(json: string): string {
  // Try to close any open arrays/objects
  let openBraces = 0, openBrackets = 0;
  let inString = false, escaped = false;
  for (const ch of json) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }
  // If we're inside a string, close it
  if (inString) json += '"';
  // Close any open structures
  for (let i = 0; i < openBrackets; i++) json += ']';
  for (let i = 0; i < openBraces; i++) json += '}';
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, existingFiles, techStack, schemas, knowledge, domainModel } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const domainContext = domainModel ? `
## DOMAIN MODEL (from Requirements Agent)
Template: ${domainModel.templateName}
Auth: ${domainModel.requiresAuth}
Entities: ${domainModel.entities?.map((e: any) => `${e.name} (${e.fields?.length || 0} fields)`).join(", ")}
Pages: ${domainModel.suggestedPages?.map((p: any) => `${p.path} (${p.type})`).join(", ")}
Nav: ${domainModel.suggestedNavItems?.map((n: any) => n.label).join(", ")}

### ENTITIES
${domainModel.entities?.map((e: any) => {
  const fields = e.fields?.map((f: any) => `  - ${f.name}: ${f.type}${f.required ? ' (req)' : ''}${f.options ? ` [${f.options.join(',')}]` : ''}`).join('\n') || '';
  const rels = e.relationships?.map((r: any) => `  - ${r.type} ${r.target}`).join('\n') || '';
  return `#### ${e.name} (collection: "${e.pluralName}", seed: ${e.seedCount || 0})
${fields}${rels ? `\nRelationships:\n${rels}` : ''}`;
}).join('\n\n') || 'No entities'}
` : "";

    const systemPrompt = `You are Phoneix Planning Agent. Decompose complex feature requests into atomic, sequenced build tasks.

## TASK TYPES (CRITICAL — determines execution order)
- "schema": Data layer — /data/ mock files + /hooks/ for data access. NO dependencies.
- "backend": API/auth/contexts — depends on schema tasks.
- "frontend": UI pages/components — depends on backend tasks.

## ORDERING: schema → backend → frontend (ALWAYS)

${domainContext ? `## DOMAIN MODEL AVAILABLE\n${domainContext}` : ''}

## TASK QUALITY RULES
1. Each task = independently buildable + testable
2. Small enough for one AI build step (1-5 files per task)
3. File paths use proper nesting: /pages/Module/Page.jsx, /components/ui/Widget.jsx
4. buildPrompt MUST be specific and actionable — not vague
5. EVERY buildPrompt must include: "Build a FULLY FUNCTIONAL page — NOT a placeholder"
6. Schema tasks generate /data/<entity>.js + /hooks/use<Entity>.js
7. Backend tasks generate contexts (Cart, Auth, Toast) + API hooks
8. Frontend tasks IMPORT from hooks/data — NEVER hardcode mock data

## PATTERN FOR TYPICAL APPS
1. Schema tasks: /data/ files with mock data + /hooks/ for CRUD (taskType: "schema")
2. Backend tasks: Contexts + API integration (taskType: "backend")
3. Layout task: /layout/AppLayout.jsx + /layout/Sidebar.jsx (taskType: "frontend")
4. Page tasks: Feature pages importing from hooks/data (taskType: "frontend")

## ABSOLUTE BANS
❌ "Coming Soon" / placeholder tasks
❌ Tasks that produce stub/empty components
❌ Every nav item MUST have a fully implemented page

## CONTEXT
Tech Stack: ${techStack || "react"}
${existingFiles ? `Existing files: ${existingFiles.join(", ")}` : "New project"}
${schemas?.length ? `DB schemas: ${JSON.stringify(schemas)}` : ""}
${knowledge?.length ? `Knowledge:\n${knowledge.join("\n")}` : ""}

Use the create_plan tool to return your structured plan.`;

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
          { role: "user", content: prompt.length > 30000 ? prompt.slice(0, 30000) + "\n\n[TRUNCATED — focus on the key entities, roles, and pages listed above]" : prompt },
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
                  summary: { type: "string", description: "1-2 sentence plan summary" },
                  overallComplexity: { type: "string", enum: ["trivial", "simple", "medium", "complex"] },
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
                        buildPrompt: { type: "string", description: "Exact prompt for build agent — must be specific and complete" },
                        complexity: { type: "string", enum: ["trivial", "simple", "medium", "complex"] },
                        taskType: { type: "string", enum: ["schema", "backend", "frontend"] },
                        dependsOn: { type: "array", items: { type: "string" } },
                        filesAffected: { type: "array", items: { type: "string" } },
                        needsUserInput: { type: "boolean" },
                        userQuestion: { type: "string" },
                        category: { type: "string", enum: ["ui", "backend", "auth", "data", "styling", "testing", "config"] },
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

    // Fallback: check if content has JSON directly
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
  } catch (e) {
    console.error("plan-agent error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Failed to generate plan" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

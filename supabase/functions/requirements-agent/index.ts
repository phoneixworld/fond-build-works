import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, matchedTemplate, existingSchemas } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // If a template was matched client-side, use AI to customize it
    // If no template, use AI to extract a domain model from scratch
    const systemPrompt = matchedTemplate
      ? `You are a Requirements Agent. A domain template has been pre-matched for this request. Your job is to CUSTOMIZE the template based on the user's specific needs.

## PRE-MATCHED TEMPLATE
${JSON.stringify(matchedTemplate, null, 2)}

## YOUR TASK
1. Review the user's prompt carefully
2. Add any entities/fields the user specifically mentioned that are missing
3. Remove entities that don't fit the user's request
4. Adjust field types, options, and relationships as needed
5. Update suggested pages and navigation to match
6. Generate realistic seed data counts

## RULES
- Keep the template's core structure but customize for the user's specific domain
- If the user mentions specific features (e.g., "with reviews and wishlists"), add those entities
- Don't remove core entities unless the user explicitly doesn't want them
- Maintain proper relationships between entities
${existingSchemas?.length ? `\n## EXISTING SCHEMAS (don't duplicate):\n${JSON.stringify(existingSchemas)}` : ""}`
      : `You are a Requirements Agent. Your job is to analyze a user's request and extract a structured domain model.

## YOUR TASK
Analyze the user's prompt and generate a complete domain model with:
1. Entities with fields, types, and relationships
2. API endpoints for each entity
3. Suggested pages and navigation
4. Whether auth is required

## RULES
- Generate 3-8 entities (not too few, not too many)
- Each entity needs realistic fields with proper types
- Include relationships between entities
- Suggest seed data counts for mock data generation
- Think about what pages the app needs
${existingSchemas?.length ? `\n## EXISTING SCHEMAS (don't duplicate):\n${JSON.stringify(existingSchemas)}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 4096,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_domain_model",
              description: "Create a structured domain model for the application",
              parameters: {
                type: "object",
                properties: {
                  templateName: { type: "string", description: "Name of the application type" },
                  requiresAuth: { type: "boolean", description: "Whether the app needs user authentication" },
                  entities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        pluralName: { type: "string" },
                        seedCount: { type: "number", description: "Number of mock records to generate" },
                        fields: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              type: { type: "string", enum: ["text", "number", "boolean", "datetime", "email", "url", "textarea", "select", "json"] },
                              required: { type: "boolean" },
                              default: { description: "Default value" },
                              options: { type: "array", items: { type: "string" }, description: "Options for select type" },
                            },
                            required: ["name", "type", "required"],
                          },
                        },
                        relationships: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              target: { type: "string" },
                              type: { type: "string", enum: ["hasMany", "belongsTo", "hasOne", "manyToMany"] },
                              foreignKey: { type: "string" },
                            },
                            required: ["target", "type"],
                          },
                        },
                      },
                      required: ["name", "pluralName", "fields", "relationships"],
                    },
                  },
                  apiEndpoints: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] },
                        path: { type: "string" },
                        entity: { type: "string" },
                        action: { type: "string", enum: ["list", "get", "create", "update", "delete", "search"] },
                        description: { type: "string" },
                      },
                      required: ["method", "path", "entity", "action", "description"],
                    },
                  },
                  suggestedPages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        path: { type: "string" },
                        title: { type: "string" },
                        entity: { type: "string" },
                        type: { type: "string", enum: ["list", "detail", "form", "dashboard", "static"] },
                      },
                      required: ["path", "title", "type"],
                    },
                  },
                  suggestedNavItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        path: { type: "string" },
                        icon: { type: "string" },
                      },
                      required: ["label", "path", "icon"],
                    },
                  },
                },
                required: ["templateName", "requiresAuth", "entities", "apiEndpoints", "suggestedPages", "suggestedNavItems"],
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_domain_model" } },
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
      console.error("requirements-agent error:", response.status, t);
      throw new Error("Requirements agent error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const domainModel = JSON.parse(toolCall.function.arguments);
      domainModel.templateId = matchedTemplate?.templateId || "custom";
      return new Response(JSON.stringify(domainModel), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No domain model generated");
  } catch (e) {
    console.error("requirements-agent error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Failed to extract domain model" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { query, files, mode } = await req.json();

    if (!files || Object.keys(files).length === 0) {
      return new Response(JSON.stringify({ results: [], summary: "No files to search" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a code index from files
    const codeIndex = Object.entries(files)
      .map(([path, code]) => {
        const lines = (code as string).split("\n");
        return `--- ${path} (${lines.length} lines)\n${code}`;
      })
      .join("\n\n");

    const searchMode = mode || "search"; // "search" | "explain" | "dependencies" | "refactor"

    const modePrompts: Record<string, string> = {
      search: `Find code relevant to the query. Return matching files, functions, components, and line numbers.`,
      explain: `Explain how the codebase implements the queried functionality. Trace the data flow and component hierarchy.`,
      dependencies: `Analyze dependencies: what imports what, which components depend on which, and identify the dependency graph for the queried feature.`,
      refactor: `Identify refactoring opportunities related to the query. Find code duplication, overly complex functions, and suggest improvements.`,
    };

    const systemPrompt = `You are a code intelligence engine for a React codebase. ${modePrompts[searchMode] || modePrompts.search}

Use the search_results tool to return structured results.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Query: "${query}"\n\nCodebase:\n${codeIndex}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "search_results",
              description: "Return semantic search results from the codebase",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Brief summary of findings" },
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        file: { type: "string" },
                        relevance: { type: "number", minimum: 0, maximum: 1 },
                        matchType: { type: "string", enum: ["component", "function", "hook", "type", "style", "config", "import"] },
                        name: { type: "string", description: "Name of the matched symbol" },
                        lineStart: { type: "number" },
                        lineEnd: { type: "number" },
                        snippet: { type: "string", description: "Relevant code snippet" },
                        explanation: { type: "string", description: "Why this is relevant" },
                      },
                      required: ["file", "relevance", "matchType", "name", "explanation"],
                    },
                  },
                  relatedFiles: {
                    type: "array",
                    items: { type: "string" },
                    description: "Files related to the query but not direct matches",
                  },
                  suggestedActions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Suggested follow-up actions or queries",
                  },
                },
                required: ["summary", "results"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "search_results" } },
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
      throw new Error("Semantic search failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const results = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No search results generated");
  } catch (e) {
    console.error("semantic-search error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Search failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

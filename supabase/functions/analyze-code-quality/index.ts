import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { files, techStack, governanceRules } = await req.json();

    if (!files || Object.keys(files).length === 0) {
      return new Response(JSON.stringify({ issues: [], score: 100, summary: "No files to analyze" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const codeContext = Object.entries(files)
      .map(([path, code]) => `--- ${path}\n${code}`)
      .join("\n\n");

    const rulesContext = governanceRules?.length
      ? `\n\nCustom governance rules to enforce:\n${governanceRules.map((r: any) => `- [${r.severity}] ${r.name}: ${r.description}`).join("\n")}`
      : "";

    const systemPrompt = `You are a senior code reviewer analyzing React/JSX code for quality issues. Review the code and identify problems across these categories:

## CATEGORIES
1. **architecture** — Component structure, prop drilling, state management anti-patterns
2. **performance** — Unnecessary re-renders, missing memoization, expensive computations in render
3. **accessibility** — Missing aria labels, poor semantic HTML, keyboard navigation gaps
4. **security** — XSS vulnerabilities, unsafe innerHTML, exposed secrets
5. **maintainability** — Code duplication, overly complex functions, missing error boundaries
6. **bestPractices** — React anti-patterns, Tailwind misuse, improper hooks usage

## SEVERITY LEVELS
- "error" — Must fix, will cause bugs or security issues
- "warning" — Should fix, code smell or performance concern
- "info" — Nice to have, style or best practice suggestion

## SCORING
Score from 0-100 based on overall code quality. Deduct:
- 15 points per error
- 5 points per warning
- 1 point per info
Minimum score is 0.

Tech stack: ${techStack || "react"}
${rulesContext}

Use the report_quality tool to return your analysis.`;

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
          { role: "user", content: `Review this code:\n\n${codeContext}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_quality",
              description: "Report code quality analysis results",
              parameters: {
                type: "object",
                properties: {
                  score: { type: "number", minimum: 0, maximum: 100 },
                  summary: { type: "string", description: "1-2 sentence summary" },
                  issues: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        category: { type: "string", enum: ["architecture", "performance", "accessibility", "security", "maintainability", "bestPractices"] },
                        severity: { type: "string", enum: ["error", "warning", "info"] },
                        file: { type: "string" },
                        line: { type: "number" },
                        message: { type: "string" },
                        suggestion: { type: "string" },
                        autoFixable: { type: "boolean" },
                      },
                      required: ["id", "category", "severity", "file", "message", "suggestion"],
                    },
                  },
                  metrics: {
                    type: "object",
                    properties: {
                      totalFiles: { type: "number" },
                      totalLines: { type: "number" },
                      componentCount: { type: "number" },
                      avgComplexity: { type: "string", enum: ["low", "medium", "high"] },
                      hasErrorBoundary: { type: "boolean" },
                      hasAccessibility: { type: "boolean" },
                      hasLoadingStates: { type: "boolean" },
                      hasErrorHandling: { type: "boolean" },
                    },
                    required: ["totalFiles", "totalLines", "componentCount", "avgComplexity"],
                  },
                },
                required: ["score", "summary", "issues", "metrics"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_quality" } },
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
      throw new Error("Code analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const report = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(report), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No analysis generated");
  } catch (e) {
    console.error("analyze-code-quality error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Analysis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

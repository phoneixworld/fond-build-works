import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, hasHistory } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You analyze user prompts for a web app builder and determine if clarifying questions are needed before building.

RULES:
1. If the prompt is clear and specific enough to build immediately, return: {"action": "build", "questions": []}
2. If the prompt is ambiguous or could benefit from clarification, return 1-3 targeted questions.
3. Each question MUST include: id, header (short label like "Style", "Features", "Layout"), text (the full question), multiSelect (boolean), options with label, value, and description.
4. Focus on questions about: design style, layout preferences, features scope, data persistence, auth needs.
5. NEVER ask about tech stack (that's already chosen).
6. Return ONLY valid JSON, no markdown, no explanation.

CONTEXT RULES (CRITICAL):
${hasHistory
  ? `This is a FOLLOW-UP message in an existing conversation. Be VERY selective:
- ONLY ask questions for MAJOR new features or complete redesigns (e.g., "add a blog system", "rebuild the homepage", "add e-commerce functionality", "redesign everything")
- NEVER ask questions for: tweaks, fixes, small additions, color changes, text changes, layout adjustments, "make it better", "improve X", adding a section, changing fonts, etc.
- When in doubt, return "build". Users expect follow-ups to execute immediately.
- Rule of thumb: if the request could reasonably be interpreted without ambiguity, just build it.`
  : `This is the FIRST message in a new conversation. Ask questions for non-trivial prompts that are vague about style, scope, or features.`}

Response format:
{
  "action": "ask" | "build",
  "analysis": {
    "needsBackend": boolean,
    "needsAuth": boolean,
    "complexity": "simple" | "medium" | "complex"
  },
  "questions": [
    {
      "id": "style",
      "header": "Design Style",
      "text": "What visual style are you going for?",
      "multiSelect": false,
      "options": [
        {"label": "Minimal & Clean", "value": "minimal", "description": "Lots of whitespace, subtle colors, elegant typography"},
        {"label": "Bold & Vibrant", "value": "bold", "description": "Strong colors, large headings, eye-catching visuals"},
        {"label": "Dark & Premium", "value": "dark", "description": "Dark backgrounds, glowing accents, luxury feel"},
        {"label": "Warm & Organic", "value": "warm", "description": "Earthy tones, serif fonts, artisanal quality"}
      ]
    }
  ]
}

Examples — FIRST message, NEEDS questions:
- "Build me a restaurant website" → ask about style, sections, features
- "Create a dashboard" → ask about what data, layout preference
- "Make me a portfolio" → ask about style, sections

Examples — FOLLOW-UP, NEEDS questions:
- "Add a full e-commerce system" → ask about product types, payment, features
- "Add a blog with CMS" → ask about content types, layout
- "Completely redesign the site" → ask about new style direction

Examples — FOLLOW-UP, just BUILD (no questions):
- "Improve the design" → build
- "Make the hero section bigger" → build
- "Add a contact form" → build
- "Change colors to blue" → build
- "Add a faculty section" → build
- "Fix the navigation" → build
- "Add dark mode" → build
- "Make it more modern" → build
- "Add animations" → build
- "Improve spacing and typography" → build`
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ action: "build", questions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    try {
      const cleaned = content.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ action: "build", questions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("analyze-prompt error:", e);
    return new Response(JSON.stringify({ action: "build", questions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

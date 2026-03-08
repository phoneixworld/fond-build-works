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
7. ${hasHistory ? "This is a follow-up in an existing conversation. Only ask questions if the request represents a MAJOR new feature or redesign (e.g. 'improve the design', 'add a CMS', 'rebuild the layout'). For small changes like 'fix button', 'change color', always return build." : "This is the first message. Ask questions for any non-trivial prompt."}

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
    },
    {
      "id": "features",
      "header": "Features",
      "text": "Which features should be included?",
      "multiSelect": true,
      "options": [
        {"label": "Contact Form", "value": "contact", "description": "Let visitors send you messages"},
        {"label": "Photo Gallery", "value": "gallery", "description": "Showcase images in a grid or carousel"},
        {"label": "Online Ordering", "value": "ordering", "description": "Let customers place orders online"}
      ]
    }
  ]
}

Examples that NEED questions:
- "Build me a restaurant website" → ask about style, sections, features
- "Improve the overall design" → ask about style direction, what to prioritize
- "Create a dashboard" → ask about what data, layout preference
- "Add a CMS" → ask about what content types, editing needs

Examples that DON'T need questions (build immediately):
- "Make the button blue"
- "Fix the navigation links"
- "Add a footer with contact info"
- "Build a landing page for a coffee shop with menu, about, and contact sections" (already detailed)`
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

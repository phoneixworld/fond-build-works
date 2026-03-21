import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, hasHistory } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", // Upgraded from flash-lite for better reasoning
        temperature: 0.1, // Low temperature for consistent classification
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

FEW-SHOT EXAMPLES:

Example 1 (FIRST message, needs questions):
User: "Build me a restaurant website"
Response: {
  "action": "ask",
  "analysis": {"needsBackend": false, "needsAuth": false, "complexity": "medium"},
  "questions": [
    {
      "id": "style",
      "header": "Design Style",
      "text": "What visual style would you like for the restaurant website?",
      "multiSelect": false,
      "options": [
        {"label": "Elegant Fine Dining", "value": "elegant", "description": "Dark tones, serif fonts, premium feel"},
        {"label": "Modern Casual", "value": "modern", "description": "Bright colors, sans-serif, friendly atmosphere"},
        {"label": "Traditional Rustic", "value": "rustic", "description": "Warm colors, handwritten fonts, cozy feel"}
      ]
    },
    {
      "id": "features",
      "header": "Key Features",
      "text": "What features should the website include?",
      "multiSelect": true,
      "options": [
        {"label": "Menu Display", "value": "menu", "description": "Showcase dishes with photos and prices"},
        {"label": "Online Reservations", "value": "reservations", "description": "Let customers book tables online"},
        {"label": "Location & Hours", "value": "location", "description": "Map, address, opening hours"}
      ]
    }
  ]
}

Example 2 (FIRST message, just build):
User: "Create a minimal landing page with hero section and contact form"
Response: {
  "action": "build",
  "analysis": {"needsBackend": false, "needsAuth": false, "complexity": "simple"},
  "questions": []
}

Example 3 (FOLLOW-UP, major feature needs questions):
User: "Add a full e-commerce system with product management"
Response: {
  "action": "ask",
  "analysis": {"needsBackend": true, "needsAuth": true, "complexity": "complex"},
  "questions": [
    {
      "id": "payment",
      "header": "Payment",
      "text": "How should customers pay?",
      "multiSelect": false,
      "options": [
        {"label": "Mock Checkout", "value": "mock", "description": "Demo flow without real payments"},
        {"label": "Stripe Integration", "value": "stripe", "description": "Accept real credit card payments"}
      ]
    }
  ]
}

Example 4 (FOLLOW-UP, just build):
User: "Make the hero section bigger and add animations"
Response: {
  "action": "build",
  "analysis": {"needsBackend": false, "needsAuth": false, "complexity": "simple"},
  "questions": []
}

Example 5 (FOLLOW-UP, just build):
User: "Add a faculty section with team member cards"
Response: {
  "action": "build",
  "analysis": {"needsBackend": false, "needsAuth": false, "complexity": "simple"},
  "questions": []
}

Response format:
{
  "action": "ask" | "build",
  "analysis": {
    "needsBackend": boolean,
    "needsAuth": boolean,
    "complexity": "simple" | "medium" | "complex"
  },
  "questions": [...]
}`
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

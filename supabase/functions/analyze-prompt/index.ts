import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt } = await req.json();
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
3. Each question should have 2-4 options the user can pick from.
4. Focus on questions about: data persistence needs, user auth needs, design style, scope clarification.
5. NEVER ask about tech stack (that's already chosen).
6. Return ONLY valid JSON, no markdown, no explanation.

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
      "id": "q1",
      "text": "Should users be able to save their data between sessions?",
      "options": [
        {"label": "Yes, with user accounts", "value": "auth_persist"},
        {"label": "Yes, without accounts", "value": "persist_only"},
        {"label": "No, just a static page", "value": "static"}
      ]
    }
  ]
}

Examples of prompts that need questions:
- "Build me a todo app" → ask about persistence, auth, design
- "Create a dashboard" → ask about what data, real-time needs
- "Make a website for my business" → ask about sections needed, contact form

Examples of prompts that DON'T need questions (build immediately):
- "Make the button blue" (modification)
- "Fix the navigation links" (bug fix)
- "Add a footer with contact info" (specific addition)
- "Build a landing page for a coffee shop with menu, about, and contact sections" (already detailed)
- Any prompt that's a follow-up in an existing conversation`
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, hasHistory, hasExistingCode } = await req.json();
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
            content: `You are an intent classifier for an AI web app builder. Classify user messages into one of three intents.

INTENTS:
1. "chat" — The user is asking a question, having a conversation, or exploring ideas. They do NOT want code generated yet.
2. "build" — The user wants code generated or modified. This is a direct command to create/change something.
3. "clarify" — The prompt is ambiguous and needs clarifying questions before building.

CLASSIFICATION RULES:

**CHAT** — Return this when:
- Message contains a question mark AND is asking about capabilities, feasibility, or seeking information
- Starts with: "can we", "could you", "should I", "is it possible", "have you", "did you", "what if", "how does"
- Is a conversational reply: "thanks", "ok", "I see", "tell me more"
- Is asking for suggestions or options without a clear build command
- Is discussing architecture, approach, or planning

**BUILD** — Return this when:
- Direct imperative command: "Build a...", "Create a...", "Add a...", "Make the...", "Change the...", "Fix the...", "Update the..."
- Affirmative response to a previous suggestion: "Yes", "Go ahead", "Do it", "Yes, build it", "Sounds good, go ahead"
- Short modification request: "Make it darker", "Add animations", "Improve the design"
- Describes what they want built without asking if it's possible
${hasHistory ? '- Follow-up modifications: "change colors", "add a section", "make it responsive"' : ''}

**CLARIFY** — Return this when:
${hasHistory
  ? `- ONLY for major new features: "add e-commerce", "rebuild the site", "add a blog system"
- NEVER for: tweaks, fixes, minor additions, style changes
- When in doubt between clarify and build, choose BUILD`
  : `- First message that is vague about style, scope, or features
- "Build me a website" (what kind? what style?)
- "Create a dashboard" (what data? what layout?)`}

RESPONSE FORMAT — Return ONLY valid JSON:
{
  "intent": "chat" | "build" | "clarify",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence why",
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
        {"label": "Minimal & Clean", "value": "minimal", "description": "Lots of whitespace, subtle colors"},
        {"label": "Bold & Vibrant", "value": "bold", "description": "Strong colors, large headings"}
      ]
    }
  ]
}

Only include "questions" array when intent is "clarify". Keep it empty otherwise.
Return ONLY the JSON object. No markdown, no explanation.`
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      // Default to build on error
      return new Response(JSON.stringify({ intent: "build", confidence: 0.5, questions: [], analysis: { needsBackend: false, needsAuth: false, complexity: "medium" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    try {
      const cleaned = content.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      // Ensure valid intent
      if (!["chat", "build", "clarify"].includes(parsed.intent)) {
        parsed.intent = "build";
      }
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ intent: "build", confidence: 0.5, questions: [], analysis: { needsBackend: false, needsAuth: false, complexity: "medium" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("classify-intent error:", e);
    return new Response(JSON.stringify({ intent: "build", confidence: 0.5, questions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

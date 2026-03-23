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
        max_tokens: 200,
        temperature: 0.7,
        messages: [
          { role: "system", content: `You generate short, catchy project names from user descriptions.
Rules:
- Return ONLY a JSON object: {"name": "...", "emoji": "..."}
- Name: 2-4 words, Title Case, max 30 chars. Be creative but descriptive.
- Emoji: single emoji that represents the project theme.
- Examples: {"name": "Task Flow Pro", "emoji": "✅"}, {"name": "Recipe Vault", "emoji": "🍳"}, {"name": "Budget Tracker", "emoji": "💰"}
- No quotes around the JSON, no markdown, no explanation.` },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const fallbackName = prompt.slice(0, 30).replace(/\s+\S*$/, "") || "My Project";
      return new Response(JSON.stringify({ name: fallbackName, emoji: "🚀" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    
    try {
      // Try to parse the AI response as JSON
      const cleaned = content.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const name = (parsed.name || "").slice(0, 40) || prompt.slice(0, 30);
      const emoji = parsed.emoji || "🚀";
      return new Response(JSON.stringify({ name, emoji }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      // If parsing fails, use the raw text as name
      const name = content.slice(0, 40) || prompt.slice(0, 30);
      return new Response(JSON.stringify({ name, emoji: "🚀" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("project-name error:", e);
    return new Response(JSON.stringify({ name: "My Project", emoji: "🚀" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

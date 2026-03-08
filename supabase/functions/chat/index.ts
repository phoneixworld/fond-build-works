import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an AI app builder inside an IDE, similar to Lovable. When a user asks you to build something, you MUST respond in this exact format:

1. First, write a SHORT conversational message (1-3 sentences) describing what you built. This is the chat message the user sees.

2. Then, write the FULL HTML page inside a special code fence:

\`\`\`html-preview
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body>
  <!-- Your beautiful HTML here -->
</body>
</html>
\`\`\`

RULES:
- ALWAYS include the html-preview code fence when building something. This is what renders in the preview.
- The HTML must be a COMPLETE standalone page with Tailwind CDN.
- Make it BEAUTIFUL — use gradients, shadows, modern typography, proper spacing.
- Use placeholder images from https://images.unsplash.com/ with relevant search terms.
- Include hover effects, transitions, and interactivity using inline onclick or style changes.
- The chat message should be brief and enthusiastic. Never show code to the user outside the html-preview fence.
- If the user is just chatting (not asking to build), respond conversationally WITHOUT the html-preview fence.
- When the user asks to modify the existing page, generate the FULL updated HTML page.
- Use lucide icons via CDN: <script src="https://unpkg.com/lucide@latest"></script> and <i data-lucide="icon-name"></i> with <script>lucide.createIcons()</script> at the end of body.`,
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { image, mood, description } = await req.json();

    const userContent: any[] = [
      {
        type: "text",
        text: `You are an expert brand designer and design system architect. Analyze the provided ${image ? "image (logo, screenshot, or mood board)" : "description"} and generate a COMPLETE design system.

${mood ? `Mood/style direction: ${mood}` : ""}
${description ? `Additional context: ${description}` : ""}

Return a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "brandName": "Suggested brand name based on the visual",
  "tagline": "A short brand tagline",
  "personality": ["3-5 personality traits like 'bold', 'minimal', 'playful'"],
  "colors": {
    "primary": { "hsl": "H S% L%", "hex": "#XXXXXX", "name": "Color name" },
    "secondary": { "hsl": "H S% L%", "hex": "#XXXXXX", "name": "Color name" },
    "accent": { "hsl": "H S% L%", "hex": "#XXXXXX", "name": "Color name" },
    "background": { "hsl": "H S% L%", "hex": "#XXXXXX", "name": "Color name" },
    "foreground": { "hsl": "H S% L%", "hex": "#XXXXXX", "name": "Color name" },
    "muted": { "hsl": "H S% L%", "hex": "#XXXXXX", "name": "Color name" },
    "destructive": { "hsl": "H S% L%", "hex": "#XXXXXX", "name": "Color name" }
  },
  "typography": {
    "headingFont": "Google Font name for headings",
    "bodyFont": "Google Font name for body text",
    "monoFont": "Monospace font name",
    "scale": "compact | balanced | spacious"
  },
  "style": {
    "borderRadius": "none | sm | md | lg | xl | 2xl | full",
    "shadowStyle": "none | subtle | medium | dramatic | glow",
    "density": "compact | comfortable | spacious",
    "mood": "minimal | corporate | playful | bold | dark | elegant"
  },
  "cssVariables": "A complete CSS :root block with all design tokens as CSS custom properties using HSL values (just the values like '210 100% 56%' without hsl() wrapper), ready to paste into index.css"
}

IMPORTANT: 
- Extract actual colors from the image if provided
- The cssVariables should be a complete :root block matching the Tailwind/shadcn format
- HSL values in the colors object should be "H S% L%" format
- HSL values in cssVariables should be "H S L" format (space-separated, no % on H) for Tailwind compatibility
- Choose fonts that match the visual aesthetic
- Be creative and specific with color names`
      }
    ];

    if (image) {
      userContent.push({
        type: "image_url",
        image_url: { url: image }
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    
    // Strip markdown code fences if present
    content = content.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    
    const brandKit = JSON.parse(content);

    return new Response(JSON.stringify(brandKit), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-brand-kit error:", e);
    return new Response(JSON.stringify({ error: e.message || "Failed to generate brand kit" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

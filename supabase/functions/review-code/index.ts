import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REVIEW_PROMPT = `You are an expert code reviewer for single-page HTML apps. Review the provided HTML and return a FIXED version.

CHECK AND FIX:
1. **Broken navigation**: Every <a href="#section"> must have a matching <section id="section"> or <div id="section">. Add missing IDs or fix hrefs.
2. **JavaScript errors**: All querySelector/getElementById calls must use optional chaining or null checks. Fix any unsafe DOM access.
3. **Missing images**: Replace any external image URLs (unsplash, pexels, etc.) with CSS gradient placeholders or inline SVGs.
4. **Mobile menu**: Ensure mobile menu toggle works — button exists, menu element exists, toggle logic is null-safe.
5. **Accessibility**: Ensure all images have alt text, all form inputs have labels, lang="en" on <html>.
6. **Responsive**: Ensure key layouts use responsive classes (grid-cols-1 md:grid-cols-2, etc.).
7. **Empty states**: If the app fetches data, ensure there's a loading state and empty state.
8. **Console errors**: Look for common patterns that cause runtime errors — undefined variables, missing elements, incorrect event listeners.

RULES:
- Return ONLY the fixed HTML inside a \`\`\`html-preview fence. No explanation needed.
- If the code is already good, return it unchanged.
- Do NOT change the design, colors, content, or functionality — only fix bugs and issues.
- Keep ALL existing features intact.
- Be conservative: only fix clear bugs, don't refactor working code.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { html } = await req.json();
    if (!html || html.length < 50) {
      return new Response(JSON.stringify({ html, issues: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Use a fast model for review
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: REVIEW_PROMPT },
          { role: "user", content: `Review and fix this HTML:\n\n\`\`\`html\n${html}\n\`\`\`` },
        ],
        temperature: 0.2,
        max_tokens: 32000,
      }),
    });

    if (!response.ok) {
      console.error("Review API error:", response.status);
      return new Response(JSON.stringify({ html, issues: ["Review API unavailable"] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Extract HTML from the response
    let fixedHtml = html;
    const fenceStart = content.indexOf("```html");
    if (fenceStart !== -1) {
      const codeStart = content.indexOf("\n", fenceStart) + 1;
      const fenceEnd = content.indexOf("```", codeStart);
      fixedHtml = fenceEnd !== -1 ? content.slice(codeStart, fenceEnd).trim() : content.slice(codeStart).trim();
    }

    // Basic sanity check — if the review somehow broke things, keep original
    if (fixedHtml.length < html.length * 0.5 || !fixedHtml.includes("<html") && !fixedHtml.includes("<body") && !fixedHtml.includes("<div")) {
      fixedHtml = html;
    }

    return new Response(JSON.stringify({ html: fixedHtml, reviewed: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("review-code error:", e);
    return new Response(JSON.stringify({ html: "", error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

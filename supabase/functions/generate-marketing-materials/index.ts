import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASSET_TYPES: Record<string, { prompt: string; filename: string }> = {
  "social-banner": {
    prompt:
      "Create a professional social media banner (landscape 1200x630) for the brand. Include the logo prominently, use the brand colors, and add the tagline. Modern, clean layout suitable for Facebook/LinkedIn cover.",
    filename: "social-banner.png",
  },
  "og-image": {
    prompt:
      "Create an Open Graph share image (1200x630). Feature the brand logo centered with tagline below it on a clean background using brand colors. Professional and eye-catching for link previews.",
    filename: "og-image.png",
  },
  "business-card": {
    prompt:
      "Design a modern business card (landscape). Front side: logo centered with brand colors. Include placeholder text for name, title, email, phone. Clean and professional typography.",
    filename: "business-card.png",
  },
  "email-signature": {
    prompt:
      "Create a professional email signature banner (600x150). Include the logo on the left, brand name, and placeholder for name/title/contact info on the right. Use brand colors subtly.",
    filename: "email-signature.png",
  },
  "favicon": {
    prompt:
      "Create a simple, recognizable favicon/app icon (square, 512x512) based on the logo. Simplify the design to work at very small sizes. Use the primary brand color as background with a clean white icon/letter mark.",
    filename: "favicon.png",
  },
  "instagram-post": {
    prompt:
      "Create a branded Instagram post template (square 1080x1080). Feature the logo, brand colors, and a modern layout with space for text. Professional and visually striking.",
    filename: "instagram-post.png",
  },
  "letterhead": {
    prompt:
      "Design a professional letterhead/document header (landscape banner). Logo in top-left, brand name, subtle brand color accents. Clean and corporate-ready with space for content below.",
    filename: "letterhead.png",
  },
  "twitter-header": {
    prompt:
      "Create a Twitter/X header banner (1500x500). Feature the brand logo and tagline with brand colors. Wide format, visually balanced, modern aesthetic.",
    filename: "twitter-header.png",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { assetType, logoImage, brandKit, projectId } = await req.json();

    if (!assetType || !ASSET_TYPES[assetType]) {
      throw new Error(`Invalid asset type: ${assetType}`);
    }

    const asset = ASSET_TYPES[assetType];

    // Build the prompt with brand context
    const brandContext = brandKit
      ? `\nBrand name: ${brandKit.brandName}\nTagline: ${brandKit.tagline}\nPrimary color: ${brandKit.colors?.primary?.hex || "#6366f1"}\nSecondary color: ${brandKit.colors?.secondary?.hex || "#8b5cf6"}\nAccent color: ${brandKit.colors?.accent?.hex || "#f59e0b"}\nBackground: ${brandKit.colors?.background?.hex || "#ffffff"}\nStyle mood: ${brandKit.style?.mood || "modern"}\nBorder radius: ${brandKit.style?.borderRadius || "md"}`
      : "";

    const fullPrompt = `${asset.prompt}${brandContext}\n\nIMPORTANT: Generate a high-quality, production-ready marketing asset. Use the exact brand colors specified. Make it look professional and polished.`;

    // Build messages with optional logo image
    const userContent: any[] = [{ type: "text", text: fullPrompt }];

    if (logoImage) {
      userContent.push({
        type: "image_url",
        image_url: { url: logoImage },
      });
    }

    console.log(`Generating ${assetType} for project ${projectId || "unknown"}`);

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: userContent }],
          modalities: ["image", "text"],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again in a moment.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI usage limit reached. Please add credits.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI generation failed");
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    // Extract the generated image
    const imageData = message?.images?.[0]?.image_url?.url;
    if (!imageData) {
      throw new Error("No image was generated. Try again with a different prompt.");
    }

    // If projectId provided, upload to storage
    let storedUrl: string | null = null;
    if (projectId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Convert base64 to bytes
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const bytes = Uint8Array.from(atob(base64Data), (c) =>
          c.charCodeAt(0)
        );

        const filePath = `${projectId}/marketing/${asset.filename}`;
        const { error: uploadError } = await supabase.storage
          .from("app-assets")
          .upload(filePath, bytes, {
            contentType: "image/png",
            upsert: true,
          });

        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("app-assets").getPublicUrl(filePath);
          storedUrl = publicUrl;
        } else {
          console.error("Upload error:", uploadError);
        }
      } catch (uploadErr) {
        console.error("Storage upload failed:", uploadErr);
      }
    }

    return new Response(
      JSON.stringify({
        assetType,
        imageData,
        storedUrl,
        filename: asset.filename,
        description: message?.content || "",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("generate-marketing-materials error:", e);
    return new Response(
      JSON.stringify({
        error: e.message || "Failed to generate marketing material",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CREDIT_COSTS: Record<string, number> = {
  ai_prompt: 1,
  build_run: 5,
  publish_deploy: 3,
  marketing_generation: 2,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { operation, credits, project_id } = await req.json();
    const cost = credits || CREDIT_COSTS[operation] || 1;

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get current subscription
    const { data: sub, error: subErr } = await adminClient
      .from("user_subscriptions")
      .select("*, subscription_tiers(*)")
      .eq("user_id", user.id)
      .single();

    if (subErr || !sub) {
      // Auto-create free subscription if missing
      const { error: insertErr } = await adminClient
        .from("user_subscriptions")
        .insert({ user_id: user.id, tier_id: "free", credits_remaining: 50 });

      if (insertErr) {
        return new Response(JSON.stringify({ error: "Failed to create subscription" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Subscription created, please retry" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check unlimited credits
    const tierData = sub.subscription_tiers as any;
    const isUnlimited = tierData?.credits_per_month === -1;

    if (!isUnlimited && sub.credits_remaining < cost) {
      return new Response(JSON.stringify({
        error: "Insufficient credits",
        credits_remaining: sub.credits_remaining,
        cost,
        tier: sub.tier_id,
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits & log usage
    const updates: any = {
      credits_used: sub.credits_used + cost,
      updated_at: new Date().toISOString(),
    };
    if (!isUnlimited) {
      updates.credits_remaining = sub.credits_remaining - cost;
    }

    const [updateRes, logRes] = await Promise.all([
      adminClient.from("user_subscriptions").update(updates).eq("id", sub.id),
      adminClient.from("credit_usage").insert({
        user_id: user.id,
        operation,
        credits_consumed: cost,
        project_id: project_id || null,
        metadata: { tier: sub.tier_id },
      }),
    ]);

    if (updateRes.error) {
      return new Response(JSON.stringify({ error: "Failed to update credits" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      credits_remaining: isUnlimited ? -1 : sub.credits_remaining - cost,
      credits_used: sub.credits_used + cost,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

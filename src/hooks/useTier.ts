import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type TierId = "free" | "pro" | "enterprise";

export interface TierConfig {
  id: string;
  name: string;
  price_monthly: number;
  credits_per_month: number;
  max_projects: number;
  max_team_members: number;
  max_custom_domains: number;
  features: string[];
}

export interface UserSubscription {
  id: string;
  tier_id: TierId;
  status: string;
  credits_remaining: number;
  credits_used: number;
  current_period_end: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export type GatedFeature =
  | "cicd_pipeline"
  | "quality_gates"
  | "environment_promotion"
  | "team_collaboration"
  | "custom_domains"
  | "white_label"
  | "priority_support"
  | "sla_guarantee"
  | "dedicated_support";

export type CreditOperation = "ai_prompt" | "build_run" | "publish_deploy" | "marketing_generation";

const CREDIT_COSTS: Record<CreditOperation, number> = {
  ai_prompt: 1,
  build_run: 5,
  publish_deploy: 3,
  marketing_generation: 2,
};

export function useTier() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const [subRes, tierRes] = await Promise.all([
      supabase.from("user_subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("subscription_tiers").select("*").eq("is_active", true).order("price_monthly"),
    ]);

    if (subRes.data) {
      setSubscription({
        ...subRes.data,
        tier_id: subRes.data.tier_id as TierId,
        features: undefined,
      } as unknown as UserSubscription);
    }

    if (tierRes.data) {
      setTiers(tierRes.data.map((t: any) => ({
        ...t,
        features: Array.isArray(t.features) ? t.features : [],
      })));
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const currentTier = useMemo(() => {
    const id = subscription?.tier_id || "free";
    return tiers.find(t => t.id === id) || null;
  }, [subscription, tiers]);

  const hasFeature = useCallback((feature: GatedFeature): boolean => {
    if (!currentTier) return false;
    return currentTier.features.includes(feature);
  }, [currentTier]);

  const hasCredits = useCallback((operation: CreditOperation): boolean => {
    if (!subscription) return false;
    if (currentTier?.credits_per_month === -1) return true; // unlimited
    return subscription.credits_remaining >= CREDIT_COSTS[operation];
  }, [subscription, currentTier]);

  const getCreditCost = useCallback((operation: CreditOperation) => CREDIT_COSTS[operation], []);

  const consumeCredits = useCallback(async (operation: CreditOperation, projectId?: string) => {
    if (!user) return { success: false, error: "Not authenticated" };
    const cost = CREDIT_COSTS[operation];

    try {
      const res = await supabase.functions.invoke("consume-credits", {
        body: { operation, credits: cost, project_id: projectId },
      });

      if (res.error) return { success: false, error: res.error.message };
      // Refresh subscription data
      await fetchData();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }, [user, fetchData]);

  const refreshSubscription = fetchData;

  return {
    subscription,
    currentTier,
    tiers,
    loading,
    tierId: (subscription?.tier_id || "free") as TierId,
    isFree: (subscription?.tier_id || "free") === "free",
    isPro: subscription?.tier_id === "pro",
    isEnterprise: subscription?.tier_id === "enterprise",
    hasFeature,
    hasCredits,
    getCreditCost,
    consumeCredits,
    refreshSubscription,
    creditsRemaining: subscription?.credits_remaining ?? 0,
    creditsUsed: subscription?.credits_used ?? 0,
  };
}

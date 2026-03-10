import { useState } from "react";
import { useTier, TierId } from "@/hooks/useTier";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Crown, Building2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIER_ICONS: Record<string, any> = { free: Zap, pro: Crown, enterprise: Building2 };

const TIER_COLORS: Record<string, string> = {
  free: "from-muted to-muted/50",
  pro: "from-primary/20 to-accent/20",
  enterprise: "from-primary/30 to-primary/10",
};

const FEATURE_DISPLAY: Record<string, string> = {
  basic_editor: "Visual Code Editor",
  dev_environment: "Development Environment",
  community_support: "Community Support",
  cicd_pipeline: "CI/CD Pipeline",
  quality_gates: "Quality Gates",
  environment_promotion: "Environment Promotion (Dev → Staging → Prod)",
  team_collaboration: "Team Collaboration",
  custom_domains: "Custom Domain Publishing",
  white_label: "White Label Branding",
  priority_support: "Priority Support",
  sla_guarantee: "99.9% SLA Guarantee",
  dedicated_support: "Dedicated Account Manager",
};

interface PricingPageProps {
  onClose?: () => void;
}

const PricingPage = ({ onClose }: PricingPageProps) => {
  const { tiers, tierId, loading, subscription } = useTier();
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const handleUpgrade = async (targetTier: TierId) => {
    if (targetTier === tierId) return;
    setUpgrading(targetTier);

    // Stripe checkout will be wired here once the key is added
    toast({
      title: "Upgrade coming soon",
      description: "Stripe integration will be enabled shortly. Your tier selection has been noted.",
    });

    setTimeout(() => setUpgrading(null), 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">Choose Your Plan</h2>
        <p className="text-sm text-muted-foreground mt-1">Scale from prototype to production</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const Icon = TIER_ICONS[tier.id] || Zap;
          const isCurrentTier = tier.id === tierId;
          const isPopular = tier.id === "pro";

          return (
            <div
              key={tier.id}
              className={`relative rounded-xl border p-5 flex flex-col gap-4 transition-all ${
                isPopular
                  ? "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                  : "border-border hover:border-primary/30"
              }`}
            >
              {isPopular && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px]">
                  Most Popular
                </Badge>
              )}

              <div className={`rounded-lg p-3 bg-gradient-to-br ${TIER_COLORS[tier.id]}`}>
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-primary" />
                  <span className="font-bold text-sm">{tier.name}</span>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold">
                    {tier.price_monthly === 0 ? "Free" : `$${tier.price_monthly / 100}`}
                  </span>
                  {tier.price_monthly > 0 && (
                    <span className="text-xs text-muted-foreground">/month</span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <Zap className="w-3 h-3 text-primary" />
                  <span>
                    {tier.credits_per_month === -1
                      ? "Unlimited credits"
                      : `${tier.credits_per_month} credits/mo`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Check className="w-3 h-3 text-primary" />
                  <span>
                    {tier.max_projects === -1 ? "Unlimited" : tier.max_projects} projects
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Check className="w-3 h-3 text-primary" />
                  <span>
                    {tier.max_team_members === -1 ? "Unlimited" : tier.max_team_members} team members
                  </span>
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-1.5 flex-1">
                {(tier.features as string[]).map((f) => (
                  <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                    <span>{FEATURE_DISPLAY[f] || f}</span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full"
                variant={isCurrentTier ? "outline" : isPopular ? "default" : "secondary"}
                size="sm"
                disabled={isCurrentTier || upgrading !== null}
                onClick={() => handleUpgrade(tier.id as TierId)}
              >
                {upgrading === tier.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isCurrentTier ? (
                  "Current Plan"
                ) : tier.price_monthly > (tiers.find(t => t.id === tierId)?.price_monthly ?? 0) ? (
                  "Upgrade"
                ) : (
                  "Downgrade"
                )}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="text-center text-[10px] text-muted-foreground">
        Credit costs: AI Prompt (1) · Build Run (5) · Deploy (3) · Marketing (2)
      </div>
    </div>
  );
};

export default PricingPage;

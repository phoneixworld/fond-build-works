import { ReactNode } from "react";
import { useTier, GatedFeature, CreditOperation } from "@/hooks/useTier";
import { Lock, Zap, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TierGateProps {
  feature?: GatedFeature;
  creditOperation?: CreditOperation;
  children: ReactNode;
  fallback?: ReactNode;
  onUpgrade?: () => void;
}

const FEATURE_LABELS: Record<GatedFeature, { name: string; tier: string }> = {
  cicd_pipeline: { name: "CI/CD Pipeline", tier: "Pro" },
  quality_gates: { name: "Quality Gates", tier: "Pro" },
  environment_promotion: { name: "Environment Promotion", tier: "Pro" },
  team_collaboration: { name: "Team Collaboration", tier: "Pro" },
  custom_domains: { name: "Custom Domains", tier: "Pro" },
  white_label: { name: "White Label", tier: "Enterprise" },
  priority_support: { name: "Priority Support", tier: "Pro" },
  sla_guarantee: { name: "SLA Guarantee", tier: "Enterprise" },
  dedicated_support: { name: "Dedicated Support", tier: "Enterprise" },
};

const TierGate = ({ feature, creditOperation, children, fallback, onUpgrade }: TierGateProps) => {
  const { hasFeature, hasCredits, getCreditCost } = useTier();

  // Feature gate check
  if (feature && !hasFeature(feature)) {
    const info = FEATURE_LABELS[feature];
    return fallback || (
      <div className="flex flex-col items-center justify-center p-6 rounded-lg border border-border bg-card/50 text-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">{info.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upgrade to <span className="text-primary font-medium">{info.tier}</span> to unlock this feature
          </p>
        </div>
        <Button size="sm" className="gap-1.5 mt-1" onClick={onUpgrade}>
          <ArrowUpRight className="w-3.5 h-3.5" />
          Upgrade to {info.tier}
        </Button>
      </div>
    );
  }

  // Credit gate check
  if (creditOperation && !hasCredits(creditOperation)) {
    const cost = getCreditCost(creditOperation);
    return fallback || (
      <div className="flex flex-col items-center justify-center p-6 rounded-lg border border-border bg-card/50 text-center gap-3">
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <p className="text-sm font-semibold">Insufficient Credits</p>
          <p className="text-xs text-muted-foreground mt-1">
            This action requires <span className="font-medium">{cost} credits</span>. Upgrade your plan for more.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={onUpgrade}>
          <ArrowUpRight className="w-3.5 h-3.5" />
          Get more credits
        </Button>
      </div>
    );
  }

  return <>{children}</>;
};

export default TierGate;

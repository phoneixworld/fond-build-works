
-- Subscription tiers config table
CREATE TABLE public.subscription_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_monthly integer NOT NULL DEFAULT 0,
  credits_per_month integer NOT NULL DEFAULT 50,
  max_projects integer NOT NULL DEFAULT 3,
  max_team_members integer NOT NULL DEFAULT 1,
  max_custom_domains integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tiers" ON public.subscription_tiers
  FOR SELECT TO anon, authenticated USING (true);

-- Seed tier data
INSERT INTO public.subscription_tiers (id, name, price_monthly, credits_per_month, max_projects, max_team_members, max_custom_domains, features) VALUES
  ('free', 'Free', 0, 50, 3, 1, 0, '["basic_editor", "dev_environment", "community_support"]'::jsonb),
  ('pro', 'Pro', 1900, 500, -1, 3, 1, '["basic_editor", "dev_environment", "cicd_pipeline", "quality_gates", "environment_promotion", "team_collaboration", "custom_domains", "priority_support"]'::jsonb),
  ('enterprise', 'Enterprise', 4900, -1, -1, -1, -1, '["basic_editor", "dev_environment", "cicd_pipeline", "quality_gates", "environment_promotion", "team_collaboration", "custom_domains", "white_label", "priority_support", "sla_guarantee", "dedicated_support"]'::jsonb);

-- User subscriptions table
CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier_id text NOT NULL REFERENCES public.subscription_tiers(id) DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  credits_remaining integer NOT NULL DEFAULT 50,
  credits_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscription" ON public.user_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Service role full access on user_subscriptions" ON public.user_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Credit usage log
CREATE TABLE public.credit_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  operation text NOT NULL,
  credits_consumed integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_id uuid REFERENCES public.projects(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credit_usage" ON public.credit_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Service role full access on credit_usage" ON public.credit_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Auto-create subscription for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, tier_id, credits_remaining)
  VALUES (NEW.id, 'free', 50)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_add_subscription
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_subscription();

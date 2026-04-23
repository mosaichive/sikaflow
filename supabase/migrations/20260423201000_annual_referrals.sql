-- Annual referral system
-- Safe additive migration only.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_referred_by_user_idx
  ON public.profiles (referred_by_user_id);

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(replace(gen_random_uuid()::text, '-', ''));
$$;

CREATE TABLE IF NOT EXISTS public.referral_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE DEFAULT public.generate_referral_code(),
  current_cycle_started_at timestamptz,
  current_cycle_ends_at timestamptz,
  current_cycle_rewarded_count integer NOT NULL DEFAULT 0,
  lifetime_rewarded_count integer NOT NULL DEFAULT 0,
  last_reward_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_accounts_cycle_count_chk CHECK (current_cycle_rewarded_count BETWEEN 0 AND 3),
  CONSTRAINT referral_accounts_lifetime_count_chk CHECK (lifetime_rewarded_count >= 0)
);

CREATE INDEX IF NOT EXISTS referral_accounts_owner_idx
  ON public.referral_accounts (owner_user_id);

ALTER TABLE public.referral_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business admins read own referral account" ON public.referral_accounts;
CREATE POLICY "Business admins read own referral account"
ON public.referral_accounts
FOR SELECT TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.has_role_in_business(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admin full access referral accounts" ON public.referral_accounts;
CREATE POLICY "Super admin full access referral accounts"
ON public.referral_accounts
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS referral_accounts_set_updated_at ON public.referral_accounts;
CREATE TRIGGER referral_accounts_set_updated_at
BEFORE UPDATE ON public.referral_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_account_id uuid NOT NULL REFERENCES public.referral_accounts(id) ON DELETE CASCADE,
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_business_id uuid UNIQUE REFERENCES public.businesses(id) ON DELETE SET NULL,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  validation_reason text NOT NULL DEFAULT '',
  referred_email text,
  referred_phone text,
  referred_device_id text,
  referred_signup_ip text,
  referred_user_agent text,
  qualified_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  subscribed_plan text,
  converted_at timestamptz,
  reward_applied_at timestamptz,
  reward_months integer NOT NULL DEFAULT 0,
  flagged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cycle_started_at timestamptz,
  cycle_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_status_chk CHECK (status IN ('pending', 'successful', 'rewarded', 'flagged', 'invalid')),
  CONSTRAINT referrals_plan_chk CHECK (subscribed_plan IS NULL OR subscribed_plan IN ('monthly', 'annual')),
  CONSTRAINT referrals_reward_months_chk CHECK (reward_months BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_status_idx
  ON public.referrals (referrer_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS referrals_referrer_business_idx
  ON public.referrals (referrer_business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS referrals_device_idx
  ON public.referrals (referred_device_id);

CREATE INDEX IF NOT EXISTS referrals_ip_idx
  ON public.referrals (referred_signup_ip);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business admins read own referrals" ON public.referrals;
CREATE POLICY "Business admins read own referrals"
ON public.referrals
FOR SELECT TO authenticated
USING (
  referrer_business_id = public.get_user_business_id(auth.uid())
  AND public.has_role_in_business(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Super admin full access referrals" ON public.referrals;
CREATE POLICY "Super admin full access referrals"
ON public.referrals
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS referrals_set_updated_at ON public.referrals;
CREATE TRIGGER referrals_set_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.referral_accounts (business_id, owner_user_id)
SELECT b.id, b.owner_user_id
FROM public.businesses b
WHERE b.owner_user_id IS NOT NULL
ON CONFLICT (business_id) DO UPDATE
SET owner_user_id = EXCLUDED.owner_user_id;

CREATE OR REPLACE FUNCTION public.create_referral_account_for_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    INSERT INTO public.referral_accounts (business_id, owner_user_id)
    VALUES (NEW.id, NEW.owner_user_id)
    ON CONFLICT (business_id) DO UPDATE
      SET owner_user_id = EXCLUDED.owner_user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_create_referral_account ON public.businesses;
CREATE TRIGGER businesses_create_referral_account
AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.create_referral_account_for_business();

DO $$
BEGIN
  IF to_regclass('public.referral_accounts') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'referral_accounts'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_accounts;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.referrals') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'referrals'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;
  END IF;
END $$;

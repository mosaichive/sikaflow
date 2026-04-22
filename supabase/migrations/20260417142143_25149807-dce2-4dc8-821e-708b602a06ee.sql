-- =========================================================================
-- 1. Helper: is_super_admin (used in many policies)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::app_role
  );
$$;

-- =========================================================================
-- 2. subscriptions table  (one row per business)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free_trial',                -- 'free_trial' | 'monthly' | 'annual' | 'lifetime'
  status text NOT NULL DEFAULT 'trial',                   -- 'trial' | 'active' | 'overdue' | 'expired' | 'suspended' | 'canceled' | 'lifetime'
  price_ghs numeric NOT NULL DEFAULT 0,
  trial_start_date timestamptz,
  trial_end_date timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_renewal_date timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  discount_percent numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_plan_chk CHECK (plan IN ('free_trial','monthly','annual','lifetime')),
  CONSTRAINT subscriptions_status_chk CHECK (status IN ('trial','active','overdue','expired','suspended','canceled','lifetime'))
);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_plan_idx ON public.subscriptions(plan);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Tenant members can SEE their own subscription
CREATE POLICY "Members view own subscription"
ON public.subscriptions
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

-- Super admins can do everything
CREATE POLICY "Super admin full access subscriptions"
ON public.subscriptions
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER subscriptions_set_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 3. payments table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan text NOT NULL,                                       -- which plan this payment is for
  amount_ghs numeric NOT NULL DEFAULT 0,
  discount_ghs numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  method text NOT NULL DEFAULT 'manual_momo',               -- manual_momo | manual_bank | paystack | other
  status text NOT NULL DEFAULT 'pending',                   -- pending | confirmed | rejected | refunded
  reference text DEFAULT '',                                -- MoMo txn id, Paystack ref, etc.
  paystack_reference text,
  payer_name text DEFAULT '',
  payer_phone text DEFAULT '',
  note text DEFAULT '',
  submitted_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  payment_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_status_chk CHECK (status IN ('pending','confirmed','rejected','refunded')),
  CONSTRAINT payments_plan_chk CHECK (plan IN ('monthly','annual'))
);

CREATE INDEX IF NOT EXISTS payments_business_idx ON public.payments(business_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Tenant admins (of the business) can view their own payments
CREATE POLICY "Members view own payments"
ON public.payments
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

-- Tenant admins can submit a manual payment for their own business
CREATE POLICY "Tenant admin submit payment"
ON public.payments
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND public.has_role_in_business(auth.uid(), 'admin'::app_role)
  AND submitted_by = auth.uid()
);

-- Super admin: full
CREATE POLICY "Super admin full access payments"
ON public.payments
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 4. platform_announcements
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'info',  -- info | warning | critical
  audience text NOT NULL DEFAULT 'all_tenants', -- all_tenants | trial | paid | expired
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcement_level_chk CHECK (level IN ('info','warning','critical'))
);

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active announcements that match the window
CREATE POLICY "All users read active announcements"
ON public.platform_announcements
FOR SELECT TO authenticated
USING (
  active = true
  AND starts_at <= now()
  AND (ends_at IS NULL OR ends_at > now())
);

-- Super admin: full
CREATE POLICY "Super admin manage announcements"
ON public.platform_announcements
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER announcements_set_updated_at
BEFORE UPDATE ON public.platform_announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 5. platform_audit_log  (super-admin actions only)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  details jsonb DEFAULT '{}'::jsonb,
  performed_by uuid NOT NULL,
  performed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin view audit"
ON public.platform_audit_log
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin insert audit"
ON public.platform_audit_log
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()) AND performed_by = auth.uid());

-- =========================================================================
-- 6. Allow super_admin to SEE every business (metadata only)
-- =========================================================================
CREATE POLICY "Super admin view all businesses"
ON public.businesses
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Super admin may update metadata (status, verification reset, etc.)
CREATE POLICY "Super admin update businesses"
ON public.businesses
FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Super admin may delete a business (cascades to subscription/payments via FK)
CREATE POLICY "Super admin delete businesses"
ON public.businesses
FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- =========================================================================
-- 7. has_access() helper for app gating
-- =========================================================================
CREATE OR REPLACE FUNCTION public.business_has_access(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          WHEN s.status = 'lifetime' THEN true
          WHEN s.status = 'trial'
            AND s.trial_end_date IS NOT NULL
            AND s.trial_end_date > now() THEN true
          WHEN s.status = 'active'
            AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN true
          ELSE false
        END
      FROM public.subscriptions s
      WHERE s.business_id = _business_id
    ),
    false
  );
$$;

-- =========================================================================
-- 8. Auto-create a trial subscription when a new business is created
--    (only if one doesn't already exist — keeps Maggs Trove safe)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_trial_subscription_for_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions
    (business_id, plan, status, price_ghs, trial_start_date, trial_end_date, current_period_start, current_period_end, next_renewal_date)
  VALUES
    (NEW.id, 'free_trial', 'trial', 0, now(), now() + interval '30 days', now(), now() + interval '30 days', now() + interval '30 days')
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_create_trial_sub ON public.businesses;
CREATE TRIGGER businesses_create_trial_sub
AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.create_trial_subscription_for_business();

-- =========================================================================
-- 9. Backfill: every existing business is GRANDFATHERED as lifetime free
-- =========================================================================
INSERT INTO public.subscriptions (business_id, plan, status, price_ghs, notes)
SELECT b.id, 'lifetime', 'lifetime', 0, 'Grandfathered — pre-billing tenant'
FROM public.businesses b
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.business_id = b.id);
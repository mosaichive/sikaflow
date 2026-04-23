-- =========================================================================
-- Paystack + Ghana MoMo production flow
-- Adds richer payment statuses, audit logs, and realtime publication
-- so subscriptions can activate instantly without a page refresh.
-- =========================================================================

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_chk;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS requested_plan text,
  ADD COLUMN IF NOT EXISTS resolved_plan text,
  ADD COLUMN IF NOT EXISTS billing_cycle text,
  ADD COLUMN IF NOT EXISTS gateway_status text,
  ADD COLUMN IF NOT EXISTS gateway_message text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS amount_paid_ghs numeric,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_of_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;

UPDATE public.payments
SET
  requested_plan = COALESCE(requested_plan, plan),
  resolved_plan = COALESCE(resolved_plan, CASE WHEN status = 'confirmed' THEN plan ELSE NULL END),
  billing_cycle = COALESCE(billing_cycle, plan),
  amount_paid_ghs = COALESCE(amount_paid_ghs, CASE WHEN status = 'confirmed' THEN amount_ghs ELSE NULL END);

ALTER TABLE public.payments
  ALTER COLUMN requested_plan SET DEFAULT 'monthly';

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_chk,
  DROP CONSTRAINT IF EXISTS payments_requested_plan_chk,
  DROP CONSTRAINT IF EXISTS payments_resolved_plan_chk;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_chk
  CHECK (status IN ('pending','confirmed','failed','cancelled','timeout','review','rejected','refunded'));

ALTER TABLE public.payments
  ADD CONSTRAINT payments_requested_plan_chk
  CHECK (requested_plan IS NULL OR requested_plan IN ('monthly','annual'));

ALTER TABLE public.payments
  ADD CONSTRAINT payments_resolved_plan_chk
  CHECK (resolved_plan IS NULL OR resolved_plan IN ('monthly','annual'));

CREATE INDEX IF NOT EXISTS payments_reference_idx ON public.payments(reference);
CREATE INDEX IF NOT EXISTS payments_paystack_reference_idx ON public.payments(paystack_reference);
CREATE INDEX IF NOT EXISTS payments_provider_transaction_idx ON public.payments(provider_transaction_id);
CREATE INDEX IF NOT EXISTS payments_business_created_idx ON public.payments(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  event_source text NOT NULL DEFAULT 'system',
  event_type text NOT NULL,
  status text NOT NULL,
  message text DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON public.payment_events(payment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_business_idx ON public.payment_events(business_id, created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view own payment events" ON public.payment_events;
CREATE POLICY "Members view own payment events"
ON public.payment_events
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Super admin full access payment events" ON public.payment_events;
CREATE POLICY "Super admin full access payment events"
ON public.payment_events
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subscriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payment_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_events;
  END IF;
END $$;

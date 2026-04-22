-- Platform-managed payment methods (controlled by super_admin, visible to all tenants)
CREATE TABLE public.platform_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('momo', 'bank', 'paystack')),
  label text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  instructions text DEFAULT '',
  badge text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated read active payment methods"
  ON public.platform_payment_methods FOR SELECT
  TO authenticated
  USING (active = true OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manage payment methods"
  ON public.platform_payment_methods FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_ppm_updated_at
  BEFORE UPDATE ON public.platform_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ppm_active_sort ON public.platform_payment_methods (active, sort_order);

-- Allow super admin to UPDATE payments (for confirm/reject) — already covered by ALL policy above on payments? confirm
-- Existing payments policies allow super admin ALL access already.

-- Add paystack tracking columns if not present (already has paystack_reference)
-- No schema change needed for payments.
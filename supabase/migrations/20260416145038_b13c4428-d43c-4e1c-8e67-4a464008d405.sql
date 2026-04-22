
-- Add 'manager' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- Create audit_log table
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,
  details text,
  performed_by uuid NOT NULL,
  performed_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
ON public.audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own audit logs"
ON public.audit_log FOR SELECT TO authenticated
USING (auth.uid() = performed_by);

CREATE POLICY "Authenticated can insert audit logs"
ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() = performed_by);

CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at DESC);

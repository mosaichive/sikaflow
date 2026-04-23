-- Platform ads + sales invoices/receipts
-- Safe additive migration: no existing records are removed or overwritten.

-- -------------------------------------------------------------------------
-- 1. Platform ads
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  cta_text text,
  cta_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_ads_title_len_chk CHECK (char_length(title) BETWEEN 1 AND 80),
  CONSTRAINT platform_ads_description_len_chk CHECK (char_length(description) <= 180),
  CONSTRAINT platform_ads_cta_text_len_chk CHECK (cta_text IS NULL OR char_length(cta_text) <= 24),
  CONSTRAINT platform_ads_cta_url_chk CHECK (
    cta_url IS NULL
    OR cta_url ~* '^(https?://|/)'
  )
);

CREATE INDEX IF NOT EXISTS platform_ads_active_sort_idx
  ON public.platform_ads (active, sort_order, created_at DESC);

ALTER TABLE public.platform_ads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All users read active ads" ON public.platform_ads;
CREATE POLICY "All users read active ads"
ON public.platform_ads
FOR SELECT TO authenticated
USING (active = true);

DROP POLICY IF EXISTS "Super admin manage ads" ON public.platform_ads;
CREATE POLICY "Super admin manage ads"
ON public.platform_ads
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS platform_ads_set_updated_at ON public.platform_ads;
CREATE TRIGGER platform_ads_set_updated_at
BEFORE UPDATE ON public.platform_ads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public image bucket for ads. Only super_admin can mutate objects.
INSERT INTO storage.buckets (id, name, public)
VALUES ('platform-ads', 'platform-ads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read platform ads" ON storage.objects;
CREATE POLICY "Public read platform ads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'platform-ads');

DROP POLICY IF EXISTS "Super admin upload platform ads" ON storage.objects;
CREATE POLICY "Super admin upload platform ads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'platform-ads' AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin update platform ads" ON storage.objects;
CREATE POLICY "Super admin update platform ads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'platform-ads' AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin delete platform ads" ON storage.objects;
CREATE POLICY "Super admin delete platform ads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'platform-ads' AND public.is_super_admin(auth.uid()));

-- -------------------------------------------------------------------------
-- 2. Sales invoices and receipts
-- -------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_document_number_seq START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.receipt_document_number_seq START WITH 1001;

CREATE OR REPLACE FUNCTION public.generate_sale_document_number(_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _next bigint;
  _prefix text;
BEGIN
  IF _kind = 'invoice' THEN
    _next := nextval('public.invoice_document_number_seq');
    _prefix := 'INV';
  ELSIF _kind = 'receipt' THEN
    _next := nextval('public.receipt_document_number_seq');
    _prefix := 'RCT';
  ELSE
    RAISE EXCEPTION 'Unsupported sale document type: %', _kind;
  END IF;

  RETURN _prefix || '-' || to_char(now(), 'YYYYMM') || '-' || lpad(_next::text, 5, '0');
END;
$function$;

CREATE TABLE IF NOT EXISTS public.sale_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  kind text NOT NULL,
  document_number text NOT NULL UNIQUE,
  sale_date timestamptz NOT NULL,
  payment_status text NOT NULL,
  amount_ghs numeric NOT NULL DEFAULT 0,
  amount_paid_ghs numeric NOT NULL DEFAULT 0,
  balance_ghs numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  customer_name text NOT NULL DEFAULT 'Walk-in',
  customer_phone text,
  seller_name text,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_documents_kind_chk CHECK (kind IN ('invoice', 'receipt')),
  CONSTRAINT sale_documents_currency_chk CHECK (currency = 'GHS'),
  CONSTRAINT sale_documents_payment_status_chk CHECK (payment_status IN ('paid', 'partial', 'unpaid'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sale_documents_sale_kind_idx
  ON public.sale_documents (sale_id, kind);
CREATE INDEX IF NOT EXISTS sale_documents_business_kind_created_idx
  ON public.sale_documents (business_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS sale_documents_document_number_idx
  ON public.sale_documents (document_number);

CREATE OR REPLACE FUNCTION public.sale_documents_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _sale record;
BEGIN
  SELECT
    id,
    business_id,
    sale_date,
    payment_status,
    total,
    amount_paid,
    balance,
    customer_name,
    customer_phone,
    staff_name
  INTO _sale
  FROM public.sales
  WHERE id = NEW.sale_id;

  IF _sale.id IS NULL THEN
    RAISE EXCEPTION 'Sale not found for sale document';
  END IF;

  IF NEW.business_id <> _sale.business_id THEN
    RAISE EXCEPTION 'Sale document business does not match sale business';
  END IF;

  IF NEW.kind = 'receipt' AND _sale.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Receipts can only be created for paid sales';
  END IF;

  IF NEW.document_number IS NULL OR btrim(NEW.document_number) = '' THEN
    NEW.document_number := public.generate_sale_document_number(NEW.kind);
  END IF;

  NEW.sale_date := COALESCE(NEW.sale_date, _sale.sale_date);
  NEW.payment_status := COALESCE(NULLIF(NEW.payment_status, ''), _sale.payment_status);
  NEW.amount_ghs := COALESCE(NEW.amount_ghs, _sale.total, 0);
  NEW.amount_paid_ghs := COALESCE(NEW.amount_paid_ghs, _sale.amount_paid, 0);
  NEW.balance_ghs := COALESCE(NEW.balance_ghs, _sale.balance, 0);
  NEW.customer_name := COALESCE(NULLIF(NEW.customer_name, ''), NULLIF(_sale.customer_name, ''), 'Walk-in');
  NEW.customer_phone := COALESCE(NEW.customer_phone, _sale.customer_phone);
  NEW.seller_name := COALESCE(NEW.seller_name, _sale.staff_name);
  NEW.issued_at := COALESCE(NEW.issued_at, now());

  RETURN NEW;
END;
$function$;

ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view sale documents" ON public.sale_documents;
CREATE POLICY "Members view sale documents"
ON public.sale_documents
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Members insert sale documents" ON public.sale_documents;
CREATE POLICY "Members insert sale documents"
ON public.sale_documents
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND issued_by = auth.uid()
);

DROP POLICY IF EXISTS "Members update sale documents" ON public.sale_documents;
CREATE POLICY "Members update sale documents"
ON public.sale_documents
FOR UPDATE TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()))
WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Admins delete sale documents" ON public.sale_documents;
CREATE POLICY "Admins delete sale documents"
ON public.sale_documents
FOR DELETE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND public.has_role_in_business(auth.uid(), 'admin'::app_role)
);

DROP TRIGGER IF EXISTS sale_documents_before_write_trg ON public.sale_documents;
CREATE TRIGGER sale_documents_before_write_trg
BEFORE INSERT OR UPDATE ON public.sale_documents
FOR EACH ROW EXECUTE FUNCTION public.sale_documents_before_write();

DROP TRIGGER IF EXISTS sale_documents_set_updated_at ON public.sale_documents;
CREATE TRIGGER sale_documents_set_updated_at
BEFORE UPDATE ON public.sale_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------
-- 3. Realtime
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.platform_ads') IS NOT NULL
    AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'platform_ads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_ads;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sale_documents') IS NOT NULL
    AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sale_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_documents;
  END IF;
END $$;

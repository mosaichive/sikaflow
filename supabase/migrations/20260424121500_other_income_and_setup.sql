CREATE TABLE IF NOT EXISTS public.other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  income_date timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL DEFAULT 'cash',
  description text NOT NULL DEFAULT '',
  attachment_path text,
  attachment_name text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT other_income_amount_chk CHECK (amount >= 0),
  CONSTRAINT other_income_category_chk CHECK (char_length(trim(category)) BETWEEN 1 AND 80),
  CONSTRAINT other_income_description_chk CHECK (char_length(description) <= 500),
  CONSTRAINT other_income_payment_method_chk CHECK (payment_method IN ('cash', 'momo', 'bank_transfer', 'card'))
);

CREATE INDEX IF NOT EXISTS other_income_business_date_idx
  ON public.other_income (business_id, income_date DESC);

CREATE INDEX IF NOT EXISTS other_income_business_category_idx
  ON public.other_income (business_id, category);

ALTER TABLE public.other_income ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view other income" ON public.other_income;
CREATE POLICY "Members view other income"
ON public.other_income
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Managers insert other income" ON public.other_income;
CREATE POLICY "Managers insert other income"
ON public.other_income
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND recorded_by = auth.uid()
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

DROP POLICY IF EXISTS "Managers update other income" ON public.other_income;
CREATE POLICY "Managers update other income"
ON public.other_income
FOR UPDATE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
)
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

DROP POLICY IF EXISTS "Managers delete other income" ON public.other_income;
CREATE POLICY "Managers delete other income"
ON public.other_income
FOR DELETE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

DROP TRIGGER IF EXISTS other_income_set_updated_at ON public.other_income;
CREATE TRIGGER other_income_set_updated_at
BEFORE UPDATE ON public.other_income
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('other-income-receipts', 'other-income-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Members read other income receipts" ON storage.objects;
CREATE POLICY "Members read other income receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'other-income-receipts'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "Managers upload other income receipts" ON storage.objects;
CREATE POLICY "Managers upload other income receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'other-income-receipts'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
    AND (
      public.has_role_in_business(auth.uid(), 'admin'::app_role)
      OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
    )
  );

DROP POLICY IF EXISTS "Managers update other income receipts" ON storage.objects;
CREATE POLICY "Managers update other income receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'other-income-receipts'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
    AND (
      public.has_role_in_business(auth.uid(), 'admin'::app_role)
      OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
    )
  );

DROP POLICY IF EXISTS "Managers delete other income receipts" ON storage.objects;
CREATE POLICY "Managers delete other income receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'other-income-receipts'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
    AND (
      public.has_role_in_business(auth.uid(), 'admin'::app_role)
      OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
    )
  );

DO $$
BEGIN
  IF to_regclass('public.other_income') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'other_income'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.other_income;
  END IF;
END $$;

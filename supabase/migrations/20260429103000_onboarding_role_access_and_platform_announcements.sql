ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET onboarding_completed = true
WHERE business_id IS NOT NULL
  AND onboarding_completed = false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

UPDATE public.products
SET low_stock_threshold = COALESCE(low_stock_threshold, reorder_level, 5)
WHERE low_stock_threshold IS NULL;

ALTER TABLE public.products
  ALTER COLUMN low_stock_threshold SET DEFAULT 5;

CREATE INDEX IF NOT EXISTS products_business_user_idx
  ON public.products (business_id, user_id);

UPDATE public.products AS p
SET user_id = b.owner_user_id
FROM public.businesses AS b
WHERE p.business_id = b.id
  AND p.user_id IS NULL
  AND b.owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  movement_type text NOT NULL,
  quantity_change integer NOT NULL,
  quantity_after integer NOT NULL DEFAULT 0,
  unit_cost numeric(10,2) NOT NULL DEFAULT 0,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  source_table text,
  source_id uuid,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  movement_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_type_chk CHECK (
    movement_type IN ('opening_stock', 'restock', 'sale', 'return', 'damaged_stock', 'manual_adjustment')
  )
);

CREATE INDEX IF NOT EXISTS stock_movements_business_date_idx
  ON public.stock_movements (business_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS stock_movements_product_date_idx
  ON public.stock_movements (product_id, movement_date DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view stock movements" ON public.stock_movements;
CREATE POLICY "Members view stock movements"
ON public.stock_movements
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Members insert stock movements" ON public.stock_movements;
CREATE POLICY "Members insert stock movements"
ON public.stock_movements
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
    OR public.has_role_in_business(auth.uid(), 'salesperson'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins update stock movements" ON public.stock_movements;
CREATE POLICY "Admins update stock movements"
ON public.stock_movements
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

DROP POLICY IF EXISTS "Admins delete stock movements" ON public.stock_movements;
CREATE POLICY "Admins delete stock movements"
ON public.stock_movements
FOR DELETE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

DROP TRIGGER IF EXISTS stock_movements_set_updated_at ON public.stock_movements;
CREATE TRIGGER stock_movements_set_updated_at
BEFORE UPDATE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.ensure_business_workspace_membership(
  _business_id uuid,
  _display_name text DEFAULT '',
  _phone text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _resolved_business_id uuid := _business_id;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _resolved_business_id IS NULL THEN
    SELECT business_id INTO _resolved_business_id
    FROM public.profiles
    WHERE user_id = _uid;
  END IF;

  IF _resolved_business_id IS NULL THEN
    RAISE EXCEPTION 'Business/workspace not found for current user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE id = _resolved_business_id
  ) THEN
    RAISE EXCEPTION 'Business/workspace does not exist';
  END IF;

  INSERT INTO public.profiles (user_id, business_id, display_name, phone)
  VALUES (_uid, _resolved_business_id, NULLIF(_display_name, ''), NULLIF(_phone, ''))
  ON CONFLICT (user_id) DO UPDATE
    SET business_id = EXCLUDED.business_id,
        display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), public.profiles.display_name),
        phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.profiles.phone);

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _uid
      AND business_id IS NOT DISTINCT FROM _resolved_business_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _uid
  ) THEN
    INSERT INTO public.user_roles (user_id, role, business_id)
    VALUES (_uid, 'admin'::app_role, _resolved_business_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN _resolved_business_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_for_owner(
  _name text,
  _email text,
  _phone text,
  _location text,
  _employees int,
  _logo_light_url text,
  _logo_dark_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _biz_id uuid;
  _existing uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT business_id INTO _existing
  FROM public.profiles
  WHERE user_id = _uid;

  IF _existing IS NOT NULL THEN
    PERFORM public.ensure_business_workspace_membership(_existing, _name, _phone);
    RETURN _existing;
  END IF;

  INSERT INTO public.businesses
    (name, email, phone, location, number_of_employees, owner_user_id,
     status, email_verified, phone_verified, logo_light_url, logo_dark_url)
  VALUES
    (_name, _email, _phone, _location, COALESCE(_employees, 1), _uid,
     'pending', false, false,
     NULLIF(_logo_light_url, ''), NULLIF(_logo_dark_url, ''))
  RETURNING id INTO _biz_id;

  PERFORM public.ensure_business_workspace_membership(_biz_id, _name, _phone);

  RETURN _biz_id;
END;
$$;

INSERT INTO public.user_roles (user_id, role, business_id)
SELECT b.owner_user_id, 'admin'::app_role, b.id
FROM public.businesses AS b
WHERE b.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = b.owner_user_id
      AND ur.business_id IS NOT DISTINCT FROM b.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = b.owner_user_id
      AND ur.role = 'super_admin'::app_role
  )
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Admins insert products" ON public.products;
CREATE POLICY "Admins insert products"
ON public.products
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins update products" ON public.products;
CREATE POLICY "Admins update products"
ON public.products
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

DROP POLICY IF EXISTS "Admins delete products" ON public.products;
CREATE POLICY "Admins delete products"
ON public.products
FOR DELETE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

ALTER TABLE public.platform_announcements
  ADD COLUMN IF NOT EXISTS target_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS platform_announcements_target_business_idx
  ON public.platform_announcements (target_business_id, starts_at DESC);

DROP POLICY IF EXISTS "All users read active announcements" ON public.platform_announcements;
DROP POLICY IF EXISTS "Tenant users read visible platform announcements" ON public.platform_announcements;
CREATE POLICY "Tenant users read visible platform announcements"
ON public.platform_announcements
FOR SELECT TO authenticated
USING (
  active = true
  AND starts_at <= now()
  AND (ends_at IS NULL OR ends_at > now())
  AND (
    audience = 'all_tenants'
    OR (
      audience IN ('trial', 'trial_users')
      AND EXISTS (
        SELECT 1
        FROM public.subscriptions AS s
        WHERE s.business_id = public.get_user_business_id(auth.uid())
          AND s.status = 'trial'
      )
    )
    OR (
      audience IN ('paid', 'active_subscribers')
      AND EXISTS (
        SELECT 1
        FROM public.subscriptions AS s
        WHERE s.business_id = public.get_user_business_id(auth.uid())
          AND s.status IN ('active', 'lifetime')
      )
    )
    OR (
      audience IN ('expired', 'expired_subscribers')
      AND EXISTS (
        SELECT 1
        FROM public.subscriptions AS s
        WHERE s.business_id = public.get_user_business_id(auth.uid())
          AND s.status IN ('expired', 'overdue', 'suspended', 'canceled')
      )
    )
    OR (
      audience = 'specific_tenant'
      AND target_business_id = public.get_user_business_id(auth.uid())
    )
  )
);

CREATE TABLE IF NOT EXISTS public.platform_announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.platform_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS platform_announcement_reads_business_idx
  ON public.platform_announcement_reads (business_id, user_id, read_at DESC);

ALTER TABLE public.platform_announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view own platform announcement reads" ON public.platform_announcement_reads;
CREATE POLICY "Members view own platform announcement reads"
ON public.platform_announcement_reads
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    business_id = public.get_user_business_id(auth.uid())
    AND user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Members insert own platform announcement reads" ON public.platform_announcement_reads;
CREATE POLICY "Members insert own platform announcement reads"
ON public.platform_announcement_reads
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "Super admin full access platform announcement reads" ON public.platform_announcement_reads;
CREATE POLICY "Super admin full access platform announcement reads"
ON public.platform_announcement_reads
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DO $$
BEGIN
  IF to_regclass('public.stock_movements') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'stock_movements'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.platform_announcements') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'platform_announcements'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_announcements;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.platform_announcement_reads') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'platform_announcement_reads'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_announcement_reads;
  END IF;
END $$;

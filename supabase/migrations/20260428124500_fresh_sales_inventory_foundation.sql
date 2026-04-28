ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'salesperson';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'distributor';

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

UPDATE public.products
SET low_stock_threshold = COALESCE(low_stock_threshold, reorder_level, 5)
WHERE low_stock_threshold IS NULL;

ALTER TABLE public.products
  ALTER COLUMN low_stock_threshold SET DEFAULT 5;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'pos',
  ADD COLUMN IF NOT EXISTS order_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_status_chk'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_status_chk
      CHECK (status IN ('pending', 'completed', 'delivered', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_sale_channel_chk'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_sale_channel_chk
      CHECK (sale_channel IN ('pos', 'order'));
  END IF;
END $$;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expenses_payment_method_chk'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_payment_method_chk
      CHECK (payment_method IN ('cash', 'momo', 'bank_transfer', 'card'));
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT 'Walk-in',
  customer_phone text NOT NULL DEFAULT '',
  delivery_location text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  balance numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  payment_status text NOT NULL DEFAULT 'unpaid',
  status text NOT NULL DEFAULT 'pending',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  due_date timestamptz,
  order_date timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_payment_status_chk CHECK (payment_status IN ('paid', 'partial', 'unpaid', 'overdue')),
  CONSTRAINT orders_status_chk CHECK (status IN ('pending', 'confirmed', 'processing', 'ready_for_pickup', 'delivered', 'cancelled')),
  CONSTRAINT orders_payment_method_chk CHECK (payment_method IN ('cash', 'momo', 'bank_transfer', 'card'))
);

CREATE INDEX IF NOT EXISTS orders_business_date_idx
  ON public.orders (business_id, order_date DESC);

CREATE INDEX IF NOT EXISTS orders_business_status_idx
  ON public.orders (business_id, status);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view orders" ON public.orders;
CREATE POLICY "Members view orders"
ON public.orders
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Members insert orders" ON public.orders;
CREATE POLICY "Members insert orders"
ON public.orders
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
    OR public.has_role_in_business(auth.uid(), 'salesperson'::app_role)
  )
);

DROP POLICY IF EXISTS "Members update orders" ON public.orders;
CREATE POLICY "Members update orders"
ON public.orders
FOR UPDATE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
    OR public.has_role_in_business(auth.uid(), 'salesperson'::app_role)
  )
)
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
    OR public.has_role_in_business(auth.uid(), 'salesperson'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins delete orders" ON public.orders;
CREATE POLICY "Admins delete orders"
ON public.orders
FOR DELETE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  cost_price numeric(10,2) NOT NULL DEFAULT 0,
  line_total numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_idx
  ON public.order_items (order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view order items" ON public.order_items;
CREATE POLICY "Members view order items"
ON public.order_items
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Members insert order items" ON public.order_items;
CREATE POLICY "Members insert order items"
ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Admins delete order items" ON public.order_items;
CREATE POLICY "Admins delete order items"
ON public.order_items
FOR DELETE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_order_id_fk'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_order_id_fk
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.business_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_announcements_title_len_chk CHECK (char_length(title) BETWEEN 1 AND 140),
  CONSTRAINT business_announcements_body_len_chk CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS business_announcements_business_idx
  ON public.business_announcements (business_id, created_at DESC);

ALTER TABLE public.business_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view business announcements" ON public.business_announcements;
CREATE POLICY "Members view business announcements"
ON public.business_announcements
FOR SELECT TO authenticated
USING (business_id = public.get_user_business_id(auth.uid()));

DROP POLICY IF EXISTS "Admins manage business announcements" ON public.business_announcements;
CREATE POLICY "Admins manage business announcements"
ON public.business_announcements
FOR ALL TO authenticated
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

DROP TRIGGER IF EXISTS business_announcements_set_updated_at ON public.business_announcements;
CREATE TRIGGER business_announcements_set_updated_at
BEFORE UPDATE ON public.business_announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.business_announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.business_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS business_announcement_reads_business_idx
  ON public.business_announcement_reads (business_id, user_id, read_at DESC);

ALTER TABLE public.business_announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view own announcement reads" ON public.business_announcement_reads;
CREATE POLICY "Members view own announcement reads"
ON public.business_announcement_reads
FOR SELECT TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND (
    user_id = auth.uid()
    OR public.has_role_in_business(auth.uid(), 'admin'::app_role)
    OR public.has_role_in_business(auth.uid(), 'manager'::app_role)
  )
);

DROP POLICY IF EXISTS "Members insert own announcement reads" ON public.business_announcement_reads;
CREATE POLICY "Members insert own announcement reads"
ON public.business_announcement_reads
FOR INSERT TO authenticated
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "Members update own announcement reads" ON public.business_announcement_reads;
CREATE POLICY "Members update own announcement reads"
ON public.business_announcement_reads
FOR UPDATE TO authenticated
USING (
  business_id = public.get_user_business_id(auth.uid())
  AND user_id = auth.uid()
)
WITH CHECK (
  business_id = public.get_user_business_id(auth.uid())
  AND user_id = auth.uid()
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Members read expense receipts" ON storage.objects;
CREATE POLICY "Members read expense receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "Members upload expense receipts" ON storage.objects;
CREATE POLICY "Members upload expense receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "Members update expense receipts" ON storage.objects;
CREATE POLICY "Members update expense receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "Members delete expense receipts" ON storage.objects;
CREATE POLICY "Members delete expense receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

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
  IF to_regclass('public.orders') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'order_items'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.business_announcements') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'business_announcements'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.business_announcements;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.business_announcement_reads') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'business_announcement_reads'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.business_announcement_reads;
  END IF;
END $$;

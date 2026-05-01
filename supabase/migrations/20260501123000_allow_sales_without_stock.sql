ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS allow_sales_without_stock boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'in_stock',
  ADD COLUMN IF NOT EXISTS stock_shortfall integer NOT NULL DEFAULT 0;

UPDATE public.sales
SET
  stock_status = COALESCE(NULLIF(stock_status, ''), 'in_stock'),
  stock_shortfall = COALESCE(stock_shortfall, 0)
WHERE stock_status IS NULL
   OR stock_status = ''
   OR stock_shortfall IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_stock_status_chk'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_stock_status_chk
      CHECK (stock_status IN ('in_stock', 'negative_stock_sale', 'backorder_sale'));
  END IF;
END $$;


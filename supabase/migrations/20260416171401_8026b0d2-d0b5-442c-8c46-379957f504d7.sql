
ALTER TABLE public.sale_items ADD COLUMN default_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN price_note text DEFAULT '';

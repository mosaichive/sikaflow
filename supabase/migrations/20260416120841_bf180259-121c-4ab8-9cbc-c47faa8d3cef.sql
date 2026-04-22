
-- Create restocks table
CREATE TABLE public.restocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  supplier TEXT DEFAULT '',
  quantity_added INTEGER NOT NULL DEFAULT 0,
  cost_price_per_unit NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  restock_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recorded_by UUID NOT NULL,
  recorded_by_name TEXT DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.restocks ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated can view restocks" ON public.restocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert restocks" ON public.restocks FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update restocks" ON public.restocks FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete restocks" ON public.restocks FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_restocks_updated_at BEFORE UPDATE ON public.restocks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: when a restock record is deleted, reduce the product stock back
CREATE OR REPLACE FUNCTION public.reverse_restock_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.product_id IS NOT NULL THEN
    UPDATE public.products SET quantity = GREATEST(0, quantity - OLD.quantity_added) WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER on_restock_delete BEFORE DELETE ON public.restocks FOR EACH ROW EXECUTE FUNCTION public.reverse_restock_on_delete();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.restocks;

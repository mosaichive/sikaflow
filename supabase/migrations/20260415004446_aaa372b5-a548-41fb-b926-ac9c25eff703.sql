
CREATE TABLE public.investor_funding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investor_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  date_received TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  investment_type TEXT DEFAULT '',
  repayment_terms TEXT DEFAULT '',
  expected_return NUMERIC DEFAULT 0,
  note TEXT DEFAULT '',
  recorded_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_funding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view investor_funding" ON public.investor_funding FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert investor_funding" ON public.investor_funding FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update investor_funding" ON public.investor_funding FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete investor_funding" ON public.investor_funding FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_investor_funding_updated_at BEFORE UPDATE ON public.investor_funding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.investor_funding;

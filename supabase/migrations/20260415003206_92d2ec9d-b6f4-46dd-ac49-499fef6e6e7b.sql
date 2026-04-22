
-- Bank/Account Details table
CREATE TABLE public.bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_name text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  branch text DEFAULT '',
  mobile_money_name text DEFAULT '',
  mobile_money_number text DEFAULT '',
  account_type text NOT NULL DEFAULT 'bank',
  note text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert bank_accounts" ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update bank_accounts" ON public.bank_accounts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete bank_accounts" ON public.bank_accounts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Savings table
CREATE TABLE public.savings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  amount numeric NOT NULL DEFAULT 0,
  savings_date timestamp with time zone NOT NULL DEFAULT now(),
  source text DEFAULT '',
  note text DEFAULT '',
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference text DEFAULT '',
  recorded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.savings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view savings" ON public.savings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert savings" ON public.savings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update savings" ON public.savings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete savings" ON public.savings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_savings_updated_at BEFORE UPDATE ON public.savings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Investments table
CREATE TABLE public.investments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  investment_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  investment_date timestamp with time zone NOT NULL DEFAULT now(),
  expected_return numeric DEFAULT 0,
  duration text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  note text DEFAULT '',
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference text DEFAULT '',
  recorded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view investments" ON public.investments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert investments" ON public.investments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update investments" ON public.investments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete investments" ON public.investments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_investments_updated_at BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.savings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.investments;

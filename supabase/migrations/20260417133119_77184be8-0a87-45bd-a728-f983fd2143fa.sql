
-- =========================================================================
-- PHASE 1: MULTI-TENANT FOUNDATION
-- =========================================================================

-- 1. Create businesses table
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  logo_light_url text,
  logo_dark_url text,
  email text,
  phone text,
  location text,
  number_of_employees int DEFAULT 1,
  owner_user_id uuid,
  status text NOT NULL DEFAULT 'pending', -- pending | active | suspended
  email_verified boolean NOT NULL DEFAULT false,
  phone_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_businesses_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add business_id to every existing table (nullable for backfill)
ALTER TABLE public.products            ADD COLUMN business_id uuid;
ALTER TABLE public.sales               ADD COLUMN business_id uuid;
ALTER TABLE public.sale_items          ADD COLUMN business_id uuid;
ALTER TABLE public.customers           ADD COLUMN business_id uuid;
ALTER TABLE public.expenses            ADD COLUMN business_id uuid;
ALTER TABLE public.restocks            ADD COLUMN business_id uuid;
ALTER TABLE public.bank_accounts       ADD COLUMN business_id uuid;
ALTER TABLE public.savings             ADD COLUMN business_id uuid;
ALTER TABLE public.investments         ADD COLUMN business_id uuid;
ALTER TABLE public.investor_funding    ADD COLUMN business_id uuid;
ALTER TABLE public.audit_log           ADD COLUMN business_id uuid;
ALTER TABLE public.profiles            ADD COLUMN business_id uuid;
ALTER TABLE public.user_roles          ADD COLUMN business_id uuid;

-- 3. Create the Maggs Trove business and backfill all data
DO $$
DECLARE
  v_maggs_id uuid;
  v_owner_id uuid;
BEGIN
  -- Pick the first admin as owner; if none, pick the earliest user role
  SELECT user_id INTO v_owner_id
  FROM public.user_roles
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    SELECT user_id INTO v_owner_id
    FROM public.user_roles
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.businesses (name, slug, status, email_verified, phone_verified, owner_user_id, number_of_employees)
  VALUES ('Maggs Trove', 'maggs-trove', 'active', true, true, v_owner_id, 1)
  RETURNING id INTO v_maggs_id;

  -- Backfill every existing row to Maggs Trove
  UPDATE public.products            SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.sales               SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.sale_items          SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.customers           SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.expenses            SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.restocks            SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.bank_accounts       SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.savings             SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.investments         SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.investor_funding    SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.audit_log           SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.profiles            SET business_id = v_maggs_id WHERE business_id IS NULL;
  UPDATE public.user_roles          SET business_id = v_maggs_id WHERE business_id IS NULL;
END $$;

-- 4. Lock business_id as required on data tables (profiles & user_roles stay nullable for new signups during Phase 2)
ALTER TABLE public.products            ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.sales               ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.sale_items          ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.customers           ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.expenses            ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.restocks            ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.bank_accounts       ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.savings             ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.investments         ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.investor_funding    ALTER COLUMN business_id SET NOT NULL;

-- 5. Foreign keys
ALTER TABLE public.products         ADD CONSTRAINT products_business_fk         FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.sales            ADD CONSTRAINT sales_business_fk            FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.sale_items       ADD CONSTRAINT sale_items_business_fk       FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.customers        ADD CONSTRAINT customers_business_fk        FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.expenses         ADD CONSTRAINT expenses_business_fk         FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.restocks         ADD CONSTRAINT restocks_business_fk         FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.bank_accounts    ADD CONSTRAINT bank_accounts_business_fk    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.savings          ADD CONSTRAINT savings_business_fk          FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.investments      ADD CONSTRAINT investments_business_fk      FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.investor_funding ADD CONSTRAINT investor_funding_business_fk FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.audit_log        ADD CONSTRAINT audit_log_business_fk        FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;
ALTER TABLE public.profiles         ADD CONSTRAINT profiles_business_fk         FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles       ADD CONSTRAINT user_roles_business_fk       FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;

-- 6. Indexes for performance
CREATE INDEX idx_products_business         ON public.products(business_id);
CREATE INDEX idx_sales_business            ON public.sales(business_id);
CREATE INDEX idx_sale_items_business       ON public.sale_items(business_id);
CREATE INDEX idx_customers_business        ON public.customers(business_id);
CREATE INDEX idx_expenses_business         ON public.expenses(business_id);
CREATE INDEX idx_restocks_business         ON public.restocks(business_id);
CREATE INDEX idx_bank_accounts_business    ON public.bank_accounts(business_id);
CREATE INDEX idx_savings_business          ON public.savings(business_id);
CREATE INDEX idx_investments_business      ON public.investments(business_id);
CREATE INDEX idx_investor_funding_business ON public.investor_funding(business_id);
CREATE INDEX idx_profiles_business         ON public.profiles(business_id);
CREATE INDEX idx_user_roles_business       ON public.user_roles(business_id);

-- 7. Tenant helper function (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_business_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(_user_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND business_id = _business_id
  );
$$;

-- Tenant-aware role check: user has role X within their business
CREATE OR REPLACE FUNCTION public.has_role_in_business(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND ur.business_id = p.business_id
  );
$$;

-- 8. RLS on businesses table
CREATE POLICY "Members can view their business"
ON public.businesses FOR SELECT TO authenticated
USING (id = public.get_user_business_id(auth.uid()));

CREATE POLICY "Owner admin can update their business"
ON public.businesses FOR UPDATE TO authenticated
USING (id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

CREATE POLICY "Anyone authenticated can create a business"
ON public.businesses FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_user_id);

-- 9. Rewrite RLS on all data tables: scope by business_id
-- PRODUCTS
DROP POLICY IF EXISTS "Authenticated can view products" ON public.products;
DROP POLICY IF EXISTS "Admins can insert products"     ON public.products;
DROP POLICY IF EXISTS "Admins can update products"     ON public.products;
DROP POLICY IF EXISTS "Admins can delete products"     ON public.products;
CREATE POLICY "Members view products" ON public.products FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins update products" ON public.products FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete products" ON public.products FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- SALES
DROP POLICY IF EXISTS "Authenticated can view sales"   ON public.sales;
DROP POLICY IF EXISTS "Authenticated can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can update sales"        ON public.sales;
DROP POLICY IF EXISTS "Admins can delete sales"        ON public.sales;
CREATE POLICY "Members view sales"   ON public.sales FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Members insert sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (auth.uid() = staff_id AND business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins update sales"  ON public.sales FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete sales"  ON public.sales FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- SALE_ITEMS
DROP POLICY IF EXISTS "Authenticated can view sale_items"   ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated can insert sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Admins can delete sale_items"        ON public.sale_items;
CREATE POLICY "Members view sale_items"   ON public.sale_items FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Members insert sale_items" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins delete sale_items"  ON public.sale_items FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- CUSTOMERS
DROP POLICY IF EXISTS "Authenticated can view customers"   ON public.customers;
DROP POLICY IF EXISTS "Authenticated can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can update customers"        ON public.customers;
DROP POLICY IF EXISTS "Admins can delete customers"        ON public.customers;
CREATE POLICY "Members view customers"   ON public.customers FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Members insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins update customers"  ON public.customers FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete customers"  ON public.customers FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- EXPENSES
DROP POLICY IF EXISTS "Authenticated can view expenses"   ON public.expenses;
DROP POLICY IF EXISTS "Authenticated can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can update expenses"        ON public.expenses;
DROP POLICY IF EXISTS "Admins can delete expenses"        ON public.expenses;
CREATE POLICY "Members view expenses"   ON public.expenses FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Members insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = recorded_by AND business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins update expenses"  ON public.expenses FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete expenses"  ON public.expenses FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- RESTOCKS
DROP POLICY IF EXISTS "Authenticated can view restocks" ON public.restocks;
DROP POLICY IF EXISTS "Admins can insert restocks"      ON public.restocks;
DROP POLICY IF EXISTS "Admins can update restocks"      ON public.restocks;
DROP POLICY IF EXISTS "Admins can delete restocks"      ON public.restocks;
CREATE POLICY "Members view restocks"  ON public.restocks FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins insert restocks" ON public.restocks FOR INSERT TO authenticated WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins update restocks" ON public.restocks FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete restocks" ON public.restocks FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- BANK_ACCOUNTS
DROP POLICY IF EXISTS "Authenticated can view bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Admins can insert bank_accounts"      ON public.bank_accounts;
DROP POLICY IF EXISTS "Admins can update bank_accounts"      ON public.bank_accounts;
DROP POLICY IF EXISTS "Admins can delete bank_accounts"      ON public.bank_accounts;
CREATE POLICY "Members view bank_accounts"  ON public.bank_accounts FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins insert bank_accounts" ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins update bank_accounts" ON public.bank_accounts FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete bank_accounts" ON public.bank_accounts FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- SAVINGS
DROP POLICY IF EXISTS "Authenticated can view savings" ON public.savings;
DROP POLICY IF EXISTS "Admins can insert savings"      ON public.savings;
DROP POLICY IF EXISTS "Admins can update savings"      ON public.savings;
DROP POLICY IF EXISTS "Admins can delete savings"      ON public.savings;
CREATE POLICY "Members view savings"  ON public.savings FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins insert savings" ON public.savings FOR INSERT TO authenticated WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins update savings" ON public.savings FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete savings" ON public.savings FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- INVESTMENTS
DROP POLICY IF EXISTS "Authenticated can view investments" ON public.investments;
DROP POLICY IF EXISTS "Admins can insert investments"      ON public.investments;
DROP POLICY IF EXISTS "Admins can update investments"      ON public.investments;
DROP POLICY IF EXISTS "Admins can delete investments"      ON public.investments;
CREATE POLICY "Members view investments"  ON public.investments FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins insert investments" ON public.investments FOR INSERT TO authenticated WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins update investments" ON public.investments FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete investments" ON public.investments FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- INVESTOR_FUNDING
DROP POLICY IF EXISTS "Authenticated can view investor_funding" ON public.investor_funding;
DROP POLICY IF EXISTS "Admins can insert investor_funding"      ON public.investor_funding;
DROP POLICY IF EXISTS "Admins can update investor_funding"      ON public.investor_funding;
DROP POLICY IF EXISTS "Admins can delete investor_funding"      ON public.investor_funding;
CREATE POLICY "Members view investor_funding"  ON public.investor_funding FOR SELECT TO authenticated USING (business_id = public.get_user_business_id(auth.uid()));
CREATE POLICY "Admins insert investor_funding" ON public.investor_funding FOR INSERT TO authenticated WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins update investor_funding" ON public.investor_funding FOR UPDATE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete investor_funding" ON public.investor_funding FOR DELETE TO authenticated USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

-- AUDIT_LOG
DROP POLICY IF EXISTS "Admins can view all audit logs"     ON public.audit_log;
DROP POLICY IF EXISTS "Users can view own audit logs"      ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log;
CREATE POLICY "Members view business audit logs" ON public.audit_log FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()) OR auth.uid() = performed_by);
CREATE POLICY "Members insert audit logs" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = performed_by);

-- PROFILES (members of same business can see each other; users update only themselves)
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Members view business profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (business_id IS NOT NULL AND business_id = public.get_user_business_id(auth.uid()))
  );
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- USER_ROLES (scoped per business)
DROP POLICY IF EXISTS "Users can view own roles"  ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles"   ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles"   ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles"   ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins view business roles" ON public.user_roles FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins insert business roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins update business roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));
CREATE POLICY "Admins delete business roles" ON public.user_roles FOR DELETE TO authenticated
  USING (business_id = public.get_user_business_id(auth.uid()) AND public.has_role_in_business(auth.uid(), 'admin'));

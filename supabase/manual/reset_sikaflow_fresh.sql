-- Intentionally destructive reset for SikaFlow.
-- Run this manually in Supabase SQL Editor only when you want a clean production reset.
-- It keeps the schema, functions, policies, and migrations intact while removing app data.

BEGIN;

-- Supabase blocks direct SQL deletion from storage.objects in SQL Editor.
-- Clear bucket files separately from the Storage UI/API if you want the files gone too.

DO $$
DECLARE
  tables_to_reset text[] := ARRAY[
    'public.business_announcement_reads',
    'public.business_announcements',
    'public.order_items',
    'public.orders',
    'public.stock_movements',
    'public.sale_documents',
    'public.payment_events',
    'public.payments',
    'public.subscriptions',
    'public.platform_announcements',
    'public.platform_ads',
    'public.platform_support_settings',
    'public.referrals',
    'public.referral_accounts',
    'public.support_messages',
    'public.other_income',
    'public.restocks',
    'public.sale_items',
    'public.sales',
    'public.expenses',
    'public.products',
    'public.customers',
    'public.audit_log',
    'public.platform_audit_log',
    'public.bank_accounts',
    'public.savings',
    'public.investments',
    'public.investor_funding',
    'public.signup_otps',
    'public.user_roles',
    'public.profiles',
    'public.businesses'
  ];
  existing_tables text;
BEGIN
  SELECT string_agg(table_name, ', ')
  INTO existing_tables
  FROM unnest(tables_to_reset) AS table_name
  WHERE to_regclass(table_name) IS NOT NULL;

  IF existing_tables IS NOT NULL AND existing_tables <> '' THEN
    EXECUTE 'TRUNCATE TABLE ' || existing_tables || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.platform_support_settings') IS NOT NULL THEN
    INSERT INTO public.platform_support_settings (singleton_key)
    VALUES ('default')
    ON CONFLICT (singleton_key) DO NOTHING;
  END IF;
END $$;

DELETE FROM auth.identities;
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.one_time_tokens;
DELETE FROM auth.mfa_factors;
DELETE FROM auth.mfa_challenges;
DELETE FROM auth.users;

ALTER SEQUENCE IF EXISTS public.invoice_document_number_seq RESTART WITH 1001;
ALTER SEQUENCE IF EXISTS public.receipt_document_number_seq RESTART WITH 1001;

COMMIT;

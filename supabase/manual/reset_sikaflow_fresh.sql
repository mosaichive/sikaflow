-- Intentionally destructive reset for SikaFlow.
-- Run this manually in Supabase SQL Editor only when you want a clean production reset.
-- It keeps the schema, functions, policies, and migrations intact while removing app data.

BEGIN;

DELETE FROM storage.objects
WHERE bucket_id IN (
  'product-images',
  'business-logos',
  'platform-ads',
  'other-income-receipts',
  'expense-receipts'
);

TRUNCATE TABLE
  public.business_announcement_reads,
  public.business_announcements,
  public.order_items,
  public.orders,
  public.stock_movements,
  public.sale_documents,
  public.payment_events,
  public.payments,
  public.subscriptions,
  public.platform_announcements,
  public.platform_ads,
  public.support_messages,
  public.other_income,
  public.restocks,
  public.sale_items,
  public.sales,
  public.expenses,
  public.products,
  public.customers,
  public.audit_log,
  public.platform_audit_log,
  public.bank_accounts,
  public.savings,
  public.investments,
  public.investor_funding,
  public.signup_otps,
  public.user_roles,
  public.profiles,
  public.businesses
RESTART IDENTITY CASCADE;

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

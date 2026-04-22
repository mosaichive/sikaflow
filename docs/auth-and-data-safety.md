# Auth And Data Safety Notes

SikaFlow uses Supabase Auth as the application identity provider. Existing production data is keyed to Supabase Auth UUIDs through `profiles.user_id`, `user_roles.user_id`, `sales.staff_id`, `expenses.recorded_by`, `payments.submitted_by`, and related foreign keys.

## Preservation Rules

- Do not replace Supabase Auth user IDs with IDs from another identity provider without a full mapping migration.
- Do not truncate, recreate, or overwrite tenant tables to support a UI redesign.
- Keep RLS helpers based on `auth.uid()` unless a future migration deliberately introduces a backwards-compatible identity mapping layer.
- New auth UI should call `supabase.auth.signInWithPassword`, `supabase.auth.signUp`, and `supabase.auth.signInWithOAuth`.
- New businesses should continue to use `create_business_for_owner`, which preserves one user to one first workspace and lets the database create the 30-day trial subscription.

## Vercel Environment

Required frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Optional Supabase Edge Function secrets for WhatsApp OTP delivery:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`

Paystack secrets remain Supabase Edge Function secrets, not client-side Vercel variables.

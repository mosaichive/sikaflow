# Paystack + Ghana Mobile Money

This release adds a production-ready subscription payment flow for Ghana:

- direct mobile money prompts for `MTN MoMo`, `Telecel Cash`, and `AirtelTigo Money`
- Paystack hosted checkout for card / bank alternatives
- signed webhook verification for successful charges
- exact-amount plan matching before automatic activation
- realtime subscription/payment updates in tenant and platform dashboards

## What Activates Automatically

The app activates a plan only when the **exact paid amount** matches one of these prices:

- `monthly` -> `GH₵50`
- `annual` -> `GH₵500`

If the amount is:

- underpaid
- overpaid
- not a valid plan amount
- a duplicate provider transaction/reference

then the payment is marked `review` and **no automatic plan activation happens**.

## Supabase Deploy

Deploy these functions to the live project:

- `paystack-payment`
- `paystack-webhook`
- `manage-subscription`

Run the new migration that adds:

- richer `payments` statuses and fields
- `payment_events`
- realtime publication for `payments`, `subscriptions`, and `payment_events`

## Required Supabase Edge Function Secrets

Set these in the live Supabase project:

- `PAYSTACK_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_URL`

Optional for WhatsApp confirmation notifications:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`

## Paystack Dashboard Setup

Set the Paystack webhook URL to:

```txt
https://<your-project-ref>.supabase.co/functions/v1/paystack-webhook
```

For the current live project this becomes:

```txt
https://hhgnriavkqdnjmmpklbw.supabase.co/functions/v1/paystack-webhook
```

## Runtime Behavior

### Direct Ghana MoMo flow

1. Tenant picks a paid plan.
2. Tenant enters phone number + network.
3. SikaFlow calls Paystack Charge API.
4. User confirms on phone.
5. SikaFlow verifies through:
   - Paystack webhook for successful charges
   - charge-status polling for pending / failed / timeout outcomes
6. Subscription updates instantly without page refresh.

### Stored payment states

The flow now supports:

- `pending`
- `confirmed`
- `failed`
- `cancelled`
- `timeout`
- `review`
- `rejected`
- `refunded`

## Admin Review Path

Platform admins can:

- confirm `pending` payments
- confirm `review` payments after manual checking
- reject any unresolved payment

All transitions are visible live in:

- tenant billing
- platform payments
- platform dashboard

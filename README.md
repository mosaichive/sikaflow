# SikaFlow

A Vite, React, TypeScript, and Supabase production app for sales, inventory, expenses, savings, investments, investor funding, reports, subscriptions, and platform administration.

This repo is now the source of truth for development and deployment. The app uses Supabase Auth and Supabase data directly so existing registered-user UUIDs and tenant records remain compatible with the current database and RLS policies.

## Development

Install dependencies:

```sh
npm install
```

Create a local `.env` file from `.env.example`, then run:

```sh
npm run dev
```

## Environment

Required Vercel variables:

```sh
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
```

Supabase Edge Function secrets such as Paystack and Twilio credentials should be configured in Supabase, not exposed as client-side Vercel variables.

## Build

```sh
npm run build
```

## Production Notes

- Do not run destructive migrations against production data.
- Keep user, business, transaction, inventory, and subscription records intact.
- See `docs/prd-onboarding-trial-dashboard-redesign.md` for the product direction and `docs/auth-and-data-safety.md` for auth/data preservation rules.

# Product Requirements Document: SikaFlow Production Refactor

## Product Goal

SikaFlow helps small business owners and managers track daily sales, inventory, expenses, savings, investments, investor funding, reports, and subscription status from one clean web app. The production refactor keeps existing Supabase data intact while removing Lovable-specific assumptions and preparing the app for normal GitHub plus Vercel development.

## Non-Negotiable Data Rules

- Do not delete, truncate, reset, or recreate production tenant data.
- Preserve existing Supabase Auth user UUIDs, profiles, roles, businesses, products, customers, sales, sale items, expenses, restocks, savings, investments, investor funding, subscriptions, payments, settings, and audit logs.
- Keep schema changes additive and backwards-compatible.
- Keep RLS and tenant scoping based on existing `auth.uid()` data ownership.
- Existing businesses without subscription rows are grandfathered by the current migration logic; new businesses receive trial subscriptions automatically.

## User Types

- Owner/admin: sets up the business, manages subscription, team members, products, inventory, settings, and financial records.
- Manager: records sales, manages inventory, reviews reports, and handles daily operations where permissions allow.
- Staff: records sales and views operational data allowed by current RLS and role policies.
- Super admin: monitors platform businesses, subscriptions, payment methods, payments, and announcements.

## Authentication And Onboarding

The login surface is a single, simple auth experience with Sign in and Sign up side by side. Pricing is not shown during account creation.

New-user path:

1. User signs up with email/password or configured Supabase OAuth provider.
2. The app redirects to the dashboard after account creation when Supabase provides a session.
3. If the user has no business, the dashboard opens the first-run onboarding dialog.
4. Onboarding uses lightweight card-slide steps for business name, location, team size, owner name, role, email, and phone.
5. Completing onboarding calls `create_business_for_owner`, creates/links the business, refreshes auth/business/subscription contexts, and updates the dashboard without a full page refresh.

## Trial And Subscription Flow

- Every newly created business receives a 30-day free trial from the database trigger.
- Signup does not show plan selection or pricing.
- Trial reminders appear inside the app when seven or fewer days remain.
- Expired or inaccessible subscriptions show in-app upgrade prompts and route admins to Billing.
- Existing records remain visible and safe; the app must not destroy or rewrite tenant data when access changes.

## Dashboard Experience

The dashboard should be a fast operating surface:

- Show subscription/platform notifications first when relevant.
- Show key daily focus numbers: available cash, today's sales, and stock left.
- Show scannable business numbers: period sales, net profit, outstanding balances, and expenses.
- Include stock-left figures and low-stock context.
- Include a clean bar/line chart toggle for sales trends.
- Include recent transactions and helpful empty states.
- Avoid clutter and avoid pushing pricing or setup friction into the main workflow.

## Finance Tracking Flow

Finance records must be easy to create and easy to find:

- Expenses support date range filtering with a clear action.
- Sale history supports date range filtering with a clear action.
- Savings, Investments, and Investor Funding each support date range filtering with clear actions.
- Filtered lists must work with existing records and should not change stored data.
- Empty states distinguish between no records and no matches for the selected date range.

## Inventory Flow

- Inventory focuses on stock levels, stock breakdown, restock actions, and restock history.
- Dashboard inventory cards show stock left.
- Product creation remains available from the Products/sidebar flow, not as a top action on Inventory.
- Restock history supports date range, supplier, payment, bank/account, search, and sort filters.
- Restock actions must preserve stock and finance calculations.

## Reports Flow

- Reports show financial summaries for the selected date range.
- Reports include sales, restocks, savings, investments, and investor funding views.
- Sales reports support bar and line chart modes.
- Empty reports explain whether records are missing for the selected period.

## Admin And Business Logic Assumptions

- Supabase Auth remains the identity provider because existing rows use Supabase Auth UUIDs.
- Tenant data is scoped through `business_id` and existing RLS helpers.
- Business creation is handled by a server-side RPC, not by client-side table choreography alone.
- Super-admin platform tools remain separate from tenant workflows.
- Payment provider secrets stay server-side in Supabase Edge Function secrets.

## Mobile Responsiveness

- Navigation, auth, onboarding, filters, tables, dialogs, and chart controls must fit mobile widths.
- Long tabular data can scroll horizontally, but primary actions and filters should wrap cleanly.
- Buttons and form fields should remain tappable and readable.

## States

- Loading: use branded or skeleton loading where route data is resolving.
- Empty: show direct next-step guidance without jargon.
- Error: show actionable toast or inline errors without hiding existing records.
- Filtered empty: tell users to clear or adjust the date range.
- Expired trial: show upgrade prompts while preserving user confidence that records are safe.

## Acceptance Criteria

- Lovable and Clerk dependencies are removed.
- Supabase Auth preserves existing registered-user data compatibility.
- Sign in and Sign up live together on the auth page.
- Signup does not include pricing.
- First-run onboarding appears on the dashboard and refreshes app state after completion.
- New businesses receive the existing 30-day trial behavior.
- Dashboard shows stock left and supports bar/line chart switching.
- Reports support bar/line chart switching.
- Expenses, Sales, Savings, Investments, Investor Funding, and Inventory restocks support date lookup flows.
- Inventory has no Add Product action at the top of the page.
- `npm run build` and tests pass before deployment.

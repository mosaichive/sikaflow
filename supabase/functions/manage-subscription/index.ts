// Super Admin actions on a tenant subscription.
// Authenticates the caller and verifies they have the super_admin role
// before performing any privileged operation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import {
  PLAN_CONFIG,
  activateSubscriptionForPayment,
  maybeApplyReferralReward,
  recordPaymentEvent,
  syncAnnualReferralCycle,
  type SupportedPlan,
} from "../_shared/payment-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  action:
    | "extend_trial"
    | "set_plan"
    | "suspend"
    | "reactivate"
    | "cancel"
    | "delete_business"
    | "confirm_payment"
    | "reject_payment"
    | "reset_verification";
  business_id?: string;
  payment_id?: string;
  // params per action
  days?: number;
  plan?: "free_trial" | "monthly" | "annual" | "lifetime";
  status?: "trial" | "active" | "overdue" | "expired" | "suspended" | "canceled" | "lifetime";
  period_days?: number;
  note?: string;
}

const PLAN_PRICES: Record<string, number> = {
  free_trial: 0,
  monthly: PLAN_CONFIG.monthly.amountGhs,
  annual: PLAN_CONFIG.annual.amountGhs,
  lifetime: 0,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_auth" }, 401);
    }

    // 1. Verify caller via anon client + their JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    // 2. Service role for privileged work
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 3. Confirm super admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body?.action) return json({ error: "missing_action" }, 400);

    const log = async (action: string, details: Record<string, unknown>) => {
      await admin.from("platform_audit_log").insert({
        action,
        target_business_id: body.business_id ?? null,
        details,
        performed_by: user.id,
        performed_by_email: user.email,
      });
    };

    switch (body.action) {
      case "extend_trial": {
        if (!body.business_id || !body.days) return json({ error: "bad_params" }, 400);
        const { data: sub } = await admin
          .from("subscriptions").select("trial_end_date,current_period_end")
          .eq("business_id", body.business_id).maybeSingle();
        const base = sub?.trial_end_date && new Date(sub.trial_end_date) > new Date()
          ? new Date(sub.trial_end_date) : new Date();
        const newEnd = new Date(base.getTime() + body.days * 86400000).toISOString();
        await admin.from("subscriptions").update({
          status: "trial", plan: "free_trial",
          trial_end_date: newEnd, current_period_end: newEnd, next_renewal_date: newEnd,
        }).eq("business_id", body.business_id);
        await log("extend_trial", { days: body.days, new_end: newEnd });
        return json({ success: true });
      }

      case "set_plan": {
        if (!body.business_id || !body.plan) return json({ error: "bad_params" }, 400);
        const days = body.period_days ?? (body.plan === "annual" ? 365 : body.plan === "monthly" ? 30 : 0);
        const start = new Date();
        const end = days > 0 ? new Date(start.getTime() + days * 86400000) : null;
        const status = body.plan === "lifetime" ? "lifetime" : body.plan === "free_trial" ? "trial" : "active";
        await admin.from("subscriptions").update({
          plan: body.plan,
          status,
          price_ghs: PLAN_PRICES[body.plan] ?? 0,
          current_period_start: start.toISOString(),
          current_period_end: end?.toISOString() ?? null,
          next_renewal_date: end?.toISOString() ?? null,
          trial_start_date: body.plan === "free_trial" ? start.toISOString() : null,
          trial_end_date: body.plan === "free_trial" ? end?.toISOString() ?? null : null,
        }).eq("business_id", body.business_id);
        if (body.plan === "annual" && end) {
          await syncAnnualReferralCycle(admin, {
            businessId: body.business_id,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            forceReset: true,
          });
        }
        await log("set_plan", { plan: body.plan, period_days: days });
        return json({ success: true });
      }

      case "suspend": {
        if (!body.business_id) return json({ error: "bad_params" }, 400);
        await admin.from("subscriptions").update({ status: "suspended" }).eq("business_id", body.business_id);
        await admin.from("businesses").update({ status: "suspended" }).eq("id", body.business_id);
        await log("suspend", { note: body.note ?? null });
        return json({ success: true });
      }

      case "reactivate": {
        if (!body.business_id) return json({ error: "bad_params" }, 400);
        // Restore based on existing plan & dates
        const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", body.business_id).maybeSingle();
        let newStatus: string = "active";
        if (sub?.plan === "lifetime") newStatus = "lifetime";
        else if (sub?.plan === "free_trial") newStatus = "trial";
        await admin.from("subscriptions").update({ status: newStatus }).eq("business_id", body.business_id);
        await admin.from("businesses").update({ status: "active" }).eq("id", body.business_id);
        await log("reactivate", { restored_to: newStatus });
        return json({ success: true });
      }

      case "cancel": {
        if (!body.business_id) return json({ error: "bad_params" }, 400);
        await admin.from("subscriptions").update({ status: "canceled", cancel_at_period_end: true }).eq("business_id", body.business_id);
        await log("cancel", {});
        return json({ success: true });
      }

      case "delete_business": {
        if (!body.business_id) return json({ error: "bad_params" }, 400);
        await admin.from("businesses").delete().eq("id", body.business_id);
        await log("delete_business", { note: body.note ?? null });
        return json({ success: true });
      }

      case "confirm_payment": {
        if (!body.payment_id) return json({ error: "bad_params" }, 400);
        const { data: pay } = await admin.from("payments").select("*").eq("id", body.payment_id).maybeSingle();
        if (!pay) return json({ error: "payment_not_found" }, 404);
        const confirmedAt = new Date().toISOString();
        const planToActivate = ((pay.resolved_plan ?? pay.requested_plan ?? pay.plan) || "monthly") as SupportedPlan;
        let result: { status: string; expiresAt: string | null } = { status: "confirmed", expiresAt: null };

        if (pay.status === "review") {
          const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", pay.business_id).maybeSingle();
          const now = new Date();
          const base = sub?.current_period_end && new Date(sub.current_period_end) > now
            ? new Date(sub.current_period_end)
            : now;
          const end = new Date(base.getTime() + PLAN_CONFIG[planToActivate].billingDays * 86400000).toISOString();

          await admin.from("payments").update({
            status: "confirmed",
            plan: planToActivate,
            resolved_plan: planToActivate,
            requested_plan: pay.requested_plan ?? pay.plan,
            billing_cycle: PLAN_CONFIG[planToActivate].billingCycle,
            amount_paid_ghs: pay.amount_paid_ghs ?? pay.amount_ghs,
            review_reason: null,
            confirmed_by: user.id,
            confirmed_at: confirmedAt,
            activated_at: confirmedAt,
            expires_at: end,
            gateway_status: pay.gateway_status ?? "manual_confirmed",
            gateway_message: body.note ?? pay.gateway_message ?? "Review resolved by super admin",
          }).eq("id", body.payment_id);

          await admin.from("subscriptions").update({
            plan: planToActivate,
            status: "active",
            price_ghs: PLAN_PRICES[planToActivate] ?? 0,
            current_period_start: now.toISOString(),
            current_period_end: end,
            next_renewal_date: end,
            trial_end_date: null,
          }).eq("business_id", pay.business_id);

          if (planToActivate === "annual") {
            const forceCycleReset = !(
              sub?.plan === "annual"
              && sub?.status === "active"
              && sub?.current_period_end
              && new Date(sub.current_period_end) > now
            );
            await syncAnnualReferralCycle(admin, {
              businessId: pay.business_id,
              startAt: confirmedAt,
              endAt: end,
              forceReset: forceCycleReset,
            });
          }

          await recordPaymentEvent(admin, {
            paymentId: body.payment_id,
            businessId: pay.business_id,
            eventSource: "super_admin",
            eventType: "review_resolved",
            status: "confirmed",
            message: body.note ?? "Payment approved manually after review",
            payload: {
              performed_by: user.id,
              performed_by_email: user.email ?? null,
              activated_plan: planToActivate,
              expires_at: end,
            },
          });

          await maybeApplyReferralReward(admin, pay, {
            resolvedPlan: planToActivate,
            activatedAt: confirmedAt,
            eventSource: "super_admin",
          });
          result = { status: "confirmed", expiresAt: end };
        } else {
          const activation = await activateSubscriptionForPayment(admin, pay, {
            amountPaidGhs: Number(pay.amount_paid_ghs ?? pay.amount_ghs ?? 0),
            gatewayStatus: "manual_confirmed",
            gatewayMessage: body.note ?? "Payment confirmed by super admin",
            reference: pay.paystack_reference || pay.reference || pay.id,
            providerTransactionId: pay.provider_transaction_id ?? null,
            providerResponse: {
              source: "manage-subscription",
              action: "confirm_payment",
              note: body.note ?? null,
            },
            eventSource: "super_admin",
            network: pay.network ?? null,
          });
          if (activation.status === "confirmed") {
            await admin.from("payments").update({
              confirmed_by: user.id,
            }).eq("id", body.payment_id);
          }
          result = { status: activation.status, expiresAt: activation.expiresAt ?? null };
        }
        await log("confirm_payment", { payment_id: body.payment_id, plan: pay.plan });
        return json({ success: true, status: result.status, expires_at: result.expiresAt ?? null });
      }

      case "reject_payment": {
        if (!body.payment_id) return json({ error: "bad_params" }, 400);
        await admin.from("payments").update({
          status: "rejected",
          confirmed_by: user.id,
          confirmed_at: new Date().toISOString(),
          note: body.note ?? "",
        }).eq("id", body.payment_id);
        const { data: rejected } = await admin.from("payments").select("business_id").eq("id", body.payment_id).maybeSingle();
        if (rejected?.business_id) {
          await recordPaymentEvent(admin, {
            paymentId: body.payment_id,
            businessId: rejected.business_id,
            eventSource: "super_admin",
            eventType: "payment_rejected",
            status: "rejected",
            message: body.note ?? "Payment rejected by super admin",
            payload: { performed_by: user.id, performed_by_email: user.email ?? null },
          });
        }
        await log("reject_payment", { payment_id: body.payment_id, note: body.note ?? null });
        return json({ success: true });
      }

      case "reset_verification": {
        if (!body.business_id) return json({ error: "bad_params" }, 400);
        await admin.from("businesses").update({ email_verified: false, phone_verified: false }).eq("id", body.business_id);
        await log("reset_verification", {});
        return json({ success: true });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

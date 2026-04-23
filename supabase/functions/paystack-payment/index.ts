// Paystack subscription payments:
// - redirect checkout for card/bank
// - Ghana MoMo prompt via Charge API
// - verification / polling
// Subscription activation is based on the exact amount paid.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import {
  MOMO_NETWORKS,
  PLAN_CONFIG,
  activateSubscriptionForPayment,
  isPendingGatewayStatus,
  mapGatewayStatusToPaymentStatus,
  markPaymentForReview,
  markTerminalPaymentState,
  normalizeGhanaPhone,
  normalizeMomoNetwork,
  planAmount,
  recordPaymentEvent,
  type SupportedPlan,
} from "../_shared/payment-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYSTACK_BASE = "https://api.paystack.co";

type Body =
  | { action: "status" }
  | { action: "initialize"; plan: SupportedPlan; callback_url?: string }
  | { action: "verify"; reference: string }
  | { action: "charge_mobile_money"; plan: SupportedPlan; phone: string; network: string; payer_name?: string }
  | { action: "check_charge"; payment_id: string; force_timeout?: boolean };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

    let earlyBody: Body | null = null;
    try {
      earlyBody = (await req.clone().json()) as Body;
    } catch {
      earlyBody = null;
    }

    if (earlyBody?.action === "status") {
      return json({
        configured: !!paystackSecret,
        webhook_url: `${supabaseUrl}/functions/v1/paystack-webhook`,
        supports_mobile_money: true,
        supported_networks: Object.values(MOMO_NETWORKS).map((network) => ({
          code: network.code,
          label: network.label,
        })),
      });
    }

    if (!paystackSecret) return json({ error: "paystack_not_configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("business_id, display_name, phone")
      .eq("user_id", user.id)
      .maybeSingle();
    const businessId = profile?.business_id;
    if (!businessId) return json({ error: "no_business" }, 400);

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id")
      .eq("business_id", businessId)
      .maybeSingle();

    const body = (await req.json()) as Body;

    if (body.action === "initialize") {
      const reference = `STK_${businessId.slice(0, 8)}_${Date.now()}`;
      const amount = planAmount(body.plan);

      const { data: payment, error: paymentInsertError } = await admin
        .from("payments")
        .insert({
          business_id: businessId,
          subscription_id: sub?.id ?? null,
          requested_plan: body.plan,
          plan: body.plan,
          billing_cycle: PLAN_CONFIG[body.plan].billingCycle,
          amount_ghs: amount,
          amount_paid_ghs: null,
          currency: "GHS",
          method: "paystack_checkout",
          status: "pending",
          reference,
          paystack_reference: reference,
          payer_name: profile?.display_name || user.email || "",
          payer_phone: profile?.phone || "",
          submitted_by: user.id,
          gateway_status: "initialized",
          note: "Started via Paystack checkout",
        })
        .select("*")
        .single();
      if (paymentInsertError) return json({ error: paymentInsertError.message }, 400);

      const initRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: amount * 100,
          currency: "GHS",
          reference,
          callback_url: body.callback_url,
          metadata: {
            business_id: businessId,
            requested_plan: body.plan,
            user_id: user.id,
            payment_id: payment.id,
            flow: "checkout",
          },
        }),
      });
      const initData = await initRes.json();

      if (!initRes.ok || !initData.status) {
        await markTerminalPaymentState(admin, payment, {
          paymentStatus: "failed",
          gatewayStatus: "init_failed",
          gatewayMessage: initData?.message || "Paystack could not initialize this payment",
          reference,
          providerResponse: initData,
          eventSource: "paystack_checkout",
        });
        return json({ error: "paystack_init_failed", details: initData }, 400);
      }

      await admin.from("payments").update({
        gateway_status: "pending",
        gateway_message: "Checkout initialized",
        provider_response: initData,
      }).eq("id", payment.id);

      await recordPaymentEvent(admin, {
        paymentId: payment.id,
        businessId,
        eventSource: "paystack_checkout",
        eventType: "checkout_initialized",
        status: "pending",
        message: "Redirect checkout initialized",
        payload: { reference },
      });

      return json({
        success: true,
        payment_id: payment.id,
        authorization_url: initData.data.authorization_url,
        access_code: initData.data.access_code,
        reference: initData.data.reference,
      });
    }

    if (body.action === "charge_mobile_money") {
      const network = normalizeMomoNetwork(body.network);
      const phone = normalizeGhanaPhone(body.phone);
      if (!network) return json({ error: "unsupported_network" }, 400);
      if (!phone || phone.length < 10) return json({ error: "invalid_phone" }, 400);

      const reference = `STM_${businessId.slice(0, 8)}_${Date.now()}`;
      const amount = planAmount(body.plan);

      const { data: payment, error: paymentInsertError } = await admin
        .from("payments")
        .insert({
          business_id: businessId,
          subscription_id: sub?.id ?? null,
          requested_plan: body.plan,
          plan: body.plan,
          billing_cycle: PLAN_CONFIG[body.plan].billingCycle,
          amount_ghs: amount,
          amount_paid_ghs: null,
          currency: "GHS",
          method: "paystack_momo",
          status: "pending",
          reference,
          paystack_reference: reference,
          payer_name: body.payer_name?.trim() || profile?.display_name || user.email || "",
          payer_phone: phone,
          network,
          submitted_by: user.id,
          gateway_status: "pending",
          note: `Paystack Ghana MoMo prompt (${network})`,
        })
        .select("*")
        .single();
      if (paymentInsertError) return json({ error: paymentInsertError.message }, 400);

      const chargeRes = await fetch(`${PAYSTACK_BASE}/charge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: amount * 100,
          currency: "GHS",
          reference,
          mobile_money: {
            phone,
            provider: network,
          },
          metadata: {
            business_id: businessId,
            requested_plan: body.plan,
            user_id: user.id,
            payment_id: payment.id,
            flow: "mobile_money",
            network,
          },
        }),
      });
      const chargeData = await chargeRes.json();

      if (!chargeRes.ok || !chargeData.status) {
        const message = chargeData?.message || "Paystack could not send the mobile money prompt";
        const rawCode = String(chargeData?.data?.status || chargeData?.code || "");
        const reviewReason = /duplicate|amount_exceed_limit/i.test(`${message} ${rawCode}`)
          ? "duplicate_payment"
          : null;

        if (reviewReason) {
          await markPaymentForReview(admin, payment, {
            gatewayStatus: rawCode || "charge_failed",
            gatewayMessage: message,
            reference,
            amountPaidGhs: null,
            reviewReason,
            providerResponse: chargeData,
            providerTransactionId: chargeData?.data?.id ?? null,
            eventSource: "paystack_momo",
            network,
          });
          return json({
            success: false,
            error: "payment_flagged_for_review",
            message,
            payment_id: payment.id,
            reference,
            payment_status: "review",
            gateway_status: rawCode || "charge_failed",
            review_reason: reviewReason,
            details: chargeData,
          });
        }

        await markTerminalPaymentState(admin, payment, {
          paymentStatus: "failed",
          gatewayStatus: rawCode || "charge_failed",
          gatewayMessage: message,
          reference,
          amountPaidGhs: null,
          providerTransactionId: chargeData?.data?.id ?? null,
          providerResponse: chargeData,
          eventSource: "paystack_momo",
          network,
        });
        return json({
          success: false,
          error: "mobile_money_charge_failed",
          message,
          payment_id: payment.id,
          reference,
          payment_status: "failed",
          gateway_status: rawCode || "charge_failed",
          details: chargeData,
        });
      }

      await admin.from("payments").update({
        gateway_status: chargeData.data?.status ?? "pending",
        gateway_message: chargeData.data?.display_text ?? chargeData.message ?? "Payment prompt sent",
        provider_transaction_id: chargeData.data?.id ? String(chargeData.data.id) : null,
        provider_response: chargeData,
      }).eq("id", payment.id);

      await recordPaymentEvent(admin, {
        paymentId: payment.id,
        businessId,
        eventSource: "paystack_momo",
        eventType: "mobile_money_prompt_sent",
        status: "pending",
        message: chargeData.data?.display_text ?? "Please complete authorization on your phone",
        payload: {
          reference,
          network,
          gateway_status: chargeData.data?.status ?? null,
          provider_transaction_id: chargeData.data?.id ? String(chargeData.data.id) : null,
        },
      });

      return json({
        success: true,
        payment_id: payment.id,
        reference,
        status: chargeData.data?.status ?? "pending",
        display_text: chargeData.data?.display_text ?? "Please complete authorization on your phone",
        timeout_seconds: 180,
      });
    }

    if (body.action === "check_charge") {
      const { data: payment } = await admin
        .from("payments")
        .select("*")
        .eq("id", body.payment_id)
        .eq("business_id", businessId)
        .maybeSingle();
      if (!payment) return json({ error: "payment_not_found" }, 404);

      if (payment.method !== "paystack_momo") {
        return json({ error: "unsupported_payment_method" }, 400);
      }

      const reference = payment.paystack_reference || payment.reference;
      const chargeRes = await fetch(`${PAYSTACK_BASE}/charge/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${paystackSecret}` },
      });
      const chargeData = await chargeRes.json();
      if (!chargeRes.ok || !chargeData.status) {
        return json({ error: "charge_status_failed", details: chargeData }, 400);
      }

      const gatewayStatus = String(chargeData.data?.status ?? "pending").toLowerCase();
      const gatewayMessage = chargeData.data?.gateway_response || chargeData.data?.message || chargeData.message || "";
      const amountPaidGhs = typeof chargeData.data?.amount === "number" ? chargeData.data.amount / 100 : null;
      const providerTransactionId = chargeData.data?.id ? String(chargeData.data.id) : null;

      if (gatewayStatus === "success" && amountPaidGhs !== null) {
        const result = await activateSubscriptionForPayment(admin, payment, {
          amountPaidGhs,
          gatewayStatus,
          gatewayMessage,
          reference,
          providerTransactionId,
          providerResponse: chargeData,
          eventSource: "paystack_momo_poll",
          network: payment.network,
        });
        return json({
          success: true,
          payment_status: result.status,
          gateway_status: gatewayStatus,
          review_reason: result.status === "review" ? "admin_review_required" : null,
          expires_at: result.expiresAt,
        });
      }

      if (body.force_timeout && isPendingGatewayStatus(gatewayStatus)) {
        await markTerminalPaymentState(admin, payment, {
          paymentStatus: "timeout",
          gatewayStatus,
          gatewayMessage: gatewayMessage || "The mobile money confirmation window expired",
          reference,
          amountPaidGhs,
          providerTransactionId,
          providerResponse: chargeData,
          eventSource: "paystack_momo_poll",
          network: payment.network,
        });
        return json({ success: true, payment_status: "timeout", gateway_status: gatewayStatus });
      }

      const paymentStatus = mapGatewayStatusToPaymentStatus(gatewayStatus);
      if (paymentStatus === "pending") {
        await markTerminalPaymentState(admin, payment, {
          paymentStatus: "pending",
          gatewayStatus,
          gatewayMessage,
          reference,
          amountPaidGhs,
          providerTransactionId,
          providerResponse: chargeData,
          eventSource: "paystack_momo_poll",
          network: payment.network,
        });
      } else if (paymentStatus === "review") {
        await markPaymentForReview(admin, payment, {
          gatewayStatus,
          gatewayMessage,
          reference,
          amountPaidGhs,
          providerTransactionId,
          providerResponse: chargeData,
          eventSource: "paystack_momo_poll",
          reviewReason: "unknown_gateway_status",
          network: payment.network,
        });
      } else {
        await markTerminalPaymentState(admin, payment, {
          paymentStatus: paymentStatus as "failed" | "cancelled",
          gatewayStatus,
          gatewayMessage,
          reference,
          amountPaidGhs,
          providerTransactionId,
          providerResponse: chargeData,
          eventSource: "paystack_momo_poll",
          network: payment.network,
        });
      }

      return json({
        success: true,
        payment_status: paymentStatus,
        gateway_status: gatewayStatus,
        message: gatewayMessage,
      });
    }

    if (body.action === "verify") {
      const ref = body.reference;
      if (!ref) return json({ error: "bad_reference" }, 400);

      const { data: payment } = await admin
        .from("payments")
        .select("*")
        .eq("paystack_reference", ref)
        .eq("business_id", businessId)
        .maybeSingle();
      if (!payment) return json({ error: "payment_not_found" }, 404);

      const verifyRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Bearer ${paystackSecret}` },
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.status) {
        return json({ error: "verify_failed", details: verifyData }, 400);
      }

      const gatewayStatus = String(verifyData.data?.status ?? "pending").toLowerCase();
      const gatewayMessage = verifyData.data?.gateway_response || verifyData.message || "";
      const amountPaidGhs = typeof verifyData.data?.amount === "number" ? verifyData.data.amount / 100 : null;
      const providerTransactionId = verifyData.data?.id ? String(verifyData.data.id) : null;

      if (gatewayStatus === "success" && amountPaidGhs !== null) {
        const result = await activateSubscriptionForPayment(admin, payment, {
          amountPaidGhs,
          gatewayStatus,
          gatewayMessage,
          reference: ref,
          providerTransactionId,
          providerResponse: verifyData,
          eventSource: "paystack_checkout_verify",
          network: payment.network,
        });
        return json({
          success: true,
          status: result.status,
          expires_at: result.expiresAt,
        });
      }

      const paymentStatus = mapGatewayStatusToPaymentStatus(gatewayStatus);
      if (paymentStatus === "pending") {
        await markTerminalPaymentState(admin, payment, {
          paymentStatus: "pending",
          gatewayStatus,
          gatewayMessage,
          reference: ref,
          amountPaidGhs,
          providerTransactionId,
          providerResponse: verifyData,
          eventSource: "paystack_checkout_verify",
          network: payment.network,
        });
      } else if (paymentStatus === "review") {
        await markPaymentForReview(admin, payment, {
          gatewayStatus,
          gatewayMessage,
          reference: ref,
          amountPaidGhs,
          providerTransactionId,
          providerResponse: verifyData,
          eventSource: "paystack_checkout_verify",
          reviewReason: "unknown_gateway_status",
          network: payment.network,
        });
      } else {
        await markTerminalPaymentState(admin, payment, {
          paymentStatus: paymentStatus as "failed" | "cancelled",
          gatewayStatus,
          gatewayMessage,
          reference: ref,
          amountPaidGhs,
          providerTransactionId,
          providerResponse: verifyData,
          eventSource: "paystack_checkout_verify",
          network: payment.network,
        });
      }

      return json({
        success: true,
        status: paymentStatus,
        message: gatewayMessage,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

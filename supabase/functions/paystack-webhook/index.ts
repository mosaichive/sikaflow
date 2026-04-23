import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { activateSubscriptionForPayment } from "../_shared/payment-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) {
      return json({ error: "paystack_not_configured" }, 500);
    }

    const payloadText = await req.text();
    const signature = req.headers.get("x-paystack-signature") ?? "";
    const expected = await hmacSha512Hex(paystackSecret, payloadText);
    if (!signature || signature !== expected) {
      return json({ error: "invalid_signature" }, 401);
    }

    const event = JSON.parse(payloadText);
    if (event?.event !== "charge.success") {
      return json({ success: true, ignored: true });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const reference = event?.data?.reference;
    if (!reference) return json({ success: true, ignored: true });

    let { data: payment } = await admin
      .from("payments")
      .select("*")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (!payment) {
      const fallback = await admin
        .from("payments")
        .select("*")
        .eq("reference", reference)
        .maybeSingle();
      payment = fallback.data;
    }

    if (!payment) return json({ success: true, ignored: true, reason: "payment_not_found" });

    const amountPaidGhs = typeof event?.data?.amount === "number" ? event.data.amount / 100 : 0;
    const providerTransactionId = event?.data?.id ? String(event.data.id) : null;
    const gatewayMessage = event?.data?.gateway_response || "Charge successful";

    const result = await activateSubscriptionForPayment(admin, payment, {
      amountPaidGhs,
      gatewayStatus: "success",
      gatewayMessage,
      reference,
      providerTransactionId,
      providerResponse: event,
      eventSource: "paystack_webhook",
      network: payment.network,
    });

    return json({
      success: true,
      payment_status: result.status,
      expires_at: result.expiresAt,
    });
  } catch (error) {
    console.error("paystack-webhook error", error);
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});

async function hmacSha512Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

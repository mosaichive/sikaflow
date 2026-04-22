// Paystack initialize + verify for tenant subscription payments.
// On successful verification, marks the tenant payment as confirmed and
// advances the subscription (active, period start/end set).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLAN_PRICES: Record<string, number> = { monthly: 50, annual: 500 };
const PAYSTACK_BASE = "https://api.paystack.co";

interface InitBody {
  action: "initialize";
  plan: "monthly" | "annual";
  callback_url?: string;
}
interface VerifyBody {
  action: "verify";
  reference: string;
}
interface StatusBody {
  action: "status";
}
type Body = InitBody | VerifyBody | StatusBody;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

    // Lightweight status probe — no auth required, used by Billing & Super Admin UI
    // to know whether Paystack is wired up at platform level.
    let earlyBody: Body | null = null;
    try { earlyBody = (await req.clone().json()) as Body; } catch { /* ignore */ }
    if (earlyBody?.action === "status") {
      return json({ configured: !!PAYSTACK_SECRET_KEY });
    }

    if (!PAYSTACK_SECRET_KEY) return json({ error: "paystack_not_configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find user's business
    const { data: profile } = await admin
      .from("profiles").select("business_id").eq("user_id", user.id).maybeSingle();
    const businessId = profile?.business_id;
    if (!businessId) return json({ error: "no_business" }, 400);

    const body = (await req.json()) as Body;

    if (body.action === "initialize") {
      const plan = body.plan;
      const amount = PLAN_PRICES[plan];
      if (!amount) return json({ error: "bad_plan" }, 400);

      const reference = `ST_${businessId.slice(0, 8)}_${Date.now()}`;

      const initRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: amount * 100, // pesewas
          currency: "GHS",
          reference,
          callback_url: body.callback_url,
          metadata: { business_id: businessId, plan, user_id: user.id },
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok || !initData.status) {
        return json({ error: "paystack_init_failed", details: initData }, 400);
      }

      // Record pending payment so super admin sees it
      const { data: sub } = await admin.from("subscriptions")
        .select("id").eq("business_id", businessId).maybeSingle();
      await admin.from("payments").insert({
        business_id: businessId,
        plan,
        amount_ghs: amount,
        method: "paystack",
        status: "pending",
        reference,
        paystack_reference: reference,
        payer_name: user.email ?? "",
        submitted_by: user.id,
        subscription_id: sub?.id ?? null,
        note: "Initiated via Paystack online checkout",
      });

      return json({
        success: true,
        authorization_url: initData.data.authorization_url,
        access_code: initData.data.access_code,
        reference: initData.data.reference,
      });
    }

    if (body.action === "verify") {
      const ref = body.reference;
      if (!ref) return json({ error: "bad_reference" }, 400);

      const vRes = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      });
      const vData = await vRes.json();
      if (!vRes.ok || !vData.status) return json({ error: "verify_failed", details: vData }, 400);

      const status = vData.data?.status; // 'success' on paid
      const { data: pay } = await admin.from("payments")
        .select("*").eq("paystack_reference", ref).maybeSingle();
      if (!pay) return json({ error: "payment_not_found" }, 404);
      if (pay.business_id !== businessId) return json({ error: "forbidden" }, 403);

      if (status === "success" && pay.status !== "confirmed") {
        const days = pay.plan === "annual" ? 365 : 30;
        const start = new Date();
        const end = new Date(start.getTime() + days * 86400000);

        await admin.from("payments").update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        }).eq("id", pay.id);

        await admin.from("subscriptions").update({
          plan: pay.plan,
          status: "active",
          price_ghs: PLAN_PRICES[pay.plan] ?? 0,
          current_period_start: start.toISOString(),
          current_period_end: end.toISOString(),
          next_renewal_date: end.toISOString(),
          trial_end_date: null,
        }).eq("business_id", businessId);

        return json({ success: true, status: "confirmed" });
      }

      return json({ success: true, status: pay.status });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

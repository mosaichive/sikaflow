import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  device_id?: string;
  referral_token?: string;
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? "";
}

function statusForReason(reason: string) {
  if (["duplicate_device", "duplicate_ip", "manual_flag"].includes(reason)) return "flagged";
  return "invalid";
}

function isActiveAnnualSubscription(subscription?: {
  plan?: string | null;
  status?: string | null;
  current_period_end?: string | null;
} | null) {
  return !!(
    subscription?.plan === "annual"
    && subscription?.status === "active"
    && subscription.current_period_end
    && new Date(subscription.current_period_end) > new Date()
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const body = (await req.json().catch(() => ({}))) as Body;
    const fallbackToken = body.referral_token?.trim() || "";
    const rawMetadata = user.user_metadata ?? {};
    const referralToken = String(rawMetadata.referral_token ?? fallbackToken ?? "").trim();
    const deviceId = String(body.device_id ?? rawMetadata.signup_device_id ?? "").trim();
    const userAgent = req.headers.get("user-agent") ?? "";
    const signupIp = getClientIp(req);

    const { data: profile } = await admin
      .from("profiles")
      .select("business_id, phone, referred_by_user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const existingReferralRes = await admin
      .from("referrals")
      .select("*")
      .eq("referred_user_id", user.id)
      .maybeSingle();
    const existingReferral = existingReferralRes.data;

    const clearMetadataToken = async () => {
      if (!rawMetadata.referral_token) return;
      const nextMetadata = { ...rawMetadata };
      delete nextMetadata.referral_token;
      await admin.auth.admin.updateUserById(user.id, { user_metadata: nextMetadata });
    };

    if (existingReferral) {
      await admin
        .from("referrals")
        .update({
          referred_business_id: profile?.business_id ?? existingReferral.referred_business_id ?? null,
          referred_phone: profile?.phone ?? existingReferral.referred_phone ?? null,
          referred_device_id: deviceId || existingReferral.referred_device_id || null,
          referred_signup_ip: signupIp || existingReferral.referred_signup_ip || null,
          referred_user_agent: userAgent || existingReferral.referred_user_agent || null,
          referred_email: user.email ?? existingReferral.referred_email ?? null,
        })
        .eq("id", existingReferral.id);

      if (!profile?.referred_by_user_id && existingReferral.referrer_user_id) {
        await admin
          .from("profiles")
          .update({
            referred_by_user_id: existingReferral.referrer_user_id,
            referral_claimed_at: existingReferral.created_at,
          })
          .eq("user_id", user.id);
      }

      await clearMetadataToken();
      return json({
        success: true,
        has_referral: true,
        claimed: false,
        status: existingReferral.status,
      });
    }

    if (!referralToken) {
      return json({ success: true, has_referral: false, claimed: false });
    }

    const { data: account } = await admin
      .from("referral_accounts")
      .select("*")
      .eq("referral_code", referralToken)
      .maybeSingle();

    if (!account) {
      await clearMetadataToken();
      return json({ success: true, has_referral: false, claimed: false, reason: "invalid_token" });
    }

    const [{ data: referrerBusiness }, { data: referrerSubscription }, ownerAuthRes, { data: ownerProfile }] = await Promise.all([
      admin.from("businesses").select("id, owner_user_id, email, phone").eq("id", account.business_id).maybeSingle(),
      admin.from("subscriptions").select("plan, status, current_period_start, current_period_end").eq("business_id", account.business_id).maybeSingle(),
      admin.auth.admin.getUserById(account.owner_user_id),
      admin.from("profiles").select("phone").eq("user_id", account.owner_user_id).maybeSingle(),
    ]);

    if (!referrerBusiness?.owner_user_id) {
      await clearMetadataToken();
      return json({ success: true, has_referral: false, claimed: false, reason: "missing_owner" });
    }

    let currentCycleCount = Number(account.current_cycle_rewarded_count ?? 0);
    let cycleStart = account.current_cycle_started_at
      ?? referrerSubscription?.current_period_start
      ?? new Date().toISOString();
    let cycleEnd = account.current_cycle_ends_at
      ?? referrerSubscription?.current_period_end
      ?? null;

    if (isActiveAnnualSubscription(referrerSubscription)) {
      const existingCycleEnd = account.current_cycle_ends_at ? new Date(account.current_cycle_ends_at) : null;
      const shouldResetCycle = !existingCycleEnd || existingCycleEnd <= new Date();
      if (shouldResetCycle) {
        cycleStart = new Date().toISOString();
        cycleEnd = referrerSubscription?.current_period_end ?? cycleEnd;
        currentCycleCount = 0;
        await admin
          .from("referral_accounts")
          .update({
            current_cycle_started_at: cycleStart,
            current_cycle_ends_at: cycleEnd,
            current_cycle_rewarded_count: 0,
          })
          .eq("id", account.id);
      } else if (!account.current_cycle_started_at || !account.current_cycle_ends_at) {
        await admin
          .from("referral_accounts")
          .update({
            current_cycle_started_at: cycleStart,
            current_cycle_ends_at: cycleEnd,
          })
          .eq("id", account.id);
      }
    }

    const referrerEmail = ownerAuthRes.data.user?.email?.trim().toLowerCase() ?? "";
    const referredEmail = user.email?.trim().toLowerCase() ?? "";
    const referrerPhone = normalizePhone(ownerProfile?.phone ?? referrerBusiness.phone);
    const referredPhone = normalizePhone(profile?.phone);

    let validationReason = "";
    if (user.id === account.owner_user_id) {
      validationReason = "self_referral";
    } else if (referrerEmail && referredEmail && referrerEmail === referredEmail) {
      validationReason = "duplicate_email";
    } else if (referrerPhone && referredPhone && referrerPhone === referredPhone) {
      validationReason = "duplicate_phone";
    } else if (!isActiveAnnualSubscription(referrerSubscription)) {
      validationReason = "referrer_ineligible";
    } else if (currentCycleCount >= 3) {
      validationReason = "limit_reached";
    } else if (deviceId) {
      const { data: duplicateDevice } = await admin
        .from("referrals")
        .select("id")
        .eq("referrer_user_id", account.owner_user_id)
        .eq("referred_device_id", deviceId)
        .neq("status", "invalid")
        .limit(1)
        .maybeSingle();
      if (duplicateDevice?.id) validationReason = "duplicate_device";
    }

    if (!validationReason && signupIp) {
      const { data: duplicateIp } = await admin
        .from("referrals")
        .select("id")
        .eq("referrer_user_id", account.owner_user_id)
        .eq("referred_signup_ip", signupIp)
        .neq("status", "invalid")
        .limit(1)
        .maybeSingle();
      if (duplicateIp?.id) validationReason = "duplicate_ip";
    }

    const status = validationReason ? statusForReason(validationReason) : "pending";

    const insertPayload = {
      referral_account_id: account.id,
      referrer_user_id: account.owner_user_id,
      referrer_business_id: account.business_id,
      referred_user_id: user.id,
      referred_business_id: profile?.business_id ?? null,
      referral_code: referralToken,
      status,
      validation_reason: validationReason,
      referred_email: user.email ?? null,
      referred_phone: profile?.phone ?? null,
      referred_device_id: deviceId || null,
      referred_signup_ip: signupIp || null,
      referred_user_agent: userAgent || null,
      cycle_started_at: cycleStart,
      cycle_ends_at: cycleEnd,
    };

    const { data: inserted, error: insertError } = await admin
      .from("referrals")
      .insert(insertPayload)
      .select("*")
      .single();
    if (insertError) return json({ error: insertError.message }, 400);

    if (status === "pending") {
      await admin
        .from("profiles")
        .update({
          referred_by_user_id: account.owner_user_id,
          referral_claimed_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    await clearMetadataToken();

    return json({
      success: true,
      has_referral: true,
      claimed: status === "pending",
      status,
      referral_id: inserted.id,
      reason: validationReason || null,
    });
  } catch (error) {
    console.error("claim-referral error", error);
    return json({ error: String((error as Error)?.message ?? error) }, 500);
  }
});

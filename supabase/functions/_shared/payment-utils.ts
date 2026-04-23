export const PLAN_CONFIG = {
  monthly: { amountGhs: 50, billingDays: 30, billingCycle: "monthly", label: "Monthly" },
  annual: { amountGhs: 500, billingDays: 365, billingCycle: "annual", label: "Annual" },
} as const;

export const MOMO_NETWORKS = {
  mtn: { code: "mtn", label: "MTN MoMo" },
  vod: { code: "vod", label: "Telecel Cash" },
  atl: { code: "atl", label: "AirtelTigo Money" },
} as const;

export type SupportedPlan = keyof typeof PLAN_CONFIG;
export type SupportedMomoNetwork = keyof typeof MOMO_NETWORKS;

const EXACT_AMOUNT_EPSILON = 0.001;

export function planAmount(plan: SupportedPlan): number {
  return PLAN_CONFIG[plan].amountGhs;
}

export function planLabel(plan: SupportedPlan): string {
  return PLAN_CONFIG[plan].label;
}

export function resolvePlanFromAmount(amountGhs: number): SupportedPlan | null {
  const match = (Object.entries(PLAN_CONFIG) as [SupportedPlan, typeof PLAN_CONFIG[SupportedPlan]][])
    .find(([, cfg]) => Math.abs(cfg.amountGhs - amountGhs) < EXACT_AMOUNT_EPSILON);
  return match?.[0] ?? null;
}

export function reviewReasonFromAmount(amountGhs: number): string {
  const amounts = Object.values(PLAN_CONFIG).map((cfg) => cfg.amountGhs).sort((a, b) => a - b);
  if (amountGhs < amounts[0]) return "underpaid";
  if (amountGhs > amounts[amounts.length - 1]) return "overpaid";
  return "amount_mismatch";
}

export function normalizeMomoNetwork(input: string): SupportedMomoNetwork | null {
  const normalized = input.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) return null;
  if (["mtn", "mtnmomo"].includes(normalized)) return "mtn";
  if (["vod", "telecel", "telecelcash", "vodafone", "vodafonecash"].includes(normalized)) return "vod";
  if (["atl", "airteltigo", "airteltigomoney", "airtelmoney", "atmoney"].includes(normalized)) return "atl";
  return null;
}

export function normalizeGhanaPhone(input: string): string {
  const compact = input.trim().replace(/[^\d+]/g, "");
  if (!compact) return "";
  if (compact.startsWith("+233") && compact.length >= 13) return `0${compact.slice(4)}`;
  if (compact.startsWith("233") && compact.length >= 12) return `0${compact.slice(3)}`;
  if (compact.startsWith("0")) return compact;
  if (/^\d{9}$/.test(compact)) return `0${compact}`;
  return compact;
}

export function toWhatsappPhone(input: string): string {
  const local = normalizeGhanaPhone(input);
  if (!local) return "";
  if (local.startsWith("+")) return local;
  if (local.startsWith("0") && local.length >= 10) return `+233${local.slice(1)}`;
  if (local.startsWith("233")) return `+${local}`;
  return `+${local}`;
}

export function isPendingGatewayStatus(status: string | null | undefined): boolean {
  return ["pending", "ongoing", "processing", "pay_offline"].includes((status ?? "").toLowerCase());
}

export function mapGatewayStatusToPaymentStatus(status: string | null | undefined): string {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "success") return "confirmed";
  if (["abandoned", "cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (normalized === "reversed") return "failed";
  if (isPendingGatewayStatus(normalized)) return "pending";
  if (normalized === "failed") return "failed";
  return "review";
}

export function isTerminalPaymentStatus(status: string | null | undefined): boolean {
  return ["confirmed", "failed", "cancelled", "timeout", "review", "rejected", "refunded"].includes((status ?? "").toLowerCase());
}

export async function recordPaymentEvent(
  admin: any,
  {
    paymentId,
    businessId,
    eventSource,
    eventType,
    status,
    message,
    payload,
  }: {
    paymentId: string;
    businessId: string;
    eventSource: string;
    eventType: string;
    status: string;
    message?: string | null;
    payload?: Record<string, unknown> | null;
  },
) {
  await admin.from("payment_events").insert({
    payment_id: paymentId,
    business_id: businessId,
    event_source: eventSource,
    event_type: eventType,
    status,
    message: message ?? "",
    payload: payload ?? {},
  });
}

export async function markPaymentForReview(
  admin: any,
  payment: any,
  {
    gatewayStatus,
    gatewayMessage,
    reference,
    providerTransactionId,
    amountPaidGhs,
    reviewReason,
    providerResponse,
    eventSource,
    resolvedPlan,
    duplicateOfPaymentId,
    network,
  }: {
    gatewayStatus: string;
    gatewayMessage?: string | null;
    reference?: string | null;
    providerTransactionId?: string | number | null;
    amountPaidGhs?: number | null;
    reviewReason: string;
    providerResponse?: Record<string, unknown> | null;
    eventSource: string;
    resolvedPlan?: SupportedPlan | null;
    duplicateOfPaymentId?: string | null;
    network?: string | null;
  },
) {
  const nextProviderTransactionId = providerTransactionId ? String(providerTransactionId) : null;
  const isNoop =
    payment.status === "review" &&
    payment.gateway_status === gatewayStatus &&
    payment.review_reason === reviewReason &&
    (payment.provider_transaction_id ?? null) === nextProviderTransactionId;

  if (isNoop) return;

  await admin.from("payments").update({
    status: "review",
    requested_plan: payment.requested_plan ?? payment.plan,
    resolved_plan: resolvedPlan ?? null,
    plan: resolvedPlan ?? payment.plan,
    billing_cycle: resolvedPlan ? PLAN_CONFIG[resolvedPlan].billingCycle : payment.billing_cycle ?? payment.plan,
    gateway_status: gatewayStatus,
    gateway_message: gatewayMessage ?? null,
    amount_paid_ghs: amountPaidGhs ?? null,
    provider_transaction_id: nextProviderTransactionId,
    provider_response: providerResponse ?? {},
    review_reason: reviewReason,
    duplicate_of_payment_id: duplicateOfPaymentId ?? null,
    paystack_reference: reference ?? payment.paystack_reference ?? payment.reference,
    reference: reference ?? payment.reference,
    network: network ?? payment.network ?? null,
  }).eq("id", payment.id);

  await recordPaymentEvent(admin, {
    paymentId: payment.id,
    businessId: payment.business_id,
    eventSource,
    eventType: "payment_review",
    status: "review",
    message: gatewayMessage ?? reviewReason,
    payload: {
      review_reason: reviewReason,
      gateway_status: gatewayStatus,
      amount_paid_ghs: amountPaidGhs ?? null,
      resolved_plan: resolvedPlan ?? null,
      duplicate_of_payment_id: duplicateOfPaymentId ?? null,
      reference: reference ?? payment.reference ?? null,
      provider_transaction_id: providerTransactionId ? String(providerTransactionId) : null,
    },
  });
}

export async function markTerminalPaymentState(
  admin: any,
  payment: any,
  {
    paymentStatus,
    gatewayStatus,
    gatewayMessage,
    reference,
    providerTransactionId,
    amountPaidGhs,
    providerResponse,
    eventSource,
    network,
  }: {
    paymentStatus: "pending" | "failed" | "cancelled" | "timeout";
    gatewayStatus: string;
    gatewayMessage?: string | null;
    reference?: string | null;
    providerTransactionId?: string | number | null;
    amountPaidGhs?: number | null;
    providerResponse?: Record<string, unknown> | null;
    eventSource: string;
    network?: string | null;
  },
) {
  const nextProviderTransactionId = providerTransactionId ? String(providerTransactionId) : null;
  const isNoop =
    payment.status === paymentStatus &&
    payment.gateway_status === gatewayStatus &&
    (payment.provider_transaction_id ?? null) === nextProviderTransactionId &&
    (payment.amount_paid_ghs ?? null) === (amountPaidGhs ?? null);

  if (isNoop) return;

  await admin.from("payments").update({
    status: paymentStatus,
    gateway_status: gatewayStatus,
    gateway_message: gatewayMessage ?? null,
    amount_paid_ghs: amountPaidGhs ?? null,
    provider_transaction_id: nextProviderTransactionId,
    provider_response: providerResponse ?? {},
    paystack_reference: reference ?? payment.paystack_reference ?? payment.reference,
    reference: reference ?? payment.reference,
    network: network ?? payment.network ?? null,
  }).eq("id", payment.id);

  await recordPaymentEvent(admin, {
    paymentId: payment.id,
    businessId: payment.business_id,
    eventSource,
    eventType: "payment_status",
    status: paymentStatus,
    message: gatewayMessage ?? gatewayStatus,
    payload: {
      gateway_status: gatewayStatus,
      amount_paid_ghs: amountPaidGhs ?? null,
      reference: reference ?? payment.reference ?? null,
      provider_transaction_id: providerTransactionId ? String(providerTransactionId) : null,
    },
  });
}

async function maybeSendPaymentConfirmation(
  admin: any,
  payment: any,
  {
    resolvedPlan,
    amountPaidGhs,
    expiresAt,
    reference,
  }: {
    resolvedPlan: SupportedPlan;
    amountPaidGhs: number;
    expiresAt: string;
    reference: string;
  },
): Promise<boolean> {
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
  const phone = toWhatsappPhone(payment.payer_phone ?? "");

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !phone) return false;

  const body = [
    "SikaFlow payment confirmed.",
    `${planLabel(resolvedPlan)} plan activated for GH₵${amountPaidGhs.toFixed(2)}.`,
    `Access valid until ${new Date(expiresAt).toLocaleDateString("en-GB")}.`,
    `Reference: ${reference}.`,
  ].join("\n");

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: `whatsapp:${phone}`,
      From: TWILIO_WHATSAPP_FROM,
      Body: body,
    }),
  });

  if (!response.ok) {
    const result = await response.text();
    await recordPaymentEvent(admin, {
      paymentId: payment.id,
      businessId: payment.business_id,
      eventSource: "system",
      eventType: "notification_failed",
      status: "warning",
      message: "WhatsApp confirmation could not be sent",
      payload: { response: result },
    });
    return false;
  }

  await admin.from("payments").update({
    notification_sent_at: new Date().toISOString(),
  }).eq("id", payment.id);

  await recordPaymentEvent(admin, {
    paymentId: payment.id,
    businessId: payment.business_id,
    eventSource: "system",
    eventType: "notification_sent",
    status: "confirmed",
    message: "WhatsApp confirmation sent",
    payload: { channel: "whatsapp" },
  });
  return true;
}

export async function activateSubscriptionForPayment(
  admin: any,
  payment: any,
  {
    amountPaidGhs,
    gatewayStatus,
    gatewayMessage,
    reference,
    providerTransactionId,
    providerResponse,
    eventSource,
    network,
  }: {
    amountPaidGhs: number;
    gatewayStatus: string;
    gatewayMessage?: string | null;
    reference: string;
    providerTransactionId?: string | number | null;
    providerResponse?: Record<string, unknown> | null;
    eventSource: string;
    network?: string | null;
  },
) {
  if (payment.status === "confirmed") {
    return { status: "confirmed", duplicate: false, expiresAt: payment.expires_at ?? null };
  }

  const resolvedPlan = resolvePlanFromAmount(amountPaidGhs);
  if (!resolvedPlan) {
    await markPaymentForReview(admin, payment, {
      gatewayStatus,
      gatewayMessage,
      reference,
      providerTransactionId,
      amountPaidGhs,
      reviewReason: reviewReasonFromAmount(amountPaidGhs),
      providerResponse,
      eventSource,
      network,
    });
    return { status: "review", duplicate: false, expiresAt: null };
  }

  const { data: confirmedRows } = await admin
    .from("payments")
    .select("id, reference, paystack_reference, provider_transaction_id")
    .eq("business_id", payment.business_id)
    .eq("status", "confirmed")
    .neq("id", payment.id);

  const duplicate = ((confirmedRows ?? []) as any[]).find((row) => {
    if (providerTransactionId && row.provider_transaction_id === String(providerTransactionId)) return true;
    if (reference && (row.reference === reference || row.paystack_reference === reference)) return true;
    return false;
  });

  if (duplicate) {
    await markPaymentForReview(admin, payment, {
      gatewayStatus,
      gatewayMessage,
      reference,
      providerTransactionId,
      amountPaidGhs,
      reviewReason: "duplicate_payment",
      providerResponse,
      eventSource,
      resolvedPlan,
      duplicateOfPaymentId: duplicate.id,
      network,
    });
    return { status: "review", duplicate: true, expiresAt: null };
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("business_id", payment.business_id)
    .maybeSingle();

  const now = new Date();
  const activeEnd = sub?.current_period_end && new Date(sub.current_period_end) > now
    ? new Date(sub.current_period_end)
    : now;
  const nextEnd = new Date(activeEnd.getTime() + PLAN_CONFIG[resolvedPlan].billingDays * 86400000);
  const nextStart = sub?.current_period_end && new Date(sub.current_period_end) > now
    ? sub.current_period_start ?? now.toISOString()
    : now.toISOString();
  const activationTime = new Date().toISOString();

  await admin.from("subscriptions").update({
    plan: resolvedPlan,
    status: "active",
    price_ghs: PLAN_CONFIG[resolvedPlan].amountGhs,
    current_period_start: nextStart,
    current_period_end: nextEnd.toISOString(),
    next_renewal_date: nextEnd.toISOString(),
    trial_end_date: null,
  }).eq("business_id", payment.business_id);

  await admin.from("payments").update({
    status: "confirmed",
    requested_plan: payment.requested_plan ?? payment.plan,
    resolved_plan: resolvedPlan,
    plan: resolvedPlan,
    billing_cycle: PLAN_CONFIG[resolvedPlan].billingCycle,
    gateway_status: gatewayStatus,
    gateway_message: gatewayMessage ?? null,
    amount_paid_ghs: amountPaidGhs,
    provider_transaction_id: providerTransactionId ? String(providerTransactionId) : null,
    provider_response: providerResponse ?? {},
    paystack_reference: reference,
    reference,
    network: network ?? payment.network ?? null,
    confirmed_at: activationTime,
    activated_at: activationTime,
    expires_at: nextEnd.toISOString(),
    review_reason: null,
    duplicate_of_payment_id: null,
  }).eq("id", payment.id);

  await recordPaymentEvent(admin, {
    paymentId: payment.id,
    businessId: payment.business_id,
    eventSource,
    eventType: "payment_confirmed",
    status: "confirmed",
    message: gatewayMessage ?? "Payment confirmed and subscription activated",
    payload: {
      resolved_plan: resolvedPlan,
      amount_paid_ghs: amountPaidGhs,
      reference,
      provider_transaction_id: providerTransactionId ? String(providerTransactionId) : null,
      expires_at: nextEnd.toISOString(),
    },
  });

  if (payment.submitted_by) {
    await admin.from("platform_audit_log").insert({
      action: "auto_activate_subscription",
      target_business_id: payment.business_id,
      details: {
        payment_id: payment.id,
        plan: resolvedPlan,
        amount_paid_ghs: amountPaidGhs,
        reference,
        event_source: eventSource,
        expires_at: nextEnd.toISOString(),
      },
      performed_by: payment.submitted_by,
      performed_by_email: payment.payer_name ?? null,
    });
  }

  await maybeSendPaymentConfirmation(admin, payment, {
    resolvedPlan,
    amountPaidGhs,
    expiresAt: nextEnd.toISOString(),
    reference,
  });

  return { status: "confirmed", duplicate: false, expiresAt: nextEnd.toISOString(), resolvedPlan };
}

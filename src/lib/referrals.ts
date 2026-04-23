import type { Subscription } from '@/context/SubscriptionContext';
import type { Business } from '@/context/BusinessContext';

export const REFERRAL_SLOT_LIMIT = 3;
const REFERRAL_DEVICE_KEY = 'sikaflow.referral.device';
const REFERRAL_TOKEN_KEY = 'sikaflow.referral.pending';

export type ReferralStatus = 'pending' | 'successful' | 'rewarded' | 'flagged' | 'invalid';

export function getOrCreateReferralDeviceId() {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(REFERRAL_DEVICE_KEY);
  if (existing) return existing;
  const created = window.crypto?.randomUUID?.() ?? `ref-${Date.now()}`;
  window.localStorage.setItem(REFERRAL_DEVICE_KEY, created);
  return created;
}

export function setPendingReferralToken(token: string) {
  if (typeof window === 'undefined') return;
  const trimmed = token.trim();
  if (!trimmed) return;
  window.localStorage.setItem(REFERRAL_TOKEN_KEY, trimmed);
}

export function getPendingReferralToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(REFERRAL_TOKEN_KEY) ?? '';
}

export function clearPendingReferralToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(REFERRAL_TOKEN_KEY);
}

export function buildReferralSignupLink(code: string) {
  if (!code) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/sign-up?ref=${encodeURIComponent(code)}`;
}

export function buildReferralWhatsappLink(link: string, businessName?: string) {
  if (!link) return '';
  const intro = businessName
    ? `Join me on SikaFlow for ${businessName}.`
    : 'Join me on SikaFlow.';
  return `https://wa.me/?text=${encodeURIComponent(`${intro} Use my referral link to get started: ${link}`)}`;
}

export function canAccessReferrals({
  subscription,
  business,
  userId,
  isAdmin,
}: {
  subscription: Subscription | null;
  business: Business | null;
  userId?: string | null;
  isAdmin: boolean;
}) {
  if (!subscription || !business || !userId || !isAdmin) return false;
  if (business.owner_user_id !== userId) return false;
  if (subscription.plan !== 'annual' || subscription.status !== 'active') return false;
  if (!subscription.current_period_end) return true;
  return new Date(subscription.current_period_end) > new Date();
}

export function referralStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'successful':
      return 'Successful';
    case 'rewarded':
      return 'Rewarded';
    case 'flagged':
      return 'Flagged';
    case 'invalid':
      return 'Invalid';
    default:
      return status;
  }
}

export function referralReasonLabel(reason?: string | null) {
  switch (reason) {
    case 'self_referral':
      return 'Self referral blocked';
    case 'duplicate_device':
      return 'Duplicate device detected';
    case 'duplicate_ip':
      return 'Duplicate IP detected';
    case 'duplicate_email':
      return 'Duplicate email detected';
    case 'duplicate_phone':
      return 'Duplicate phone detected';
    case 'referrer_ineligible':
      return 'Referrer is not eligible';
    case 'limit_reached':
      return 'Referral limit reached';
    case 'missing_business':
      return 'Referred business not created yet';
    case 'manual_flag':
      return 'Flagged by admin';
    default:
      return reason?.replaceAll('_', ' ') ?? '';
  }
}

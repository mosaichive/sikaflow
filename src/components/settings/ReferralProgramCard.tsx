import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Gift, Link2, MessageCircle, Share2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  REFERRAL_SLOT_LIMIT,
  buildReferralSignupLink,
  buildReferralWhatsappLink,
  canAccessReferrals,
  referralReasonLabel,
  referralStatusLabel,
} from '@/lib/referrals';

type ReferralAccountRow = {
  id: string;
  business_id: string;
  owner_user_id: string;
  referral_code: string;
  current_cycle_started_at: string | null;
  current_cycle_ends_at: string | null;
  current_cycle_rewarded_count: number;
  lifetime_rewarded_count: number;
  last_reward_applied_at: string | null;
};

type ReferralRow = {
  id: string;
  status: string;
  validation_reason: string | null;
  referred_email: string | null;
  referred_phone: string | null;
  subscribed_plan: string | null;
  converted_at: string | null;
  reward_applied_at: string | null;
  reward_months: number;
  created_at: string;
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ReferralProgramCard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { business, businessId } = useBusiness();
  const { subscription } = useSubscription();
  const { toast } = useToast();
  const [account, setAccount] = useState<ReferralAccountRow | null>(null);
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwnerAdmin = !!user && !!business && business.owner_user_id === user.id && isAdmin;
  const eligible = canAccessReferrals({
    subscription,
    business,
    userId: user?.id,
    isAdmin,
  });

  const load = useCallback(async () => {
    if (!businessId || !isOwnerAdmin) {
      setAccount(null);
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [accountRes, rowsRes] = await Promise.all([
      supabase
        .from('referral_accounts' as any)
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase
        .from('referrals' as any)
        .select('id,status,validation_reason,referred_email,referred_phone,subscribed_plan,converted_at,reward_applied_at,reward_months,created_at')
        .eq('referrer_business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    setAccount((accountRes.data as ReferralAccountRow | null) ?? null);
    setRows((rowsRes.data as ReferralRow[]) ?? []);
    setLoading(false);
  }, [businessId, isOwnerAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!businessId || !isOwnerAdmin) return;
    const channel = supabase
      .channel(`referrals:${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_accounts', filter: `business_id=eq.${businessId}` }, () => {
        void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals', filter: `referrer_business_id=eq.${businessId}` }, () => {
        void load();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, isOwnerAdmin, load]);

  const referralLink = useMemo(
    () => buildReferralSignupLink(account?.referral_code ?? ''),
    [account?.referral_code],
  );
  const usedCount = account?.current_cycle_rewarded_count ?? 0;
  const remainingSlots = Math.max(REFERRAL_SLOT_LIMIT - usedCount, 0);
  const whatsappLink = useMemo(
    () => buildReferralWhatsappLink(referralLink, business?.name),
    [business?.name, referralLink],
  );

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast({ title: 'Referral link copied' });
  };

  const shareLink = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join SikaFlow',
          text: `Use my SikaFlow referral link to get started with ${business?.name ?? 'my business'}.`,
          url: referralLink,
        });
        return;
      } catch {
        // fall back to copy below
      }
    }
    await copyLink();
  };

  if (!isOwnerAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4" />
          Annual Referral Program
        </CardTitle>
        <CardDescription>
          Active annual subscriptions can unlock up to 3 extra free months per renewal cycle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading referral tools...</p>
        ) : !eligible ? (
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Referrals unlock on the active annual plan.</p>
                <p className="text-xs text-muted-foreground">
                  Monthly users and expired annual plans cannot use referral rewards. Renew the annual plan to reopen your 3 referral slots.
                </p>
              </div>
              <Badge variant="outline">
                {subscription?.plan === 'annual' && subscription?.status !== 'active' ? 'Paused' : 'Locked'}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate('/billing')}>
                View annual plan
              </Button>
              <span className="self-center text-xs text-muted-foreground">
                Referral access resets on the next annual renewal.
              </span>
            </div>
          </div>
        ) : (
          <>
            {!account?.referral_code ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Preparing your referral link. Refresh this page in a moment if it does not appear automatically.
              </div>
            ) : (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Your secure referral link</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share this link with new businesses. A reward only applies after the referred signup becomes a paid subscription.
                  </p>
                </div>
                <Badge variant="secondary">Annual active</Badge>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input readOnly value={referralLink} className="pl-9" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    WhatsApp
                  </Button>
                  <Button type="button" size="sm" onClick={() => void shareLink()}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="Referrals used" value={`${usedCount}/${REFERRAL_SLOT_LIMIT}`} hint="Successful paid referrals this cycle" />
              <Metric
                label="Rewards earned"
                value={`+${account?.lifetime_rewarded_count ?? 0} month${Number(account?.lifetime_rewarded_count ?? 0) === 1 ? '' : 's'}`}
                hint={`This cycle: +${usedCount} month${usedCount === 1 ? '' : 's'}`}
              />
              <Metric label="Remaining slots" value={`${remainingSlots}`} hint={account?.current_cycle_ends_at ? `Cycle ends ${formatDate(account.current_cycle_ends_at)}` : 'Resets on annual renewal'} />
            </div>

            {remainingSlots === 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
                Referral limit reached. Resets on next annual renewal.
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Referral activity</p>
                  <p className="text-xs text-muted-foreground">Track signups, conversions, and reward status for this annual cycle.</p>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No referrals yet. Share your link to start earning extra free months.
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map((row) => {
                    const detail = row.status === 'pending'
                      ? 'Signup completed. Waiting for first paid subscription.'
                      : row.status === 'rewarded'
                        ? `Reward applied ${formatDate(row.reward_applied_at)}`
                        : row.validation_reason
                          ? referralReasonLabel(row.validation_reason)
                          : row.converted_at
                            ? `Converted ${formatDate(row.converted_at)}`
                            : 'Awaiting validation';

                    return (
                      <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.referred_email || row.referred_phone || 'New signup'}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(row.created_at)}
                            {row.subscribed_plan ? ` · ${row.subscribed_plan}` : ''}
                            {detail ? ` · ${detail}` : ''}
                          </p>
                        </div>
                        <Badge variant={row.status === 'rewarded' ? 'default' : row.status === 'pending' ? 'secondary' : 'outline'}>
                          {referralStatusLabel(row.status)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/15 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

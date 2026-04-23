import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useToast } from '@/hooks/use-toast';

type ReferralNoticeRow = {
  id: string;
  status: string;
  referred_email: string | null;
  updated_at: string;
  reward_months: number;
};

const SEEN_PREFIX = 'sikaflow.referral.notice';
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function seenKey(id: string, status: string) {
  return `${SEEN_PREFIX}.${id}.${status}`;
}

export function ReferralNotifications() {
  const { user } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const hydratedRef = useRef(false);

  const notify = useCallback((row: ReferralNoticeRow, allowRecentReplay = false) => {
    if (!['successful', 'rewarded'].includes(row.status)) return;
    const key = seenKey(row.id, row.status);
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(key)) return;

    const updatedAt = new Date(row.updated_at).getTime();
    const isRecent = Date.now() - updatedAt <= RECENT_WINDOW_MS;
    if (allowRecentReplay && !isRecent) {
      window.localStorage.setItem(key, row.updated_at);
      return;
    }
    if (!allowRecentReplay && !hydratedRef.current) {
      window.localStorage.setItem(key, row.updated_at);
      return;
    }
    if (!allowRecentReplay && !isRecent) {
      window.localStorage.setItem(key, row.updated_at);
      return;
    }

    toast({
      title: row.status === 'rewarded' ? 'Referral reward applied' : 'Referral successful',
      description: row.status === 'rewarded'
        ? `A paid referral${row.referred_email ? ` from ${row.referred_email}` : ''} added ${row.reward_months || 1} free month to your annual plan.`
        : `${row.referred_email || 'A referred signup'} completed a paid subscription.`,
    });
    window.localStorage.setItem(key, row.updated_at);
  }, [toast]);

  const loadRecent = useCallback(async () => {
    if (!user?.id || !businessId) return;
    const { data } = await supabase
      .from('referrals' as any)
      .select('id,status,referred_email,updated_at,reward_months')
      .eq('referrer_user_id', user.id)
      .eq('referrer_business_id', businessId)
      .in('status', ['successful', 'rewarded'])
      .order('updated_at', { ascending: false })
      .limit(8);

    ((data as ReferralNoticeRow[]) ?? []).forEach((row) => notify(row, true));
    hydratedRef.current = true;
  }, [businessId, notify, user?.id]);

  useEffect(() => {
    hydratedRef.current = false;
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`referral-notices:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals', filter: `referrer_user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as ReferralNoticeRow | null;
        if (!row || (businessId && (payload.new as any)?.referrer_business_id !== businessId)) return;
        notify(row, true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, notify, user?.id]);

  return null;
}

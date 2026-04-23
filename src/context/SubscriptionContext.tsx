import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';

export type PlanKey = 'free_trial' | 'monthly' | 'annual' | 'lifetime';
export type SubStatus = 'trial' | 'active' | 'overdue' | 'expired' | 'suspended' | 'canceled' | 'lifetime';

export interface Subscription {
  id: string;
  business_id: string;
  plan: PlanKey;
  status: SubStatus;
  price_ghs: number;
  trial_start_date: string | null;
  trial_end_date: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_renewal_date: string | null;
  cancel_at_period_end: boolean;
  discount_percent: number;
  notes: string | null;
}

interface SubContextType {
  subscription: Subscription | null;
  loading: boolean;
  hasAccess: boolean;       // can use full app
  isReadOnly: boolean;      // expired / suspended / canceled — only billing+settings
  daysRemaining: number | null;
  refresh: () => Promise<void>;
  isSuperAdmin: boolean;
}

const SubContext = createContext<SubContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { businessId, loading: bizLoading } = useBusiness();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  // Start in loading state and stay there until auth+business+subscription are all resolved.
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Wait until upstream contexts finish — prevents a flash of "no access".
    if (authLoading || bizLoading) return;

    if (!user) {
      setSubscription(null);
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    // Detect super_admin (separate from per-business role table check)
    const { data: superRow } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'super_admin' as any)
      .maybeSingle();
    setIsSuperAdmin(!!superRow);

    if (!businessId) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('subscriptions' as any)
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle();
    setSubscription((data as any) ?? null);
    setLoading(false);
  }, [user, businessId, authLoading, bizLoading]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase.channel(`subscription:${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `business_id=eq.${businessId}` },
        () => { void load(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [businessId, load]);

  const computeAccess = (): { hasAccess: boolean; daysRemaining: number | null } => {
    if (!subscription) return { hasAccess: false, daysRemaining: null };
    if (subscription.status === 'lifetime') return { hasAccess: true, daysRemaining: null };
    const endRaw = subscription.trial_end_date ?? subscription.current_period_end;
    const days = endRaw ? Math.ceil((new Date(endRaw).getTime() - Date.now()) / 86400000) : null;
    if (subscription.status === 'trial' && subscription.trial_end_date && new Date(subscription.trial_end_date) > new Date())
      return { hasAccess: true, daysRemaining: days };
    if (subscription.status === 'active' && (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date()))
      return { hasAccess: true, daysRemaining: days };
    return { hasAccess: false, daysRemaining: days };
  };

  const { hasAccess, daysRemaining } = computeAccess();
  const isReadOnly = !hasAccess && !!subscription;

  return (
    <SubContext.Provider value={{
      subscription, loading, hasAccess, isReadOnly, daysRemaining,
      refresh: load, isSuperAdmin,
    }}>
      {children}
    </SubContext.Provider>
  );
}

export const useSubscription = () => {
  const ctx = useContext(SubContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
};

export const PLAN_LABELS: Record<PlanKey, string> = {
  free_trial: '30-Day Free Trial',
  monthly: 'Monthly',
  annual: 'Annual',
  lifetime: 'Lifetime',
};

export const PLAN_PRICES: Record<PlanKey, number> = {
  free_trial: 0, monthly: 50, annual: 500, lifetime: 0,
};

export const STATUS_LABELS: Record<SubStatus, string> = {
  trial: 'Free Trial', active: 'Active', overdue: 'Overdue',
  expired: 'Expired', suspended: 'Suspended', canceled: 'Canceled', lifetime: 'Lifetime',
};

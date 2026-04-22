import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';

export interface Business {
  id: string;
  name: string;
  slug: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  number_of_employees: number | null;
  owner_user_id: string | null;
  status: string;
  email_verified: boolean;
  phone_verified: boolean;
}

interface BusinessContextType {
  business: Business | null;
  businessId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  hasBusiness: boolean;
  isActivated: boolean;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async (showLoading = false) => {
    // Reuse in-flight request to prevent duplicate concurrent loads
    if (inFlightRef.current) return inFlightRef.current;

    const run = (async () => {
      if (!user) {
        setBusiness(null);
        setLoading(false);
        hasLoadedOnceRef.current = true;
        return;
      }
      // Only flip the global loading flag on the very first load (or when explicitly asked).
      // Background refreshes must NOT toggle loading or every consumer (route guards) will
      // unmount their children — that was causing the verify page to "reload" repeatedly.
      if (showLoading || !hasLoadedOnceRef.current) setLoading(true);

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('business_id')
          .eq('user_id', user.id)
          .maybeSingle();

        const bizId = (profile as any)?.business_id as string | undefined;
        if (!bizId) {
          setBusiness(null);
          return;
        }
        const { data: biz } = await supabase
          .from('businesses' as any)
          .select('*')
          .eq('id', bizId)
          .maybeSingle();
        setBusiness((biz as any) ?? null);
      } finally {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    })();

    inFlightRef.current = run.finally(() => { inFlightRef.current = null; });
    return inFlightRef.current;
  }, [user]);

  useEffect(() => {
    // Reset on user change so a sign-out / sign-in shows the loader once.
    hasLoadedOnceRef.current = false;
    void load(true);
  }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  return (
    <BusinessContext.Provider
      value={{
        business,
        businessId: business?.id ?? null,
        loading,
        refresh,
        hasBusiness: !!business,
        isActivated: business?.status === 'active',
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export const useBusiness = () => {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used within BusinessProvider');
  return ctx;
};

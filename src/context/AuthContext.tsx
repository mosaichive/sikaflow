import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { clearPendingReferralToken, getOrCreateReferralDeviceId, getPendingReferralToken } from '@/lib/referrals';

export type AppRole = 'admin' | 'manager' | 'staff' | 'super_admin' | 'salesperson' | 'distributor';

interface ProfileData {
  display_name: string;
  avatar_url: string;
  title: string;
  phone: string;
  bio: string;
  onboarding_completed: boolean;
}

function isMissingProfileColumnError(error: unknown, column: string) {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  const details = String((error as { details?: string } | null)?.details || '').toLowerCase();
  const target = column.toLowerCase();
  return (
    (message.includes(target) && (message.includes('schema cache') || message.includes('column'))) ||
    (details.includes(target) && (details.includes('schema cache') || details.includes('column')))
  );
}

export interface AppUser {
  id: string;
  email: string;
  user_metadata: {
    display_name?: string;
    avatar_url?: string;
    full_name?: string;
  };
}

interface AppSession {
  userId: string;
}

interface AuthContextType {
  user: AppUser | null;
  session: AppSession | null;
  loading: boolean;
  role: AppRole | null;
  displayName: string;
  avatarUrl: string;
  profileTitle: string;
  profilePhone: string;
  profileBio: string;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isSalesperson: boolean;
  isDistributor: boolean;
  isSuperAdmin: boolean;
  onboardingCompleted: boolean;
}

const emptyProfile: ProfileData = {
  display_name: '',
  avatar_url: '',
  title: '',
  phone: '',
  bio: '',
  onboarding_completed: false,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const user = useMemo<AppUser | null>(() => {
    const authUser = session?.user;
    if (!authUser) return null;

    const displayName =
      authUser.user_metadata?.display_name ||
      authUser.user_metadata?.full_name ||
      authUser.email?.split('@')[0] ||
      'User';

    return {
      id: authUser.id,
      email: authUser.email ?? '',
      user_metadata: {
        display_name: displayName,
        avatar_url: authUser.user_metadata?.avatar_url,
        full_name: authUser.user_metadata?.full_name,
      },
    };
  }, [session]);

  const fetchRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error) {
      console.warn('Unable to load user role. Check Supabase auth and RLS policies.', error.message);
      setRole(null);
      return null;
    }

    const roles = ((data || []) as Array<{ role: AppRole }>).map((row) => row.role);
    const priority: AppRole[] = ['super_admin', 'admin', 'manager', 'salesperson', 'distributor', 'staff'];
    const nextRole = priority.find((candidate) => roles.includes(candidate)) || null;
    setRole(nextRole);
    return nextRole;
  }, []);

  const fetchProfile = useCallback(async (userId?: string) => {
    const uid = userId || user?.id;
    if (!uid) return { found: false, error: false };

    let { data, error } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, title, phone, bio, onboarding_completed')
      .eq('user_id', uid)
      .maybeSingle();

    if (error && isMissingProfileColumnError(error, 'onboarding_completed')) {
      const fallbackResult = await supabase
        .from('profiles')
        .select('display_name, avatar_url, title, phone, bio')
        .eq('user_id', uid)
        .maybeSingle();
      data = fallbackResult.data ? { ...fallbackResult.data, onboarding_completed: false } : null;
      error = fallbackResult.error;
    }

    if (error) {
      console.warn('Unable to load user profile. Check Supabase auth and RLS policies.', error.message);
      setProfile(emptyProfile);
      return { found: false, error: true };
    }

    setProfile(data ? {
      display_name: data.display_name || '',
      avatar_url: data.avatar_url || '',
      title: data.title || '',
      phone: data.phone || '',
      bio: data.bio || '',
      onboarding_completed: Boolean((data as any).onboarding_completed),
    } : emptyProfile);
    return { found: !!data, error: false };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadUserData() {
      if (authLoading) return;

      if (!user) {
        setRole(null);
        setProfile(emptyProfile);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const [nextRole, profileResult] = await Promise.all([fetchRole(user.id), fetchProfile(user.id)]);

      if (!cancelled && profileResult && !profileResult.found && !profileResult.error && !nextRole) {
        await supabase.auth.signOut();
        if (typeof window !== 'undefined') {
          window.location.replace('/sign-in?reason=removed');
        }
        return;
      }

      if (!cancelled) setProfileLoading(false);
    }

    void loadUserData();

    return () => {
      cancelled = true;
    };
  }, [authLoading, fetchProfile, fetchRole, user]);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    const syncReferral = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('claim-referral', {
          body: {
            device_id: getOrCreateReferralDeviceId(),
            referral_token: getPendingReferralToken() || undefined,
          },
        });
        if (error) return;
        if ((data as any)?.has_referral || (data as any)?.claimed) {
          clearPendingReferralToken();
        }
      } catch (syncError) {
        console.warn('Referral sync failed', syncError);
      }
    };

    void syncReferral();
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const displayName = profile.display_name || user?.user_metadata.display_name || '';
  const avatarUrl = profile.avatar_url || user?.user_metadata.avatar_url || '';

  return (
    <AuthContext.Provider value={{
      user,
      session: user ? { userId: user.id } : null,
      loading: authLoading || profileLoading,
      role,
      displayName,
      avatarUrl,
      profileTitle: profile.title,
      profilePhone: profile.phone,
      profileBio: profile.bio,
      signOut,
      refreshProfile: async () => {
        if (!user?.id) return;
        await Promise.all([fetchProfile(user.id), fetchRole(user.id)]);
      },
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      isSalesperson: role === 'salesperson',
      isDistributor: role === 'distributor',
      isSuperAdmin: role === 'super_admin',
      onboardingCompleted: profile.onboarding_completed,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

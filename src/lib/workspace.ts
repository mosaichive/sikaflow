import { supabase } from '@/integrations/supabase/client';

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  code?: string;
  hint?: string;
};

type EnsureWorkspaceInput = {
  existingBusinessId?: string | null;
  user: {
    id: string;
    email?: string | null;
  };
  displayName?: string;
  businessName?: string;
  phone?: string;
  location?: string;
  allowCreate?: boolean;
};

function isMissingFunctionError(error: unknown) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  const message = normalized.message?.toLowerCase() ?? '';
  const details = normalized.details?.toLowerCase() ?? '';
  const code = normalized.code?.toUpperCase() ?? '';

  return (
    code === 'PGRST202'
    || message.includes('could not find the function')
    || details.includes('could not find the function')
    || message.includes('schema cache')
  );
}

export function getErrorMessage(error: unknown, fallback = 'Please try again.') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message as string;
  }
  return fallback;
}

export function logSupabaseError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const normalized = (error ?? {}) as SupabaseErrorLike;
  console.error(`[SikaFlow:${context}]`, {
    message: normalized.message ?? (error instanceof Error ? error.message : 'Unknown error'),
    details: normalized.details ?? null,
    code: normalized.code ?? null,
    hint: normalized.hint ?? null,
    ...extra,
    rawError: error,
  });
}

export async function resolveCurrentBusinessId(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return ((data as any)?.business_id as string | null) ?? null;
}

async function fallbackProfileMembership({
  businessId,
  userId,
  displayName,
  email,
  phone,
}: {
  businessId: string;
  userId: string;
  displayName?: string;
  email?: string | null;
  phone?: string;
}) {
  const profilePayload = {
    user_id: userId,
    business_id: businessId,
    display_name: displayName?.trim() || email?.split('@')[0]?.trim() || 'User',
    phone: phone?.trim() || null,
  };

  const { error } = await supabase
    .from('profiles')
    .upsert(profilePayload as never, { onConflict: 'user_id' });

  if (error) throw error;
  return businessId;
}

export async function ensureUserBusinessWorkspace({
  existingBusinessId,
  user,
  displayName,
  businessName,
  phone,
  location,
  allowCreate = true,
}: EnsureWorkspaceInput) {
  const ensureMembership = async (businessId: string) => {
    const { data, error } = await supabase.rpc('ensure_business_workspace_membership', {
      _business_id: businessId,
      _display_name: displayName?.trim() || user.email?.split('@')[0]?.trim() || 'User',
      _phone: phone?.trim() || '',
    });

    if (error) {
      if (isMissingFunctionError(error)) {
        logSupabaseError('workspace.ensureMembershipFallback', error, {
          businessId,
          userId: user.id,
        });
        return fallbackProfileMembership({
          businessId,
          userId: user.id,
          displayName,
          email: user.email,
          phone,
        });
      }
      throw error;
    }
    return (data as string | null) || businessId;
  };

  if (existingBusinessId) {
    return ensureMembership(existingBusinessId);
  }

  const profileBusinessId = await resolveCurrentBusinessId(user.id);
  if (profileBusinessId) {
    return ensureMembership(profileBusinessId);
  }

  if (!allowCreate) {
    return null;
  }

  const fallbackBusinessName =
    businessName?.trim() ||
    displayName?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'My Business';

  const { data, error } = await supabase.rpc('create_business_for_owner', {
    _name: fallbackBusinessName,
    _email: user.email?.trim() || '',
    _phone: phone?.trim() || '',
    _location: location?.trim() || '',
    _employees: 1,
    _logo_light_url: '',
    _logo_dark_url: '',
  });

  if (error) throw error;
  if (!data) throw new Error('Business setup did not return a workspace id.');
  return ensureMembership(data as string);
}

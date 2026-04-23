// Admin-only edge function for per-business user management.
// Supports: invite (with password OR email invite link) and remove.
// Remove preserves historical business records, then deletes the auth account
// so the same email can sign up again later if needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type Action =
  | { action: 'invite'; mode: 'password' | 'email'; email: string; full_name: string; phone?: string; role: 'admin' | 'manager' | 'staff'; password?: string }
  | { action: 'remove'; user_id: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Auth: identify caller
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return json(401, { error: 'Missing authorization' });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json(401, { error: 'Invalid session' });
  const callerId = userRes.user.id;

  // Resolve caller's business + verify admin
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('business_id, display_name')
    .eq('user_id', callerId)
    .maybeSingle();
  const businessId = callerProfile?.business_id;
  if (!businessId) return json(403, { error: 'No business associated with account' });

  const { data: callerRole } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', callerId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (callerRole?.role !== 'admin') return json(403, { error: 'Admin role required' });

  let body: Action;
  try {
    body = (await req.json()) as Action;
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  // ---------- INVITE ----------
  if (body.action === 'invite') {
    const { mode, email, full_name, phone, role } = body;
    if (!email || !full_name || !role) return json(400, { error: 'email, full_name, role required' });
    if (!['admin', 'manager', 'staff'].includes(role)) return json(400, { error: 'Invalid role' });
    if (mode !== 'password' && mode !== 'email') return json(400, { error: 'mode must be password or email' });

    // Block if email already belongs to a user in another business
    const { data: existingByEmail } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existingUser = existingByEmail?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      const { data: existingProfile } = await admin
        .from('profiles')
        .select('business_id')
        .eq('user_id', existingUser.id)
        .maybeSingle();
      if (existingProfile?.business_id && existingProfile.business_id !== businessId) {
        return json(409, { error: 'This email already belongs to another business' });
      }
      if (existingProfile?.business_id === businessId) {
        return json(409, { error: 'This user is already a member of your business' });
      }
    }

    let newUserId: string | null = null;

    if (mode === 'password') {
      if (!body.password || body.password.length < 8) {
        return json(400, { error: 'Password must be at least 8 characters' });
      }
      // Create confirmed user immediately
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { display_name: full_name },
      });
      if (createErr || !created.user) return json(400, { error: createErr?.message || 'Failed to create user' });
      newUserId = created.user.id;
    } else {
      // Email invite
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: full_name },
      });
      if (inviteErr || !invited.user) return json(400, { error: inviteErr?.message || 'Failed to send invite' });
      newUserId = invited.user.id;
    }

    // Link profile to business (handle_new_user trigger may have already created the row)
    await admin
      .from('profiles')
      .upsert(
        {
          user_id: newUserId,
          business_id: businessId,
          display_name: full_name,
          phone: phone || null,
        },
        { onConflict: 'user_id' }
      );

    // Assign role scoped to this business
    await admin
      .from('user_roles')
      .upsert({ user_id: newUserId, business_id: businessId, role }, { onConflict: 'user_id,role' });

    // Audit
    await admin.from('audit_log').insert({
      action: 'user_invited',
      details: `Invited ${full_name} (${email}) as ${role} via ${mode}`,
      performed_by: callerId,
      performed_by_name: callerProfile?.display_name || '',
      business_id: businessId,
    });

    return json(200, { ok: true, user_id: newUserId, mode });
  }

  // ---------- REMOVE ----------
  if (body.action === 'remove') {
    const { user_id } = body;
    if (!user_id) return json(400, { error: 'user_id required' });
    if (user_id === callerId) return json(400, { error: 'You cannot remove yourself' });

    // Verify the target actually belongs to this business
    const { data: target } = await admin
      .from('profiles')
      .select('business_id, display_name')
      .eq('user_id', user_id)
      .maybeSingle();
    if (!target || target.business_id !== businessId) {
      return json(404, { error: 'User is not a member of your business' });
    }

    const targetName = target.display_name || 'Former team member';
    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const targetAuthUser = authUsers?.users?.find((entry) => entry.id === user_id);

    // Keep historical records intact by re-linking the hard FK fields before deleting auth.users.
    const { error: salesError } = await admin
      .from('sales')
      .update({ staff_id: callerId, staff_name: targetName })
      .eq('business_id', businessId)
      .eq('staff_id', user_id);
    if (salesError) return json(500, { error: salesError.message });

    const { error: expensesError } = await admin
      .from('expenses')
      .update({ recorded_by: callerId, recorded_by_name: targetName })
      .eq('business_id', businessId)
      .eq('recorded_by', user_id);
    if (expensesError) return json(500, { error: expensesError.message });

    const { error: deleteError } = await admin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      return json(500, { error: deleteError.message || 'Failed to delete auth user' });
    }

    await admin.from('audit_log').insert({
      action: 'user_removed',
      details: `Removed ${targetName}${targetAuthUser?.email ? ` (${targetAuthUser.email})` : ''} from business`,
      performed_by: callerId,
      performed_by_name: callerProfile?.display_name || '',
      business_id: businessId,
    });

    return json(200, { ok: true, removed_user_id: user_id });
  }

  return json(400, { error: 'Unknown action' });
});

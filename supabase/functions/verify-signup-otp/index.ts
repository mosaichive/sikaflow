// Verify the WhatsApp OTP sent during business registration.
// On success: marks profiles.phone_verified = true and businesses.phone_verified = true.
// If the business email is also already verified, flips business status to 'active'.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { phone, otp } = await req.json();
    if (!phone || !otp) {
      return new Response(JSON.stringify({ error: 'Phone and OTP are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: otpRecord } = await admin
      .from('signup_otps')
      .select('*')
      .eq('phone', phone)
      .eq('user_id', user.id)
      .eq('otp_code', otp)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRecord) {
      // Bump attempts on the latest unused OTP for this user
      const { data: latest } = await admin
        .from('signup_otps')
        .select('id, attempts')
        .eq('phone', phone)
        .eq('user_id', user.id)
        .eq('used', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        const next = (latest.attempts || 0) + 1;
        await admin.from('signup_otps').update({ attempts: next }).eq('id', latest.id);
        if (next >= 5) {
          await admin.from('signup_otps').update({ used: true }).eq('id', latest.id);
          return new Response(JSON.stringify({ error: 'Too many attempts. Please request a new code.' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      return new Response(JSON.stringify({ error: 'Invalid or expired code.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark OTP used + flag profile/business as phone-verified
    await admin.from('signup_otps').update({ used: true }).eq('id', otpRecord.id);
    await admin.from('profiles').update({ phone_verified: true, phone }).eq('user_id', user.id);

    const { data: profile } = await admin
      .from('profiles').select('business_id').eq('user_id', user.id).maybeSingle();

    let activated = false;
    if (profile?.business_id) {
      await admin.from('businesses').update({ phone_verified: true }).eq('id', profile.business_id);
      const { data: biz } = await admin
        .from('businesses').select('email_verified, phone_verified, status').eq('id', profile.business_id).maybeSingle();
      if (biz && biz.email_verified && biz.phone_verified && biz.status !== 'active') {
        await admin.from('businesses').update({ status: 'active' }).eq('id', profile.business_id);
        activated = true;
      }
    }

    return new Response(JSON.stringify({ success: true, activated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('verify-signup-otp error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

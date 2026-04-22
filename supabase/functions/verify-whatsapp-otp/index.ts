const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { phone, otp, new_password } = await req.json()

    if (!phone || !otp || !new_password) {
      return new Response(JSON.stringify({ error: 'Phone, OTP, and new password are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Password validation
    if (new_password.length < 8 || !/[A-Z]/.test(new_password) || !/[a-z]/.test(new_password) || !/[0-9]/.test(new_password)) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters with uppercase, lowercase, and a number' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Find valid OTP
    const { data: otpRecord } = await supabase
      .from('password_reset_otps')
      .select('*')
      .eq('phone', phone)
      .eq('otp_code', otp)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!otpRecord) {
      // Increment attempts on latest OTP for this phone
      const { data: latest } = await supabase
        .from('password_reset_otps')
        .select('id, attempts')
        .eq('phone', phone)
        .eq('used', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latest) {
        await supabase.from('password_reset_otps').update({ attempts: latest.attempts + 1 }).eq('id', latest.id)
        if (latest.attempts + 1 >= 5) {
          await supabase.from('password_reset_otps').update({ used: true }).eq('id', latest.id)
          return new Response(JSON.stringify({ error: 'Too many attempts. Please request a new OTP.' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }

      return new Response(JSON.stringify({ error: 'Invalid or expired OTP code.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Mark OTP as used
    await supabase.from('password_reset_otps').update({ used: true }).eq('id', otpRecord.id)

    // Find user by phone
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('phone', phone)
      .maybeSingle()

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Update password using admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(profile.user_id, {
      password: new_password,
    })

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Log audit
    await supabase.from('audit_log').insert({
      action: 'password_reset_whatsapp',
      details: `Password reset via WhatsApp OTP for phone ${phone}`,
      performed_by: profile.user_id,
    })

    return new Response(JSON.stringify({ success: true, message: 'Password reset successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

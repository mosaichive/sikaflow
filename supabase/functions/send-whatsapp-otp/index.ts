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
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    if (!TWILIO_ACCOUNT_SID) throw new Error('TWILIO_ACCOUNT_SID not configured')

    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    if (!TWILIO_AUTH_TOKEN) throw new Error('TWILIO_AUTH_TOKEN not configured')

    const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886'

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { phone } = await req.json()
    if (!phone || typeof phone !== 'string' || phone.length < 8) {
      return new Response(JSON.stringify({ error: 'Valid phone number required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if phone exists in profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, phone')
      .eq('phone', phone)
      .maybeSingle()

    if (!profile) {
      return new Response(JSON.stringify({ error: 'No account found with that phone number.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Rate limit: max 3 OTPs per phone per 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('password_reset_otps')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', tenMinAgo)

    if ((count || 0) >= 3) {
      return new Response(JSON.stringify({ error: 'Too many reset attempts. Please wait 10 minutes.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Store OTP
    await supabase.from('password_reset_otps').insert({
      phone,
      otp_code: otp,
      expires_at: expiresAt,
    })

    // Format phone for WhatsApp (ensure + prefix)
    const whatsappTo = phone.startsWith('+') ? phone : `+${phone}`

    // Send via Twilio WhatsApp
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: `whatsapp:${whatsappTo}`,
        From: TWILIO_WHATSAPP_FROM,
        Body: `Your SikaFlow password reset code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      console.error('Twilio error:', result)
      return new Response(JSON.stringify({ error: 'Failed to send WhatsApp message. Please try email reset instead.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, message: 'OTP sent via WhatsApp' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Seeds the platform Super Admin (admin@sikaflow.com).
// Idempotent: if the user already exists, only ensures the super_admin role
// and the must_change_password flag are present. Safe to call repeatedly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPER_ADMIN_EMAIL = "admin@sikaflow.com";
const LEGACY_SUPER_ADMIN_EMAIL = "admin@saletallysystem.com";
// Initial password.
const INITIAL_PASSWORD = "@H!ve0107";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Find or create the auth user
    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find((u) => {
      const email = u.email?.toLowerCase();
      return email === SUPER_ADMIN_EMAIL || email === LEGACY_SUPER_ADMIN_EMAIL;
    });

    if (existing) {
      userId = existing.id;
      const meta = (existing.user_metadata ?? {}) as Record<string, unknown>;
      await admin.auth.admin.updateUserById(userId, {
        email: SUPER_ADMIN_EMAIL,
        email_confirm: true,
        password: INITIAL_PASSWORD,
        user_metadata: { ...meta, must_change_password: true, is_super_admin: true, display_name: "Platform Admin" },
      });
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: INITIAL_PASSWORD,
        email_confirm: true,
        user_metadata: {
          display_name: "Platform Admin",
          is_super_admin: true,
          must_change_password: true,
        },
      });
      if (createErr || !created.user) {
        return new Response(JSON.stringify({ error: createErr?.message ?? "create_failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = created.user.id;
    }

    // 2. Ensure the super_admin role row exists (business_id stays NULL — platform-level)
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleRow) {
      await admin.from("user_roles").insert({
        user_id: userId,
        role: "super_admin",
        business_id: null,
      });
    }

    // 3. Ensure a profile exists
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) {
      await admin.from("profiles").insert({
        user_id: userId,
        display_name: "Platform Admin",
        email_verified: true,
      });
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, email: SUPER_ADMIN_EMAIL }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

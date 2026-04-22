-- 1. Backfill: mark Maggs Trove and its members as verified
UPDATE public.businesses
SET email_verified = true, phone_verified = true, status = 'active'
WHERE name = 'Maggs Trove';

-- 2. Add per-user verification flags on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

-- Backfill existing profiles (Maggs Trove members) as verified
UPDATE public.profiles
SET email_verified = true, phone_verified = true
WHERE business_id IS NOT NULL;

-- 3. Signup OTP table (separate from password-reset OTPs)
CREATE TABLE IF NOT EXISTS public.signup_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                 -- nullable: OTP may be sent before account exists
  phone text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_otps_phone_created ON public.signup_otps (phone, created_at DESC);

ALTER TABLE public.signup_otps ENABLE ROW LEVEL SECURITY;
-- No client policies: only edge functions (service role) touch this table.

-- 4. Storage bucket for business logos (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for business-logos
DROP POLICY IF EXISTS "Public read business logos" ON storage.objects;
CREATE POLICY "Public read business logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-logos');

DROP POLICY IF EXISTS "Members upload own business logos" ON storage.objects;
CREATE POLICY "Members upload own business logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-logos'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "Members update own business logos" ON storage.objects;
CREATE POLICY "Members update own business logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

DROP POLICY IF EXISTS "Members delete own business logos" ON storage.objects;
CREATE POLICY "Members delete own business logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND (storage.foldername(name))[1] = public.get_user_business_id(auth.uid())::text
  );

-- 5. Helper: when an authenticated user just signed up, this function
-- creates a business and links them as owner+admin in one transaction.
-- Called from the client right after supabase.auth.signUp succeeds.
CREATE OR REPLACE FUNCTION public.create_business_for_owner(
  _name text,
  _email text,
  _phone text,
  _location text,
  _employees integer,
  _logo_light_url text,
  _logo_dark_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _biz_id uuid;
  _existing uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- One user, one business: bail if they already belong somewhere
  SELECT business_id INTO _existing FROM public.profiles WHERE user_id = _uid;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  INSERT INTO public.businesses
    (name, email, phone, location, number_of_employees, owner_user_id,
     status, email_verified, phone_verified, logo_light_url, logo_dark_url)
  VALUES
    (_name, _email, _phone, _location, COALESCE(_employees, 1), _uid,
     'pending', false, false,
     NULLIF(_logo_light_url, ''), NULLIF(_logo_dark_url, ''))
  RETURNING id INTO _biz_id;

  -- Link profile to business (handle_new_user trigger created the profile row)
  INSERT INTO public.profiles (user_id, business_id, display_name, phone)
  VALUES (_uid, _biz_id, _name, _phone)
  ON CONFLICT (user_id) DO UPDATE
    SET business_id = EXCLUDED.business_id,
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone);

  -- Make the registrant the admin of their business
  INSERT INTO public.user_roles (user_id, role, business_id)
  VALUES (_uid, 'admin'::app_role, _biz_id)
  ON CONFLICT DO NOTHING;

  RETURN _biz_id;
END;
$$;

-- profiles.user_id needs to be unique for the ON CONFLICT above
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_key'
  ) THEN
    -- Only add if no duplicate user_ids exist
    IF NOT EXISTS (
      SELECT user_id FROM public.profiles GROUP BY user_id HAVING COUNT(*) > 1
    ) THEN
      ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
    END IF;
  END IF;
END$$;
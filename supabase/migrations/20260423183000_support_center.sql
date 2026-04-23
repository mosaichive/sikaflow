-- Support center settings and support messages
-- Safe additive migration only.

CREATE TABLE IF NOT EXISTS public.platform_support_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_key text NOT NULL UNIQUE DEFAULT 'default',
  support_email text NOT NULL DEFAULT '',
  phone_number text NOT NULL DEFAULT '',
  whatsapp_number text NOT NULL DEFAULT '',
  whatsapp_link text NOT NULL DEFAULT '',
  office_address text NOT NULL DEFAULT '',
  show_email boolean NOT NULL DEFAULT true,
  show_phone boolean NOT NULL DEFAULT true,
  show_whatsapp boolean NOT NULL DEFAULT true,
  show_office_address boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_support_settings_email_len_chk CHECK (char_length(support_email) <= 160),
  CONSTRAINT platform_support_settings_phone_len_chk CHECK (char_length(phone_number) <= 32),
  CONSTRAINT platform_support_settings_whatsapp_number_len_chk CHECK (char_length(whatsapp_number) <= 32),
  CONSTRAINT platform_support_settings_whatsapp_link_len_chk CHECK (char_length(whatsapp_link) <= 255),
  CONSTRAINT platform_support_settings_address_len_chk CHECK (char_length(office_address) <= 240)
);

INSERT INTO public.platform_support_settings (singleton_key)
VALUES ('default')
ON CONFLICT (singleton_key) DO NOTHING;

ALTER TABLE public.platform_support_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read support settings" ON public.platform_support_settings;
CREATE POLICY "Authenticated users read support settings"
ON public.platform_support_settings
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Super admin manage support settings" ON public.platform_support_settings;
CREATE POLICY "Super admin manage support settings"
ON public.platform_support_settings
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS platform_support_settings_set_updated_at ON public.platform_support_settings;
CREATE TRIGGER platform_support_settings_set_updated_at
BEFORE UPDATE ON public.platform_support_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  sender_name text NOT NULL,
  sender_contact text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_name_len_chk CHECK (char_length(sender_name) BETWEEN 1 AND 120),
  CONSTRAINT support_messages_contact_len_chk CHECK (char_length(sender_contact) BETWEEN 3 AND 160),
  CONSTRAINT support_messages_subject_len_chk CHECK (char_length(subject) BETWEEN 1 AND 140),
  CONSTRAINT support_messages_message_len_chk CHECK (char_length(message) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS support_messages_created_at_idx
  ON public.support_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS support_messages_read_created_idx
  ON public.support_messages (is_read, created_at DESC);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert support messages" ON public.support_messages;
CREATE POLICY "Users insert support messages"
ON public.support_messages
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own support messages" ON public.support_messages;
CREATE POLICY "Users read own support messages"
ON public.support_messages
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Super admin manage support messages" ON public.support_messages;
CREATE POLICY "Super admin manage support messages"
ON public.support_messages
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS support_messages_set_updated_at ON public.support_messages;
CREATE TRIGGER support_messages_set_updated_at
BEFORE UPDATE ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF to_regclass('public.platform_support_settings') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'platform_support_settings'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_support_settings;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.support_messages') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'support_messages'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;

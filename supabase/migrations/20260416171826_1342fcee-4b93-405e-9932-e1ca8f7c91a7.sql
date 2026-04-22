
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS title text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT '';

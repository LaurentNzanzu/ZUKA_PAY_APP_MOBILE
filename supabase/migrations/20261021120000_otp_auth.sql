-- 1. Table OTP principale
CREATE TABLE public.auth_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','sms')),
  provider_message_id text,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_otps_phone_idx ON public.auth_otps(phone, created_at DESC);
CREATE INDEX auth_otps_expiry_idx ON public.auth_otps(expires_at) WHERE NOT is_used;
ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_otps FROM anon, authenticated;
GRANT ALL ON public.auth_otps TO service_role;

-- 2. Table rate limits
CREATE TABLE public.auth_otp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  phone text NOT NULL,
  action text NOT NULL CHECK (action IN ('send','verify')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_otp_rate_limits_ip_idx ON public.auth_otp_rate_limits(ip_address, created_at DESC);
CREATE INDEX auth_otp_rate_limits_phone_idx ON public.auth_otp_rate_limits(phone, created_at DESC);
ALTER TABLE public.auth_otp_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_otp_rate_limits FROM anon, authenticated;
GRANT ALL ON public.auth_otp_rate_limits TO service_role;

-- 3. Lookup phone → user_id (maintenu par trigger)
CREATE TABLE public.user_phones (
  phone text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_phones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_phones FROM anon, authenticated;
GRANT ALL ON public.user_phones TO service_role;

-- 4. Trigger sur auth.users
CREATE OR REPLACE FUNCTION public.sync_user_phones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    INSERT INTO public.user_phones (phone, user_id)
    VALUES (regexp_replace(NEW.phone, '^\+', ''), NEW.id)
    ON CONFLICT (phone) DO UPDATE SET user_id = EXCLUDED.user_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER auth_users_sync_phones
  AFTER INSERT OR UPDATE OF phone ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_phones();

-- 5. Backfill users existants
INSERT INTO public.user_phones (phone, user_id)
SELECT regexp_replace(phone, '^\+', ''), id
FROM auth.users
WHERE phone IS NOT NULL
ON CONFLICT (phone) DO NOTHING;

-- 6. Fonction atomique d'incrémentation (anti race condition)
CREATE OR REPLACE FUNCTION public.increment_otp_attempts(_otp_id uuid, _max_attempts int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new_attempts int;
BEGIN
  UPDATE auth_otps
  SET attempts = attempts + 1,
      is_used = CASE WHEN attempts + 1 >= _max_attempts THEN true ELSE is_used END
  WHERE id = _otp_id AND is_used = false
  RETURNING attempts INTO _new_attempts;
  RETURN COALESCE(_new_attempts, -1);
END; $$;
REVOKE ALL ON FUNCTION public.increment_otp_attempts(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_otp_attempts(uuid, int) TO service_role;
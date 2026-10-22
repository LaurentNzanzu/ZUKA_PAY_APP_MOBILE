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
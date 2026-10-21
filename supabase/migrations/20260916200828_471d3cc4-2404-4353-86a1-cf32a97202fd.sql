CREATE OR REPLACE FUNCTION public.transfer_ownership(_from uuid, _to uuid, _keep_as_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _locked boolean;
BEGIN
  IF _from = _to THEN RAISE EXCEPTION 'CANNOT_TRANSFER_TO_SELF'; END IF;

  SELECT pg_try_advisory_xact_lock(918273645) INTO _locked;
  IF NOT _locked THEN RAISE EXCEPTION 'TRANSFER_IN_PROGRESS'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _from AND role = 'super_admin') THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_accounts WHERE user_id = _to AND status = 'active') THEN
    RAISE EXCEPTION 'TARGET_NOT_ACTIVE_ADMIN';
  END IF;

  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (_to, 'super_admin', _from)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles WHERE user_id = _to AND role = 'admin';
  DELETE FROM public.admin_user_permissions WHERE user_id = _to;
  DELETE FROM public.user_roles WHERE user_id = _from AND role = 'super_admin';

  IF _keep_as_admin THEN
    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (_from, 'admin', _to)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.admin_user_permissions WHERE user_id = _from;
    DELETE FROM public.admin_accounts WHERE user_id = _from;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid, boolean) TO service_role;
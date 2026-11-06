CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(_user_id uuid, _email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _locked boolean;
BEGIN
  SELECT pg_try_advisory_xact_lock(918273646) INTO _locked;
  IF NOT _locked THEN RAISE EXCEPTION 'BOOTSTRAP_IN_PROGRESS'; END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role, granted_by) VALUES (_user_id, 'super_admin', _user_id);
  INSERT INTO public.admin_accounts (user_id, email, status) VALUES (_user_id, _email, 'active')
    ON CONFLICT (user_id) DO UPDATE SET status = 'active';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.bootstrap_super_admin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_super_admin(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;

CREATE OR REPLACE FUNCTION public.is_active_admin(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT (auth.uid() IS NULL OR _user_id = auth.uid()) AND EXISTS (
    SELECT 1 FROM public.admin_accounts a JOIN public.user_roles r ON r.user_id = a.user_id
    WHERE a.user_id = _user_id AND a.status = 'active' AND r.role IN ('admin','super_admin')); $$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT (auth.uid() IS NULL OR _user_id = auth.uid()) AND public.is_active_admin(_user_id) AND (
    public.has_role(_user_id, 'super_admin')
    OR EXISTS (SELECT 1 FROM public.admin_user_permissions p WHERE p.user_id = _user_id AND p.permission = _permission)); $$;

CREATE OR REPLACE FUNCTION public.is_tontine_admin(_user_id uuid, _tontine_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT (auth.uid() IS NULL OR _user_id = auth.uid()) AND EXISTS (
    SELECT 1 FROM public.tontine_members m WHERE m.tontine_id = _tontine_id AND m.user_id = _user_id
      AND m.status = 'active' AND m.role = 'admin'); $$;

CREATE OR REPLACE FUNCTION public.is_tontine_member(_user_id uuid, _tontine_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT (auth.uid() IS NULL OR _user_id = auth.uid()) AND EXISTS (
    SELECT 1 FROM public.tontine_members m WHERE m.tontine_id = _tontine_id AND m.user_id = _user_id AND m.status = 'active'); $$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role), public.is_active_admin(uuid), public.has_permission(uuid, text),
  public.is_tontine_admin(uuid, uuid), public.is_tontine_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role), public.is_active_admin(uuid), public.has_permission(uuid, text),
  public.is_tontine_admin(uuid, uuid), public.is_tontine_member(uuid, uuid) TO authenticated, service_role;
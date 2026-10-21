
REVOKE ALL ON FUNCTION public.apply_payment_success(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transfer_ownership(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_tontine_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tontine_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_admin(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_tontine_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tontine_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_success(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid, boolean) TO service_role;

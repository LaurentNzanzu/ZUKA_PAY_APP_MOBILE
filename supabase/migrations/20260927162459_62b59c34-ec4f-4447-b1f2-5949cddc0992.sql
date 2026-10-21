CREATE OR REPLACE FUNCTION public.run_group_governance(_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record; p public.tontine_members%ROWTYPE; s public.tontine_members%ROWTYPE;
  n_succ int := 0; n_arch int := 0; n_rescue int := 0;
BEGIN
  FOR t IN SELECT * FROM public.tontines WHERE archived_at IS NULL LOOP
    IF t.last_financial_activity_at < _now - interval '6 months' THEN
      UPDATE public.tontines SET archived_at = _now, status = 'archived' WHERE id = t.id;
      INSERT INTO public.group_activity (tontine_id, kind, message)
      VALUES (t.id, 'group', 'Groupe archivé automatiquement : aucune cotisation ni abonnement payé depuis 6 mois. L''historique financier est conservé.');
      n_arch := n_arch + 1; CONTINUE;
    END IF;
    IF t.admin_last_active_at < _now - interval '6 months' THEN
      SELECT * INTO p FROM public.tontine_members WHERE tontine_id = t.id AND role = 'admin' AND status = 'active' LIMIT 1;
      SELECT * INTO s FROM public.tontine_members WHERE tontine_id = t.id AND role = 'co_admin' AND status = 'active' LIMIT 1;
      IF s.id IS NOT NULL THEN
        UPDATE public.tontine_members SET role = 'member', admin_permissions = '{}' WHERE id = p.id;
        UPDATE public.tontine_members SET role = 'admin', admin_permissions = '{}' WHERE id = s.id;
        UPDATE public.tontines SET admin_last_active_at = _now, needs_second_admin = true WHERE id = t.id;
        INSERT INTO public.group_admin_changes (tontine_id, old_principal, new_principal, old_second, new_second, trigger_action, reason)
        VALUES (t.id, p.id, s.id, s.id, NULL, 'auto_succession', 'Administrateur principal inactif depuis 6 mois');
        INSERT INTO public.group_activity (tontine_id, kind, message)
        VALUES (t.id, 'group', s.name || ' devient administrateur principal (principal inactif depuis 6 mois).');
        INSERT INTO public.notifications(user_id, tontine_id, kind, title, body, channel, status, sent_at)
        SELECT m.user_id, t.id, 'group', 'Nouvel administrateur principal',
          s.name || ' est maintenant administrateur principal de ' || t.name || '.', 'in_app', 'sent', _now
        FROM public.tontine_members m WHERE m.tontine_id = t.id AND m.status = 'active' AND m.user_id IS NOT NULL;
        n_succ := n_succ + 1;
      ELSIF NOT EXISTS (SELECT 1 FROM public.system_events WHERE area = 'governance' AND detail->>'tontine_id' = t.id::text AND created_at > _now - interval '30 days') THEN
        INSERT INTO public.system_events (area, level, message, detail)
        VALUES ('governance', 'warn', 'Groupe sans administrateur actif ni deuxième administrateur : intervention ZUKA PAY requise', jsonb_build_object('tontine_id', t.id, 'name', t.name));
        n_rescue := n_rescue + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('successions', n_succ, 'archived', n_arch, 'rescue', n_rescue);
END; $function$;
CREATE OR REPLACE FUNCTION public.sync_group_subscription(_tontine_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tontines%ROWTYPE;
  _start date; _k int; _ps date; _pe date; _n int; _len int;
  _payer uuid; _tier public.group_pricing_tiers%ROWTYPE; _sub record;
BEGIN
  SELECT * INTO t FROM public.tontines WHERE id = _tontine_id;
  IF NOT FOUND THEN RETURN; END IF;
  _start := (t.created_at AT TIME ZONE 'Africa/Lubumbashi')::date;

  INSERT INTO public.group_subscriptions(group_ref, group_name, member_count, tier_label, price_locked, currency,
    period_start, period_end, status, tontine_id, cycle_idx, due_date)
  VALUES (t.id::text, t.name, 0, 'Mois gratuit', 0, 'USD', _start, (_start + interval '1 month')::date - 1,
    'free', t.id, 0, _start)
  ON CONFLICT (tontine_id, cycle_idx) DO NOTHING;

  _len := cardinality(t.sub_payer_order);
  IF t.launched_at IS NULL OR t.sub_payer_mode IS NULL OR _len = 0 THEN RETURN; END IF;

  _k := 1;
  LOOP
    _ps := (_start + make_interval(months => _k))::date;
    EXIT WHEN _ps > current_date;
    IF (_start + make_interval(months => _k + 1))::date - 1 >= (t.launched_at AT TIME ZONE 'Africa/Lubumbashi')::date
       AND NOT EXISTS (SELECT 1 FROM public.group_subscriptions WHERE tontine_id = t.id AND cycle_idx = _k) THEN
      _pe := (_start + make_interval(months => _k + 1))::date - 1;
      SELECT count(*) INTO _n FROM public.tontine_members WHERE tontine_id = t.id AND status = 'active';
      SELECT * INTO _tier FROM public.group_pricing_tiers
        WHERE active AND effective_from <= _ps AND min_members <= GREATEST(_n, 1)
          AND (max_members IS NULL OR max_members >= _n)
        ORDER BY min_members DESC, effective_from DESC LIMIT 1;
      IF NOT FOUND THEN
        SELECT * INTO _tier FROM public.group_pricing_tiers WHERE active ORDER BY min_members ASC LIMIT 1;
      END IF;
      IF t.sub_next_payer IS NOT NULL THEN
        _payer := t.sub_next_payer;
        UPDATE public.tontines SET sub_next_payer = NULL WHERE id = t.id;
        t.sub_next_payer := NULL;
      ELSIF t.sub_payer_mode = 'same' THEN
        _payer := t.sub_payer_order[1];
      ELSE
        _payer := t.sub_payer_order[((_k - 1) % _len) + 1];
      END IF;
      INSERT INTO public.group_subscriptions(group_ref, group_name, member_count, tier_id, tier_label, price_locked,
        currency, period_start, period_end, status, tontine_id, cycle_idx, payer_member_id, due_date)
      VALUES (t.id::text, t.name, _n, _tier.id, _tier.label, COALESCE(_tier.price, 0), COALESCE(_tier.currency, 'USD'),
        _ps, _pe, CASE WHEN COALESCE(_tier.price, 0) > 0 THEN 'pending' ELSE 'free' END, t.id, _k, _payer, _ps);
      INSERT INTO public.group_activity(tontine_id, kind, message)
      VALUES (t.id, 'subscription', 'Nouvel abonnement mensuel du ' || _ps || ' : ' || COALESCE(_tier.price,0) || ' ' || COALESCE(_tier.currency,'USD'));
    END IF;
    _k := _k + 1;
  END LOOP;

  UPDATE public.group_subscriptions SET status = 'overdue'
  WHERE tontine_id = t.id AND status = 'pending' AND due_date < current_date;

  FOR _sub IN SELECT s.id, s.status, s.price_locked, s.currency, s.due_date, m.user_id
              FROM public.group_subscriptions s JOIN public.tontine_members m ON m.id = s.payer_member_id
              WHERE s.tontine_id = t.id AND s.status IN ('pending','overdue') AND m.user_id IS NOT NULL LOOP
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE dedupe_key = 'sub:' || _sub.id || ':' || _sub.status) THEN
      INSERT INTO public.notifications(user_id, tontine_id, kind, title, body, channel, status, sent_at, dedupe_key)
      VALUES (_sub.user_id, t.id, 'subscription',
        CASE WHEN _sub.status = 'overdue' THEN 'Abonnement du groupe en retard' ELSE 'Abonnement du groupe à payer' END,
        t.name || ' : ' || _sub.price_locked || ' ' || _sub.currency || ' (échéance ' || _sub.due_date || ')',
        'in_app', 'sent', now(), 'sub:' || _sub.id || ':' || _sub.status);
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_group_subscription(uuid) FROM PUBLIC, anon, authenticated;
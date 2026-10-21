ALTER TABLE public.tontines
  ADD COLUMN IF NOT EXISTS launched_at timestamptz,
  ADD COLUMN IF NOT EXISTS sub_payer_mode text,
  ADD COLUMN IF NOT EXISTS sub_payer_order uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sub_next_payer uuid,
  ADD COLUMN IF NOT EXISTS sub_allow_others boolean NOT NULL DEFAULT false;

ALTER TABLE public.group_subscriptions
  ADD COLUMN IF NOT EXISTS tontine_id uuid REFERENCES public.tontines(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cycle_idx integer,
  ADD COLUMN IF NOT EXISTS payer_member_id uuid REFERENCES public.tontine_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date date;
CREATE UNIQUE INDEX IF NOT EXISTS group_subscriptions_tontine_cycle ON public.group_subscriptions(tontine_id, cycle_idx);
ALTER TABLE public.group_subscriptions DROP CONSTRAINT IF EXISTS group_subscriptions_status_chk;
ALTER TABLE public.group_subscriptions ADD CONSTRAINT group_subscriptions_status_chk
  CHECK (status = ANY (ARRAY['free','pending','overdue','paid','failed','expired','cancelled']));

DROP POLICY IF EXISTS "Members read group subscriptions" ON public.group_subscriptions;
CREATE POLICY "Members read group subscriptions" ON public.group_subscriptions
  FOR SELECT TO authenticated
  USING (tontine_id IS NOT NULL AND public.is_tontine_member(auth.uid(), tontine_id));

-- Existing groups: launched, admin pays every month
UPDATE public.tontines t SET
  launched_at = COALESCE(t.launched_at, t.created_at),
  sub_payer_mode = COALESCE(t.sub_payer_mode, 'same'),
  sub_payer_order = CASE WHEN cardinality(t.sub_payer_order) > 0 THEN t.sub_payer_order ELSE
    COALESCE((SELECT ARRAY[m.id] FROM public.tontine_members m
              WHERE m.tontine_id = t.id AND m.role = 'admin' AND m.status = 'active'
              ORDER BY m.position LIMIT 1), '{}') END;

CREATE OR REPLACE FUNCTION public.sync_group_subscription(_tontine_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tontines%ROWTYPE;
  _start date; _k int; _ps date; _pe date; _n int; _len int;
  _payer uuid; _tier public.group_pricing_tiers%ROWTYPE; _uid uuid; _sub record;
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
    IF NOT EXISTS (SELECT 1 FROM public.group_subscriptions WHERE tontine_id = t.id AND cycle_idx = _k) THEN
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

CREATE OR REPLACE FUNCTION public.apply_payment_success(_reference text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _tx public.payment_transactions%ROWTYPE;
  _member public.tontine_members%ROWTYPE;
  _contribution public.contributions%ROWTYPE;
  _credit numeric;
  _n int;
BEGIN
  SELECT * INTO _tx FROM public.payment_transactions WHERE reference = _reference;
  IF NOT FOUND OR _tx.status <> 'SUCCESS' THEN RETURN; END IF;
  IF _tx.group_ref IS NULL OR _tx.due_ref IS NULL OR _tx.member_id IS NULL THEN RETURN; END IF;

  IF _tx.kind = 'subscription' THEN
    UPDATE public.group_subscriptions
    SET status = 'paid', paid_at = now(), transaction_ref = _reference, payment_method = 'mobile_money'
    WHERE id = _tx.due_ref::uuid AND tontine_id = _tx.group_ref::uuid AND status <> 'paid';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n > 0 THEN
      SELECT * INTO _member FROM public.tontine_members
      WHERE tontine_id = _tx.group_ref::uuid AND user_id = _tx.member_id LIMIT 1;
      INSERT INTO public.group_activity (tontine_id, actor_id, kind, message)
      VALUES (_tx.group_ref::uuid, _tx.member_id, 'subscription',
        COALESCE(_member.name, 'Un membre') || ' a payé l''abonnement du groupe : ' || _tx.amount || ' ' || _tx.currency || ' (' || _reference || ')');
      PERFORM public.sync_group_subscription(_tx.group_ref::uuid);
    END IF;
    RETURN;
  END IF;

  SELECT * INTO _member FROM public.tontine_members
  WHERE tontine_id = _tx.group_ref::uuid AND user_id = _tx.member_id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO _contribution FROM public.contributions
  WHERE period_id = _tx.due_ref::uuid AND member_id = _member.id;
  IF NOT FOUND THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.group_activity
             WHERE tontine_id = _tx.group_ref::uuid AND kind = 'payment' AND message LIKE '%' || _reference || '%') THEN
    RETURN;
  END IF;

  _credit := COALESCE(_tx.contribution_amount, _tx.amount - COALESCE(_tx.penalty_amount, 0));

  UPDATE public.contributions
  SET amount_paid = amount_paid + _credit,
      status = CASE WHEN amount_paid + _credit >= amount_due THEN 'paid' ELSE 'partial' END,
      updated_at = now()
  WHERE id = _contribution.id;

  IF COALESCE(_tx.penalty_amount, 0) > 0 THEN
    UPDATE public.late_penalties
    SET status = 'paid', paid_at = now(), transaction_ref = _reference, days_late = _tx.days_late
    WHERE contribution_id = _contribution.id AND status <> 'paid';
  END IF;

  INSERT INTO public.group_activity (tontine_id, actor_id, kind, message)
  VALUES (_tx.group_ref::uuid, _tx.member_id, 'payment',
          _member.name || ' a payé ' || _tx.amount || ' ' || _tx.currency
          || CASE WHEN COALESCE(_tx.penalty_amount,0) > 0 THEN ' dont ' || _tx.penalty_amount || ' de pénalité' ELSE '' END
          || ' (' || _reference || ')');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.apply_payment_success(text) FROM PUBLIC, anon, authenticated;

SELECT public.sync_group_subscription(id) FROM public.tontines;
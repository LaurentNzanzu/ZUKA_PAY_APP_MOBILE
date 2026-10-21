ALTER TABLE public.tontines
  ADD COLUMN admin_last_active_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_financial_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN needs_second_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.tontine_members ADD COLUMN admin_permissions text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.payment_transactions DROP CONSTRAINT payment_transactions_kind_chk;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_kind_chk
  CHECK (kind IN ('contribution','subscription','proxy_contribution','proxy_subscription','debt_repayment'));
ALTER TABLE public.payment_transactions
  ADD COLUMN proxy_request_id uuid,
  ADD COLUMN debt_id uuid,
  ADD COLUMN beneficiary_user_id uuid,
  ADD COLUMN beneficiary_msisdn text,
  ADD COLUMN payout_status text;

CREATE TABLE public.proxy_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id),
  kind text NOT NULL CHECK (kind IN ('contribution','subscription')),
  contribution_id uuid REFERENCES public.contributions(id),
  subscription_id uuid REFERENCES public.group_subscriptions(id),
  debtor_member_id uuid NOT NULL REFERENCES public.tontine_members(id),
  debtor_user_id uuid,
  payer_member_id uuid NOT NULL REFERENCES public.tontine_members(id),
  payer_user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  debtor_penalty numeric NOT NULL DEFAULT 0,
  currency text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','refused','paid','cancelled')),
  approved_by uuid, approved_at timestamptz,
  approval_ref text,
  reimbursement_requested boolean NOT NULL DEFAULT false,
  interest_rate numeric NOT NULL DEFAULT 0 CHECK (interest_rate >= 0 AND interest_rate <= 8),
  transaction_ref text, paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.proxy_payment_requests TO authenticated;
GRANT ALL ON public.proxy_payment_requests TO service_role;
ALTER TABLE public.proxy_payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read group proxy requests" ON public.proxy_payment_requests FOR SELECT TO authenticated
  USING (public.is_tontine_member(auth.uid(), tontine_id) OR payer_user_id = auth.uid() OR debtor_user_id = auth.uid());
CREATE TRIGGER proxy_touch BEFORE UPDATE ON public.proxy_payment_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.member_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_user_id uuid NOT NULL,
  debtor_member_id uuid REFERENCES public.tontine_members(id),
  creditor_user_id uuid NOT NULL,
  creditor_member_id uuid REFERENCES public.tontine_members(id),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id),
  proxy_request_id uuid REFERENCES public.proxy_payment_requests(id),
  reason text NOT NULL,
  original_transaction_ref text NOT NULL,
  original_amount numeric NOT NULL CHECK (original_amount > 0),
  interest_enabled boolean NOT NULL DEFAULT false,
  interest_rate numeric NOT NULL DEFAULT 0 CHECK (interest_rate >= 0 AND interest_rate <= 8),
  interest_amount numeric NOT NULL DEFAULT 0,
  total_amount_due numeric NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  remaining_amount numeric GENERATED ALWAYS AS (GREATEST(total_amount_due - amount_paid, 0)) STORED,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled')),
  due_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz, settlement_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debt_interest_calc CHECK (total_amount_due = original_amount + interest_amount)
);
GRANT SELECT ON public.member_debts TO authenticated;
GRANT ALL ON public.member_debts TO service_role;
ALTER TABLE public.member_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties read their debts" ON public.member_debts FOR SELECT TO authenticated
  USING (debtor_user_id = auth.uid() OR creditor_user_id = auth.uid());
CREATE TRIGGER debts_touch BEFORE UPDATE ON public.member_debts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX member_debts_debtor_idx ON public.member_debts(debtor_user_id) WHERE status = 'active';

CREATE TABLE public.group_admin_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id),
  old_principal uuid, new_principal uuid,
  old_second uuid, new_second uuid,
  permissions text[] NOT NULL DEFAULT '{}',
  trigger_action text NOT NULL,
  reason text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.group_admin_changes TO authenticated;
GRANT ALL ON public.group_admin_changes TO service_role;
ALTER TABLE public.group_admin_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read admin changes" ON public.group_admin_changes FOR SELECT TO authenticated
  USING (public.is_tontine_member(auth.uid(), tontine_id));

-- Payment confirmation: extended for proxy payments and debt repayments.
CREATE OR REPLACE FUNCTION public.apply_payment_success(_reference text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _tx public.payment_transactions%ROWTYPE;
  _member public.tontine_members%ROWTYPE;
  _contribution public.contributions%ROWTYPE;
  _req public.proxy_payment_requests%ROWTYPE;
  _debt public.member_debts%ROWTYPE;
  _credit numeric; _n int; _interest numeric; _payer_name text;
BEGIN
  SELECT * INTO _tx FROM public.payment_transactions WHERE reference = _reference;
  IF NOT FOUND OR _tx.status <> 'SUCCESS' THEN RETURN; END IF;

  IF _tx.group_ref IS NOT NULL AND _tx.kind <> 'debt_repayment' THEN
    UPDATE public.tontines SET last_financial_activity_at = now() WHERE id = _tx.group_ref::uuid;
  END IF;

  IF _tx.kind = 'debt_repayment' THEN
    SELECT * INTO _debt FROM public.member_debts WHERE id = _tx.debt_id;
    IF NOT FOUND OR _debt.status = 'settled' THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM public.group_activity WHERE kind = 'debt' AND message LIKE '%' || _reference || '%') THEN RETURN; END IF;
    UPDATE public.member_debts SET amount_paid = LEAST(amount_paid + _tx.amount, total_amount_due),
      status = CASE WHEN amount_paid + _tx.amount >= total_amount_due THEN 'settled' ELSE 'active' END,
      settled_at = CASE WHEN amount_paid + _tx.amount >= total_amount_due THEN now() ELSE NULL END,
      settlement_ref = _reference
    WHERE id = _debt.id RETURNING * INTO _debt;
    INSERT INTO public.group_activity (tontine_id, actor_id, kind, message)
    VALUES (_debt.tontine_id, _debt.debtor_user_id, 'debt',
      'Remboursement de ' || _tx.amount || ' ' || _tx.currency || ' versé au créancier (' || _reference || ')');
    INSERT INTO public.notifications(user_id, tontine_id, kind, title, body, channel, status, sent_at, dedupe_key)
    VALUES (_debt.creditor_user_id, _debt.tontine_id, 'debt',
      CASE WHEN _debt.status = 'settled' THEN 'Remboursement effectué' ELSE 'Remboursement partiel reçu' END,
      'Le remboursement de votre avance a été effectué : ' || _tx.amount || ' ' || _tx.currency
        || CASE WHEN _debt.status = 'settled' THEN '.' ELSE ' (reste ' || _debt.remaining_amount || ').' END,
      'in_app', 'sent', now(), 'debtpay:' || _reference);
    RETURN;
  END IF;

  IF _tx.kind IN ('proxy_contribution','proxy_subscription') THEN
    SELECT * INTO _req FROM public.proxy_payment_requests WHERE id = _tx.proxy_request_id;
    IF NOT FOUND OR _req.status <> 'approved' THEN RETURN; END IF;
    IF _req.kind = 'contribution' THEN
      UPDATE public.contributions SET amount_paid = LEAST(amount_paid + _req.amount, amount_due),
        status = CASE WHEN amount_paid + _req.amount >= amount_due THEN 'paid' ELSE 'partial' END, updated_at = now()
      WHERE id = _req.contribution_id;
    ELSE
      UPDATE public.group_subscriptions SET status = 'paid', paid_at = now(), transaction_ref = _reference, payment_method = 'mobile_money'
      WHERE id = _req.subscription_id AND status <> 'paid';
    END IF;
    UPDATE public.proxy_payment_requests SET status = 'paid', transaction_ref = _reference, paid_at = now() WHERE id = _req.id;
    SELECT name INTO _payer_name FROM public.tontine_members WHERE id = _req.payer_member_id;
    INSERT INTO public.group_activity (tontine_id, actor_id, kind, message)
    VALUES (_req.tontine_id, _req.payer_user_id, 'payment',
      'PAIEMENT EFFECTUÉ POUR UN AUTRE MEMBRE : ' || COALESCE(_payer_name,'Un membre') || ' a payé ' || _req.amount || ' ' || _req.currency
      || ' pour ' || (SELECT name FROM public.tontine_members WHERE id = _req.debtor_member_id) || ' (' || _reference || ')');
    IF _req.reimbursement_requested AND _req.debtor_user_id IS NOT NULL THEN
      _interest := round(_req.amount * _req.interest_rate / 100, 2);
      INSERT INTO public.member_debts (debtor_user_id, debtor_member_id, creditor_user_id, creditor_member_id, tontine_id,
        proxy_request_id, reason, original_transaction_ref, original_amount, interest_enabled, interest_rate, interest_amount,
        total_amount_due, currency)
      VALUES (_req.debtor_user_id, _req.debtor_member_id, _req.payer_user_id, _req.payer_member_id, _req.tontine_id, _req.id,
        CASE WHEN _req.kind = 'contribution' THEN 'Avance de cotisation' ELSE 'Avance d''abonnement du groupe' END,
        _reference, _req.amount, _req.interest_rate > 0, _req.interest_rate, _interest, _req.amount + _interest, _req.currency);
      INSERT INTO public.notifications(user_id, tontine_id, kind, title, body, channel, status, sent_at, dedupe_key)
      VALUES (_req.debtor_user_id, _req.tontine_id, 'debt', 'Remboursement à effectuer',
        'Un membre a payé votre ' || CASE WHEN _req.kind = 'contribution' THEN 'cotisation' ELSE 'abonnement' END
        || ' à votre place. Vous devez maintenant lui rembourser ' || (_req.amount + _interest) || ' ' || _req.currency || '.'
        || CASE WHEN _req.interest_rate > 0 THEN ' Le remboursement demandé est de ' || (_req.amount + _interest) || ' ' || _req.currency
             || ' incluant un intérêt de ' || _req.interest_rate || ' %.' ELSE '' END,
        'in_app', 'sent', now(), 'debt:' || _req.id);
    END IF;
    IF _req.kind = 'subscription' THEN PERFORM public.sync_group_subscription(_req.tontine_id); END IF;
    RETURN;
  END IF;

  IF _tx.group_ref IS NULL OR _tx.due_ref IS NULL OR _tx.member_id IS NULL THEN RETURN; END IF;

  IF _tx.kind = 'subscription' THEN
    UPDATE public.group_subscriptions
    SET status = 'paid', paid_at = now(), transaction_ref = _reference, payment_method = 'mobile_money'
    WHERE id = _tx.due_ref::uuid AND tontine_id = _tx.group_ref::uuid AND status <> 'paid';
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n > 0 THEN
      SELECT * INTO _member FROM public.tontine_members WHERE tontine_id = _tx.group_ref::uuid AND user_id = _tx.member_id LIMIT 1;
      INSERT INTO public.group_activity (tontine_id, actor_id, kind, message)
      VALUES (_tx.group_ref::uuid, _tx.member_id, 'subscription',
        COALESCE(_member.name, 'Un membre') || ' a payé l''abonnement du groupe : ' || _tx.amount || ' ' || _tx.currency || ' (' || _reference || ')');
      PERFORM public.sync_group_subscription(_tx.group_ref::uuid);
    END IF;
    RETURN;
  END IF;

  SELECT * INTO _member FROM public.tontine_members WHERE tontine_id = _tx.group_ref::uuid AND user_id = _tx.member_id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO _contribution FROM public.contributions WHERE period_id = _tx.due_ref::uuid AND member_id = _member.id;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.group_activity WHERE tontine_id = _tx.group_ref::uuid AND kind = 'payment' AND message LIKE '%' || _reference || '%') THEN RETURN; END IF;

  _credit := COALESCE(_tx.contribution_amount, _tx.amount - COALESCE(_tx.penalty_amount, 0));
  UPDATE public.contributions
  SET amount_paid = amount_paid + _credit,
      status = CASE WHEN amount_paid + _credit >= amount_due THEN 'paid' ELSE 'partial' END, updated_at = now()
  WHERE id = _contribution.id;
  IF COALESCE(_tx.penalty_amount, 0) > 0 THEN
    UPDATE public.late_penalties SET status = 'paid', paid_at = now(), transaction_ref = _reference, days_late = _tx.days_late
    WHERE contribution_id = _contribution.id AND status <> 'paid';
  END IF;
  INSERT INTO public.group_activity (tontine_id, actor_id, kind, message)
  VALUES (_tx.group_ref::uuid, _tx.member_id, 'payment',
    _member.name || ' a payé ' || _tx.amount || ' ' || _tx.currency
    || CASE WHEN COALESCE(_tx.penalty_amount,0) > 0 THEN ' dont ' || _tx.penalty_amount || ' de pénalité' ELSE '' END
    || ' (' || _reference || ')');
END;
$function$;

-- Automatic succession (principal inactive 6 months) and archiving (no payment for 6 months).
CREATE OR REPLACE FUNCTION public.run_group_governance(_now timestamptz DEFAULT now())
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
REVOKE ALL ON FUNCTION public.run_group_governance(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_group_governance(timestamptz) TO service_role;
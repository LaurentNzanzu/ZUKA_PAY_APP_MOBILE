ALTER TABLE public.tontines
  ADD COLUMN late_penalty_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN late_penalty_amount numeric NOT NULL DEFAULT 0 CHECK (late_penalty_amount >= 0);

ALTER TABLE public.payment_transactions
  ADD COLUMN contribution_amount numeric,
  ADD COLUMN penalty_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN due_date date,
  ADD COLUMN days_late integer NOT NULL DEFAULT 0;

CREATE TABLE public.late_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  contribution_id uuid NOT NULL UNIQUE REFERENCES public.contributions(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.contribution_periods(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.tontine_members(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL,
  due_date date NOT NULL,
  paid_at timestamptz,
  days_late integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'applied',
  transaction_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.late_penalties TO authenticated;
GRANT ALL ON public.late_penalties TO service_role;
ALTER TABLE public.late_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read group penalties" ON public.late_penalties
  FOR SELECT TO authenticated USING (public.is_tontine_member(auth.uid(), tontine_id));
CREATE INDEX late_penalties_tontine_idx ON public.late_penalties(tontine_id);
CREATE TRIGGER late_penalties_touch BEFORE UPDATE ON public.late_penalties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.apply_payment_success(_reference text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _tx public.payment_transactions%ROWTYPE;
  _member public.tontine_members%ROWTYPE;
  _contribution public.contributions%ROWTYPE;
  _credit numeric;
BEGIN
  SELECT * INTO _tx FROM public.payment_transactions WHERE reference = _reference;
  IF NOT FOUND OR _tx.status <> 'SUCCESS' THEN RETURN; END IF;
  IF _tx.group_ref IS NULL OR _tx.due_ref IS NULL OR _tx.member_id IS NULL THEN RETURN; END IF;

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
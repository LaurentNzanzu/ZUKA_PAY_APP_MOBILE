
INSERT INTO public.app_settings (key, value, label, is_sensitive) VALUES
 ('credit.min_age_months', '12', 'Crédit mutuel — ancienneté minimale (mois)', false),
 ('credit.max_late_per_period', '4', 'Crédit mutuel — retards max. autorisés par échéance (moins de 5)', false),
 ('credit.max_late_per_year', '19', 'Crédit mutuel — retards max. autorisés par année (moins de 20)', false),
 ('credit.min_active_members', '11', 'Crédit mutuel — membres actifs minimum (plus de 10)', false),
 ('credit.min_successful_periods', '5', 'Crédit mutuel — échéances réussies minimum', false),
 ('credit.recovery_periods', '2', 'Crédit mutuel — bonnes échéances consécutives pour récupérer', false)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.group_period_performance (
  period_id uuid PRIMARY KEY REFERENCES public.contribution_periods(id) ON DELETE CASCADE,
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  due_date date NOT NULL,
  members_count integer NOT NULL DEFAULT 0,
  paid_count integer NOT NULL DEFAULT 0,
  late_count integer NOT NULL DEFAULT 0,
  closed boolean NOT NULL DEFAULT false,
  successful boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.group_period_performance (tontine_id, due_date);

CREATE TABLE public.group_eligibility (
  tontine_id uuid PRIMARY KEY REFERENCES public.tontines(id) ON DELETE CASCADE,
  age_months integer NOT NULL DEFAULT 0,
  active_members integer NOT NULL DEFAULT 0,
  last_period_late integer NOT NULL DEFAULT 0,
  year integer NOT NULL,
  year_late integer NOT NULL DEFAULT 0,
  successful_periods integer NOT NULL DEFAULT 0,
  closed_periods integer NOT NULL DEFAULT 0,
  period_state text NOT NULL DEFAULT 'ok' CHECK (period_state IN ('ok','restricted','recovering')),
  recovery_streak integer NOT NULL DEFAULT 0,
  c_age boolean NOT NULL DEFAULT false,
  c_period_late boolean NOT NULL DEFAULT true,
  c_year_late boolean NOT NULL DEFAULT true,
  c_members boolean NOT NULL DEFAULT false,
  c_successful boolean NOT NULL DEFAULT false,
  progress integer NOT NULL DEFAULT 0,
  eligible boolean NOT NULL DEFAULT false,
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_eligibility_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.contribution_periods(id) ON DELETE SET NULL,
  kind text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.group_eligibility_events (tontine_id, created_at DESC);

GRANT SELECT ON public.group_period_performance, public.group_eligibility, public.group_eligibility_events TO authenticated;
GRANT ALL ON public.group_period_performance, public.group_eligibility, public.group_eligibility_events TO service_role;

ALTER TABLE public.group_period_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_eligibility_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members and platform admins read performance" ON public.group_period_performance
  FOR SELECT TO authenticated USING (public.is_tontine_member(auth.uid(), tontine_id) OR public.has_permission(auth.uid(), 'groups.view'));
CREATE POLICY "Members and platform admins read eligibility" ON public.group_eligibility
  FOR SELECT TO authenticated USING (public.is_tontine_member(auth.uid(), tontine_id) OR public.has_permission(auth.uid(), 'groups.view'));
CREATE POLICY "Members and platform admins read eligibility events" ON public.group_eligibility_events
  FOR SELECT TO authenticated USING (public.is_tontine_member(auth.uid(), tontine_id) OR public.has_permission(auth.uid(), 'groups.view'));

-- Creation date of a group can never be changed (basis of the seniority condition).
CREATE OR REPLACE FUNCTION public.lock_tontine_created_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.created_at := OLD.created_at; RETURN NEW; END; $$;
CREATE TRIGGER tontines_lock_created_at BEFORE UPDATE ON public.tontines FOR EACH ROW EXECUTE FUNCTION public.lock_tontine_created_at();

CREATE OR REPLACE FUNCTION public.credit_setting(_key text, _default int) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.app_settings WHERE key = _key), _default); $$;

CREATE OR REPLACE FUNCTION public.recompute_group_eligibility(_tontine_id uuid, _today date DEFAULT current_date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tontines%ROWTYPE;
  old public.group_eligibility%ROWTYPE;
  had_old boolean;
  p record;
  prev record;
  min_age int := public.credit_setting('credit.min_age_months', 12);
  max_pl int := public.credit_setting('credit.max_late_per_period', 4);
  max_yl int := public.credit_setting('credit.max_late_per_year', 19);
  min_mem int := public.credit_setting('credit.min_active_members', 11);
  min_succ int := public.credit_setting('credit.min_successful_periods', 5);
  rec_n int := GREATEST(public.credit_setting('credit.recovery_periods', 2), 1);
  v_age int; v_mem int; v_year int := extract(year FROM _today)::int; v_yl int; v_succ int; v_closed int;
  v_last int := 0; v_state text := 'ok'; v_streak int := 0;
  c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean; v_elig boolean; v_prog int; s2 numeric;
BEGIN
  SELECT * INTO t FROM public.tontines WHERE id = _tontine_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO old FROM public.group_eligibility WHERE tontine_id = _tontine_id;
  had_old := FOUND;

  -- Per-period performance from real contributions.
  FOR p IN
    SELECT cp.id, cp.idx, cp.due_date,
      count(c.id) AS n,
      count(c.id) FILTER (WHERE c.amount_paid >= c.amount_due) AS paid,
      count(c.id) FILTER (WHERE cp.due_date < _today AND (
          c.amount_paid < c.amount_due
          OR EXISTS (SELECT 1 FROM public.late_penalties lp WHERE lp.contribution_id = c.id)
          OR (c.status = 'paid' AND c.updated_at::date > cp.due_date))) AS late
    FROM public.contribution_periods cp
    LEFT JOIN public.contributions c ON c.period_id = cp.id
    WHERE cp.tontine_id = _tontine_id
    GROUP BY cp.id
  LOOP
    SELECT * INTO prev FROM public.group_period_performance WHERE period_id = p.id;
    INSERT INTO public.group_period_performance (period_id, tontine_id, idx, due_date, members_count, paid_count, late_count, closed, successful, computed_at)
    VALUES (p.id, _tontine_id, p.idx, p.due_date, p.n, p.paid, p.late, p.due_date < _today, p.due_date < _today AND p.n > 0 AND p.paid = p.n, now())
    ON CONFLICT (period_id) DO UPDATE SET members_count = EXCLUDED.members_count, paid_count = EXCLUDED.paid_count,
      late_count = EXCLUDED.late_count, closed = EXCLUDED.closed, successful = EXCLUDED.successful, computed_at = now();
    IF p.due_date < _today AND (prev IS NULL OR NOT prev.closed) THEN
      INSERT INTO public.group_eligibility_events (tontine_id, period_id, kind, old_value, new_value, reason)
      VALUES (_tontine_id, p.id, 'period_closed', NULL,
        jsonb_build_object('late', p.late, 'successful', p.n > 0 AND p.paid = p.n),
        'Échéance n°' || p.idx || ' clôturée avec ' || p.late || ' retard(s).');
    END IF;
  END LOOP;

  -- Condition 2 with progressive recovery, replayed over closed periods in order.
  FOR p IN SELECT late_count FROM public.group_period_performance WHERE tontine_id = _tontine_id AND closed ORDER BY due_date, idx LOOP
    v_last := p.late_count;
    IF p.late_count > max_pl THEN v_state := 'restricted'; v_streak := 0;
    ELSIF v_state <> 'ok' THEN
      v_streak := v_streak + 1;
      IF v_streak >= rec_n THEN v_state := 'ok'; v_streak := 0; ELSE v_state := 'recovering'; END IF;
    END IF;
  END LOOP;

  v_age := (extract(year FROM age(_today, t.created_at::date)) * 12 + extract(month FROM age(_today, t.created_at::date)))::int;
  SELECT count(*) INTO v_mem FROM public.tontine_members WHERE tontine_id = _tontine_id AND status = 'active';
  SELECT COALESCE(sum(late_count),0), count(*) FILTER (WHERE successful), count(*) INTO v_yl, v_succ, v_closed
    FROM public.group_period_performance WHERE tontine_id = _tontine_id AND closed;
  SELECT COALESCE(sum(late_count),0) INTO v_yl FROM public.group_period_performance
    WHERE tontine_id = _tontine_id AND closed AND extract(year FROM due_date) = v_year;

  c1 := v_age >= min_age; c2 := v_state = 'ok'; c3 := v_yl <= max_yl; c4 := v_mem >= min_mem; c5 := v_succ >= min_succ;
  v_elig := c1 AND c2 AND c3 AND c4 AND c5;
  s2 := CASE v_state WHEN 'ok' THEN 1 WHEN 'recovering' THEN v_streak::numeric / rec_n ELSE 0 END;
  v_prog := round(100 * (LEAST(v_age::numeric / GREATEST(min_age,1), 1) + s2 + CASE WHEN c3 THEN 1 ELSE 0 END
            + LEAST(v_mem::numeric / GREATEST(min_mem,1), 1) + LEAST(v_succ::numeric / GREATEST(min_succ,1), 1)) / 5);
  IF NOT v_elig THEN v_prog := LEAST(v_prog, 99); END IF;

  INSERT INTO public.group_eligibility AS g (tontine_id, age_months, active_members, last_period_late, year, year_late, successful_periods,
    closed_periods, period_state, recovery_streak, c_age, c_period_late, c_year_late, c_members, c_successful, progress, eligible, thresholds, computed_at)
  VALUES (_tontine_id, v_age, v_mem, v_last, v_year, v_yl, v_succ, v_closed, v_state, v_streak, c1, c2, c3, c4, c5, v_prog, v_elig,
    jsonb_build_object('min_age_months', min_age, 'max_late_per_period', max_pl, 'max_late_per_year', max_yl,
      'min_active_members', min_mem, 'min_successful_periods', min_succ, 'recovery_periods', rec_n), now())
  ON CONFLICT (tontine_id) DO UPDATE SET age_months = EXCLUDED.age_months, active_members = EXCLUDED.active_members,
    last_period_late = EXCLUDED.last_period_late, year = EXCLUDED.year, year_late = EXCLUDED.year_late,
    successful_periods = EXCLUDED.successful_periods, closed_periods = EXCLUDED.closed_periods, period_state = EXCLUDED.period_state,
    recovery_streak = EXCLUDED.recovery_streak, c_age = EXCLUDED.c_age, c_period_late = EXCLUDED.c_period_late,
    c_year_late = EXCLUDED.c_year_late, c_members = EXCLUDED.c_members, c_successful = EXCLUDED.c_successful,
    progress = EXCLUDED.progress, eligible = EXCLUDED.eligible, thresholds = EXCLUDED.thresholds, computed_at = now();

  IF had_old THEN
    IF old.year <> v_year THEN
      INSERT INTO public.group_eligibility_events (tontine_id, kind, old_value, new_value, reason)
      VALUES (_tontine_id, 'year_reset', jsonb_build_object('year', old.year, 'late', old.year_late), jsonb_build_object('year', v_year, 'late', v_yl),
        'Nouvelle période annuelle : le compteur de retards repart, l''historique ' || old.year || ' est conservé.');
    END IF;
    IF old.c_age <> c1 THEN INSERT INTO public.group_eligibility_events (tontine_id, kind, old_value, new_value, reason)
      VALUES (_tontine_id, 'condition_age', to_jsonb(old.c_age), to_jsonb(c1), 'Ancienneté : ' || v_age || '/' || min_age || ' mois.'); END IF;
    IF old.period_state <> v_state THEN INSERT INTO public.group_eligibility_events (tontine_id, kind, old_value, new_value, reason)
      VALUES (_tontine_id, 'condition_period_late', to_jsonb(old.period_state), to_jsonb(v_state),
        CASE v_state WHEN 'restricted' THEN 'Restriction temporaire : ' || v_last || ' retards sur une échéance.'
          WHEN 'recovering' THEN 'Récupération en cours : ' || v_streak || '/' || rec_n || ' bonne(s) échéance(s).'
          ELSE 'Condition rétablie après de bonnes échéances.' END); END IF;
    IF old.c_year_late <> c3 THEN INSERT INTO public.group_eligibility_events (tontine_id, kind, old_value, new_value, reason)
      VALUES (_tontine_id, 'condition_year_late', to_jsonb(old.c_year_late), to_jsonb(c3), 'Retards ' || v_year || ' : ' || v_yl || '/' || max_yl || ' max.'); END IF;
    IF old.c_members <> c4 THEN INSERT INTO public.group_eligibility_events (tontine_id, kind, old_value, new_value, reason)
      VALUES (_tontine_id, 'condition_members', to_jsonb(old.active_members), to_jsonb(v_mem), 'Membres actifs : ' || v_mem || '/' || min_mem || '.'); END IF;
    IF old.c_successful <> c5 THEN INSERT INTO public.group_eligibility_events (tontine_id, kind, old_value, new_value, reason)
      VALUES (_tontine_id, 'condition_successful', to_jsonb(old.successful_periods), to_jsonb(v_succ), 'Échéances réussies : ' || v_succ || '/' || min_succ || '.'); END IF;
    IF old.eligible <> v_elig THEN INSERT INTO public.group_eligibility_events (tontine_id, kind, old_value, new_value, reason)
      VALUES (_tontine_id, 'status', to_jsonb(old.eligible), to_jsonb(v_elig),
        CASE WHEN v_elig THEN 'Le groupe est devenu éligible au crédit mutuel.' ELSE 'Le groupe n''est plus éligible pour le moment.' END); END IF;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.recompute_all_group_eligibility() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN FOR r IN SELECT id FROM public.tontines LOOP PERFORM public.recompute_group_eligibility(r.id); n := n + 1; END LOOP; RETURN n; END; $$;

CREATE OR REPLACE FUNCTION public.trg_recompute_group_eligibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.recompute_group_eligibility(COALESCE(NEW.tontine_id, OLD.tontine_id));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_events (area, level, message, detail) VALUES ('credit', 'error', 'Recalcul éligibilité échoué', jsonb_build_object('error', SQLERRM));
  END;
  RETURN NULL;
END; $$;

CREATE TRIGGER contributions_eligibility AFTER INSERT OR UPDATE ON public.contributions FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_group_eligibility();
CREATE TRIGGER members_eligibility AFTER INSERT OR UPDATE OR DELETE ON public.tontine_members FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_group_eligibility();
CREATE TRIGGER penalties_eligibility AFTER INSERT ON public.late_penalties FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_group_eligibility();
CREATE TRIGGER periods_eligibility AFTER INSERT ON public.contribution_periods FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_group_eligibility();

REVOKE ALL ON FUNCTION public.recompute_group_eligibility(uuid, date), public.recompute_all_group_eligibility(),
  public.trg_recompute_group_eligibility(), public.credit_setting(text, int), public.lock_tontine_created_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_group_eligibility(uuid, date), public.recompute_all_group_eligibility() TO service_role;

SELECT public.recompute_all_group_eligibility();

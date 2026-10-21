
-- ===== Helper-free tables first =====

CREATE TABLE public.tontines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  currency text NOT NULL DEFAULT 'CDF',
  amount numeric NOT NULL,
  frequency text NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  day_mode text NOT NULL DEFAULT 'all',
  custom_days integer[] NOT NULL DEFAULT '{}',
  max_members integer NOT NULL DEFAULT 10,
  group_type text NOT NULL DEFAULT 'family',
  photo_url text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tontine_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  phone text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  position integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tontine_id, phone)
);
CREATE INDEX tontine_members_user_idx ON public.tontine_members(user_id);

CREATE TABLE public.tontine_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  phone text,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  due_date date NOT NULL,
  beneficiary_member_id uuid REFERENCES public.tontine_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tontine_id, idx)
);

CREATE TABLE public.contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.contribution_periods(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.tontine_members(id) ON DELETE CASCADE,
  amount_due numeric NOT NULL,
  amount_paid numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, member_id)
);

CREATE TABLE public.group_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  deadline timestamptz NOT NULL,
  threshold text NOT NULL DEFAULT 'simple',
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  swap_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.beneficiary_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  from_member_id uuid NOT NULL REFERENCES public.tontine_members(id) ON DELETE CASCADE,
  to_member_id uuid NOT NULL REFERENCES public.tontine_members(id) ON DELETE CASCADE,
  from_position integer NOT NULL,
  to_position integer NOT NULL,
  direction text NOT NULL DEFAULT 'earlier',
  status text NOT NULL DEFAULT 'pending',
  vote_id uuid REFERENCES public.group_votes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vote_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id uuid NOT NULL REFERENCES public.group_votes(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.tontine_members(id) ON DELETE CASCADE,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vote_id, member_id)
);

CREATE TABLE public.group_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  actor_id uuid,
  kind text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX group_activity_tontine_idx ON public.group_activity(tontine_id, created_at DESC);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tontine_id uuid REFERENCES public.tontines(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  status text NOT NULL DEFAULT 'queued',
  dedupe_key text UNIQUE,
  error text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  label text,
  is_sensitive boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sms_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  environment text NOT NULL DEFAULT 'sandbox',
  enabled boolean NOT NULL DEFAULT false,
  from_number text,
  countries text[] NOT NULL DEFAULT '{CD}'::text[],
  api_base_url text,
  account_sid text,
  secret_ref text,
  secret_last4 text,
  status text NOT NULL DEFAULT 'unconfigured',
  last_error text,
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX system_events_area_idx ON public.system_events(area, created_at DESC);

-- ===== Grants =====
GRANT SELECT ON public.tontines, public.tontine_members, public.tontine_invitations,
  public.contribution_periods, public.contributions, public.group_votes,
  public.beneficiary_swaps, public.vote_responses, public.group_activity,
  public.notifications, public.app_settings, public.sms_providers, public.system_events
  TO authenticated;
GRANT ALL ON public.tontines, public.tontine_members, public.tontine_invitations,
  public.contribution_periods, public.contributions, public.group_votes,
  public.beneficiary_swaps, public.vote_responses, public.group_activity,
  public.notifications, public.app_settings, public.sms_providers, public.system_events
  TO service_role;

-- ===== Membership helpers =====
CREATE OR REPLACE FUNCTION public.is_tontine_member(_user_id uuid, _tontine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tontine_members m
    WHERE m.tontine_id = _tontine_id AND m.user_id = _user_id AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tontine_admin(_user_id uuid, _tontine_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tontine_members m
    WHERE m.tontine_id = _tontine_id AND m.user_id = _user_id
      AND m.status = 'active' AND m.role = 'admin'
  );
$$;

-- ===== RLS =====
ALTER TABLE public.tontines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tontine_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tontine_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiary_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tontines_select ON public.tontines FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_tontine_member(auth.uid(), id)
         OR public.has_permission(auth.uid(), 'groups.view'));

CREATE POLICY tontine_members_select ON public.tontine_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tontine_member(auth.uid(), tontine_id)
         OR public.has_permission(auth.uid(), 'groups.view'));

CREATE POLICY tontine_invitations_select ON public.tontine_invitations FOR SELECT TO authenticated
  USING (public.is_tontine_member(auth.uid(), tontine_id)
         OR public.has_permission(auth.uid(), 'groups.view'));

CREATE POLICY contribution_periods_select ON public.contribution_periods FOR SELECT TO authenticated
  USING (public.is_tontine_member(auth.uid(), tontine_id)
         OR public.has_permission(auth.uid(), 'groups.view'));

CREATE POLICY contributions_select ON public.contributions FOR SELECT TO authenticated
  USING (public.is_tontine_member(auth.uid(), tontine_id)
         OR public.has_permission(auth.uid(), 'groups.view'));

CREATE POLICY group_votes_select ON public.group_votes FOR SELECT TO authenticated
  USING (public.is_tontine_member(auth.uid(), tontine_id)
         OR public.has_permission(auth.uid(), 'groups.view'));

CREATE POLICY beneficiary_swaps_select ON public.beneficiary_swaps FOR SELECT TO authenticated
  USING (public.is_tontine_member(auth.uid(), tontine_id)
         OR public.has_permission(auth.uid(), 'groups.view'));

CREATE POLICY vote_responses_select ON public.vote_responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_votes v
                 WHERE v.id = vote_id
                   AND (public.is_tontine_member(auth.uid(), v.tontine_id)
                        OR public.has_permission(auth.uid(), 'groups.view'))));

CREATE POLICY group_activity_select ON public.group_activity FOR SELECT TO authenticated
  USING (public.is_tontine_member(auth.uid(), tontine_id)
         OR public.has_permission(auth.uid(), 'groups.view'));

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'settings.view'));

CREATE POLICY app_settings_select ON public.app_settings FOR SELECT TO authenticated
  USING (is_sensitive = false OR public.has_permission(auth.uid(), 'settings.view'));

CREATE POLICY sms_providers_select ON public.sms_providers FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.view'));

CREATE POLICY system_events_select ON public.system_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'settings.view')
         OR public.has_permission(auth.uid(), 'reports.view'));

-- ===== Payment application (idempotent) =====
CREATE OR REPLACE FUNCTION public.apply_payment_success(_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tx public.payment_transactions%ROWTYPE;
  _member public.tontine_members%ROWTYPE;
  _contribution public.contributions%ROWTYPE;
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

  -- only credit once per transaction
  IF EXISTS (SELECT 1 FROM public.group_activity
             WHERE tontine_id = _tx.group_ref::uuid AND kind = 'payment' AND message LIKE '%' || _reference || '%') THEN
    RETURN;
  END IF;

  UPDATE public.contributions
  SET amount_paid = amount_paid + _tx.amount,
      status = CASE WHEN amount_paid + _tx.amount >= amount_due THEN 'paid' ELSE 'partial' END,
      updated_at = now()
  WHERE id = _contribution.id;

  INSERT INTO public.group_activity (tontine_id, actor_id, kind, message)
  VALUES (_tx.group_ref::uuid, _tx.member_id, 'payment',
          _member.name || ' a payé ' || _tx.amount || ' ' || _tx.currency || ' (' || _reference || ')');
END;
$$;

-- ===== Default settings & SMS provider row =====
INSERT INTO public.app_settings (key, value, label, is_sensitive) VALUES
  ('app.name', '"ZUKA PAY"', 'Nom de l''application', false),
  ('app.languages', '["fr","en","sw"]', 'Langues disponibles', false),
  ('app.currencies', '["CDF","USD"]', 'Devises disponibles', false),
  ('app.maintenance', 'false', 'Mode maintenance', false),
  ('app.min_version', '"1.0.0"', 'Version minimale de l''application', false),
  ('app.system_message', '""', 'Message système', false),
  ('tx.min_amount', '{"CDF":500,"USD":1}', 'Montant minimum par transaction', false),
  ('tx.max_amount', '{"CDF":5000000,"USD":2000}', 'Montant maximum par transaction', false),
  ('notif.reminder_days', '[3,1,0]', 'Rappels avant échéance (jours)', false),
  ('notif.sms_enabled', 'false', 'Envoi des notifications par SMS', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sms_providers (name, slug, environment, api_base_url, countries)
VALUES ('Twilio', 'twilio', 'sandbox', 'https://api.twilio.com', '{CD}')
ON CONFLICT (slug) DO NOTHING;

-- ===== Subscription tiers aligned with the requested pricing =====
UPDATE public.group_pricing_tiers SET active = false WHERE active = true;
INSERT INTO public.group_pricing_tiers (label, min_members, max_members, price, currency, active) VALUES
  ('2-5 membres', 2, 5, 1, 'USD', true),
  ('6-10 membres', 6, 10, 2, 'USD', true),
  ('11-20 membres', 11, 20, 4, 'USD', true),
  ('21-50 membres', 21, 50, 7, 'USD', true),
  ('51-100 membres', 51, 100, 12, 'USD', true),
  ('101-250 membres', 101, 250, 20, 'USD', true),
  ('Plus de 250 membres', 251, NULL, 0, 'USD', true);

-- ===== updated_at triggers =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tontines_touch BEFORE UPDATE ON public.tontines FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tontine_members_touch BEFORE UPDATE ON public.tontine_members FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER contributions_touch BEFORE UPDATE ON public.contributions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER swaps_touch BEFORE UPDATE ON public.beneficiary_swaps FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sms_providers_touch BEFORE UPDATE ON public.sms_providers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

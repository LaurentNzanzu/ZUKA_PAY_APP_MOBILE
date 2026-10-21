-- ============ ROLES & PROFILES ============
CREATE TYPE public.app_role AS ENUM ('super_admin','admin','user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_permissions (
  key text PRIMARY KEY,
  category text NOT NULL,
  label text NOT NULL
);
GRANT SELECT ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL REFERENCES public.admin_permissions(key) ON DELETE CASCADE,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);
GRANT SELECT ON public.admin_user_permissions TO authenticated;
GRANT ALL ON public.admin_user_permissions TO service_role;
ALTER TABLE public.admin_user_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_accounts (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT admin_accounts_status_chk CHECK (status IN ('active','suspended'))
);
CREATE UNIQUE INDEX admin_accounts_email_active_idx ON public.admin_accounts (lower(email));
GRANT SELECT ON public.admin_accounts TO authenticated;
GRANT ALL ON public.admin_accounts TO service_role;
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_active_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_accounts a
    JOIN public.user_roles r ON r.user_id = a.user_id
    WHERE a.user_id = _user_id AND a.status = 'active'
      AND r.role IN ('admin','super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_admin(_user_id) AND (
    public.has_role(_user_id, 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.admin_user_permissions p
      WHERE p.user_id = _user_id AND p.permission = _permission
    )
  );
$$;

-- profiles policies
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_permission(auth.uid(), 'users.view'));
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- role / permission read policies
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'admins.view'));
CREATE POLICY "admin_permissions_select" ON public.admin_permissions FOR SELECT TO authenticated
  USING (public.is_active_admin(auth.uid()));
CREATE POLICY "admin_user_permissions_select" ON public.admin_user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'admins.view'));
CREATE POLICY "admin_accounts_select" ON public.admin_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'admins.view'));

-- ============ INVITATIONS ============
CREATE TABLE public.admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'admin',
  permissions text[] NOT NULL DEFAULT '{}',
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_invitations_status_chk CHECK (status IN ('pending','accepted','revoked','expired')),
  CONSTRAINT admin_invitations_role_chk CHECK (role IN ('admin','super_admin'))
);
CREATE UNIQUE INDEX admin_invitations_pending_email_idx
  ON public.admin_invitations (lower(email)) WHERE status = 'pending';
GRANT SELECT ON public.admin_invitations TO authenticated;
GRANT ALL ON public.admin_invitations TO service_role;
ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_invitations_select" ON public.admin_invitations FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'admins.view'));

-- ============ AUDIT LOG (append-only) ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  result text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'reports.view') OR public.has_permission(auth.uid(), 'admins.view'));

-- ============ PRICING ============
CREATE TABLE public.group_pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  min_members integer NOT NULL,
  max_members integer,
  price numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_pricing_currency_chk CHECK (currency IN ('USD','CDF')),
  CONSTRAINT group_pricing_range_chk CHECK (max_members IS NULL OR max_members >= min_members)
);
GRANT SELECT ON public.group_pricing_tiers TO authenticated;
GRANT ALL ON public.group_pricing_tiers TO service_role;
ALTER TABLE public.group_pricing_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_select" ON public.group_pricing_tiers FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'pricing.view') OR active);

-- ============ GROUP SUBSCRIPTIONS ============
CREATE TABLE public.group_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_ref text NOT NULL,
  group_name text NOT NULL,
  member_count integer NOT NULL,
  tier_id uuid REFERENCES public.group_pricing_tiers(id) ON DELETE SET NULL,
  tier_label text,
  price_locked numeric(12,2) NOT NULL,
  currency text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  transaction_ref text,
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_subscriptions_status_chk CHECK (status IN ('pending','paid','failed','expired','cancelled'))
);
GRANT SELECT ON public.group_subscriptions TO authenticated;
GRANT ALL ON public.group_subscriptions TO service_role;
ALTER TABLE public.group_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_subscriptions_select" ON public.group_subscriptions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'payments.view'));

-- ============ PAYMENT PROVIDERS ============
CREATE TABLE public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  environment text NOT NULL DEFAULT 'sandbox',
  enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  countries text[] NOT NULL DEFAULT '{CD}',
  currencies text[] NOT NULL DEFAULT '{CDF,USD}',
  api_base_url text,
  public_key text,
  secret_ref text,
  secret_last4 text,
  status text NOT NULL DEFAULT 'unconfigured',
  last_error text,
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_providers_env_chk CHECK (environment IN ('sandbox','production')),
  CONSTRAINT payment_providers_status_chk CHECK (status IN ('unconfigured','ok','error'))
);
GRANT SELECT ON public.payment_providers TO authenticated;
GRANT ALL ON public.payment_providers TO service_role;
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_providers_select" ON public.payment_providers FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'mobile_money.view'));

-- ============ TRANSACTIONS & WEBHOOKS ============
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  provider_id uuid REFERENCES public.payment_providers(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'contribution',
  group_ref text,
  due_ref text,
  member_id uuid,
  msisdn text,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  provider_reference text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_transactions_status_chk CHECK (status IN ('PENDING','PROCESSING','SUCCESS','FAILED','CANCELLED','EXPIRED')),
  CONSTRAINT payment_transactions_kind_chk CHECK (kind IN ('contribution','subscription'))
);
CREATE INDEX payment_transactions_created_idx ON public.payment_transactions (created_at DESC);
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_transactions_select" ON public.payment_transactions FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.has_permission(auth.uid(), 'transactions.view'));

CREATE TABLE public.payment_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.payment_providers(id) ON DELETE SET NULL,
  event_id text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, event_id)
);
GRANT SELECT ON public.payment_webhooks TO authenticated;
GRANT ALL ON public.payment_webhooks TO service_role;
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_webhooks_select" ON public.payment_webhooks FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'transactions.view'));

-- ============ SEED PERMISSION CATALOG & PRICING ============
INSERT INTO public.admin_permissions (key, category, label) VALUES
  ('users.view','Utilisateurs','Consulter les utilisateurs'),
  ('users.manage','Utilisateurs','Gérer les utilisateurs'),
  ('users.suspend','Utilisateurs','Suspendre un utilisateur'),
  ('groups.view','Groupes','Consulter les groupes'),
  ('groups.manage','Groupes','Gérer les groupes'),
  ('groups.suspend','Groupes','Suspendre un groupe'),
  ('transactions.view','Transactions','Consulter les transactions'),
  ('transactions.manage','Transactions','Gérer les transactions'),
  ('transactions.refund','Transactions','Rembourser une transaction'),
  ('payments.view','Paiements','Consulter les abonnements'),
  ('payments.manage','Paiements','Gérer les abonnements'),
  ('mobile_money.view','Mobile Money','Consulter les fournisseurs'),
  ('mobile_money.manage','Mobile Money','Gérer les fournisseurs'),
  ('pricing.view','Tarification','Consulter les tarifs'),
  ('pricing.manage','Tarification','Gérer les tarifs'),
  ('reports.view','Rapports','Consulter les rapports'),
  ('reports.export','Rapports','Exporter les rapports'),
  ('admins.view','Administration','Consulter les administrateurs'),
  ('admins.manage','Administration','Gérer les administrateurs'),
  ('settings.view','Paramètres','Consulter les paramètres'),
  ('settings.manage','Paramètres','Gérer les paramètres');

INSERT INTO public.group_pricing_tiers (label, min_members, max_members, price, currency) VALUES
  ('2–5 membres', 2, 5, 2.00, 'USD'),
  ('6–10 membres', 6, 10, 4.00, 'USD'),
  ('11–20 membres', 11, 20, 7.00, 'USD'),
  ('21–50 membres', 21, 50, 15.00, 'USD'),
  ('51–100 membres', 51, 100, 25.00, 'USD'),
  ('101–250 membres', 101, 250, 45.00, 'USD'),
  ('Enterprise (250+)', 251, NULL, 90.00, 'USD');

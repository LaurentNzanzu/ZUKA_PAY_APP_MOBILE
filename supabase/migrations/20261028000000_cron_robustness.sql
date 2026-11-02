-- =============================================================
-- Cron robustness (Option 2 + 3 backend-only)
-- =============================================================

-- 1. Historique complet de chaque exécution
CREATE TABLE public.cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  triggered_by text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  error text,
  duration_ms integer,
  created_count integer,
  CONSTRAINT cron_runs_status_chk CHECK (status IN ('running','success','failed')),
  CONSTRAINT cron_runs_triggered_by_chk CHECK (triggered_by IN ('interval','request','boot','manual'))
);

CREATE INDEX cron_runs_kind_started_idx ON public.cron_runs(kind, started_at DESC);
CREATE INDEX cron_runs_running_idx ON public.cron_runs(kind, started_at DESC) WHERE status = 'running';

-- 2. Lock single-row (auto-expire pour résilience)
CREATE TABLE public.cron_lock (
  kind text PRIMARY KEY,
  locked_until timestamptz,
  locked_by text,
  acquired_at timestamptz
);

INSERT INTO public.cron_lock (kind) VALUES ('reminders') ON CONFLICT DO NOTHING;

-- 3. RLS + grants (service_role only)
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_lock ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cron_runs FROM anon, authenticated;
REVOKE ALL ON public.cron_lock FROM anon, authenticated;
GRANT ALL ON public.cron_runs TO service_role;
GRANT ALL ON public.cron_lock TO service_role;

-- 4. RPC : acquire lock (avec garde anti-double-exécution)
CREATE OR REPLACE FUNCTION public.acquire_cron_lock(
  _kind text,
  _instance_id text,
  _timeout_sec int DEFAULT 600
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _acquired boolean;
BEGIN
  -- Garde : un run "running" depuis < 5 min bloque toute nouvelle tentative
  IF EXISTS (
    SELECT 1 FROM public.cron_runs
    WHERE kind = _kind
      AND status = 'running'
      AND started_at > now() - interval '5 minutes'
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.cron_lock
  SET locked_until = now() + make_interval(secs => _timeout_sec),
      locked_by = _instance_id,
      acquired_at = now()
  WHERE kind = _kind
    AND (locked_until IS NULL OR locked_until < now())
  RETURNING true INTO _acquired;

  RETURN COALESCE(_acquired, false);
END;
$$;

-- 5. RPC : release lock (idempotent)
CREATE OR REPLACE FUNCTION public.release_cron_lock(_kind text, _instance_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.cron_lock
  SET locked_until = NULL, locked_by = NULL, acquired_at = NULL
  WHERE kind = _kind AND locked_by = _instance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_cron_lock(text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_cron_lock(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_cron_lock(text, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cron_lock(text, text) TO service_role;

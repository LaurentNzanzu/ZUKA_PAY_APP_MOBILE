-- Migration: 20261028000000_cron_robustness.sql
-- Description: Robust backend-only cron orchestration (cron_runs, cron_lock, RPCs)

-- ============================================================================
-- 1. Table cron_runs : Journal des exécutions du cron
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  triggered_by text NOT NULL CHECK (triggered_by IN ('interval', 'request', 'boot', 'manual')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  error text,
  duration_ms integer,
  created_count integer
);

-- Index pour requêter rapidement la dernière exécution par type et date
CREATE INDEX IF NOT EXISTS cron_runs_kind_started_at_idx ON public.cron_runs(kind, started_at DESC);
CREATE INDEX IF NOT EXISTS cron_runs_status_idx ON public.cron_runs(status);

-- Sécurité RLS cron_runs : accessible uniquement par service_role
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_runs FROM anon, authenticated;
GRANT ALL ON public.cron_runs TO service_role;

-- ============================================================================
-- 2. Table cron_lock : Verrou distribué anti-concurrence
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cron_lock (
  kind text PRIMARY KEY,
  locked_until timestamptz,
  locked_by text,
  acquired_at timestamptz
);

-- Sécurité RLS cron_lock : accessible uniquement par service_role
ALTER TABLE public.cron_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_lock FROM anon, authenticated;
GRANT ALL ON public.cron_lock TO service_role;

-- Initialisation de la ligne pour le verrou 'reminders'
INSERT INTO public.cron_lock (kind, locked_until, locked_by, acquired_at)
VALUES ('reminders', NULL, NULL, NULL)
ON CONFLICT (kind) DO NOTHING;

-- ============================================================================
-- 3. RPC acquire_cron_lock : Acquisition atomique du verrou
-- Empêche l'exécution simultanée, gère l'expiration (15 min par défaut)
-- et vérifie qu'aucun run récent n'est encore marqué 'running'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.acquire_cron_lock(
  _kind text,
  _locked_by text,
  _lock_timeout_sec int DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := clock_timestamp();
  _has_active_running_run boolean;
  _acquired boolean := false;
BEGIN
  -- Vérifier s'il existe une exécution récente marquée 'running' dans la fenêtre de verrouillage
  SELECT EXISTS (
    SELECT 1 FROM public.cron_runs
    WHERE kind = _kind
      AND status = 'running'
      AND started_at > _now - (_lock_timeout_sec || ' seconds')::interval
  ) INTO _has_active_running_run;

  IF _has_active_running_run THEN
    RETURN false;
  END IF;

  -- Tentative d'acquisition atomique
  UPDATE public.cron_lock
  SET
    locked_until = _now + (_lock_timeout_sec || ' seconds')::interval,
    locked_by = _locked_by,
    acquired_at = _now
  WHERE kind = _kind
    AND (locked_until IS NULL OR locked_until < _now);

  IF FOUND THEN
    _acquired := true;
  END IF;

  RETURN _acquired;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_cron_lock(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_cron_lock(text, text, int) TO service_role;

-- ============================================================================
-- 4. RPC release_cron_lock : Libération atomique du verrou par son détenteur
-- ============================================================================
CREATE OR REPLACE FUNCTION public.release_cron_lock(
  _kind text,
  _locked_by text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _released boolean := false;
BEGIN
  UPDATE public.cron_lock
  SET
    locked_until = NULL,
    locked_by = NULL,
    acquired_at = NULL
  WHERE kind = _kind
    AND locked_by = _locked_by;

  IF FOUND THEN
    _released := true;
  END IF;

  RETURN _released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_cron_lock(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cron_lock(text, text) TO service_role;


ALTER TABLE public.tontines
  ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reminders jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_dues integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS legacy_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS tontines_legacy_ref_key
  ON public.tontines(created_by, legacy_ref) WHERE legacy_ref IS NOT NULL;

ALTER TABLE public.tontine_members
  ADD COLUMN IF NOT EXISTS acceptance text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS legacy_ref text;

ALTER TABLE public.contribution_periods
  ADD COLUMN IF NOT EXISTS legacy_ref text;

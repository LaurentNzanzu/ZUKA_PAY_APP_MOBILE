ALTER TABLE public.tontines
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

UPDATE public.tontines SET invite_token = translate(encode(gen_random_bytes(24),'base64'),'+/=','-_') WHERE invite_token IS NULL;
ALTER TABLE public.tontines ALTER COLUMN invite_token SET DEFAULT translate(encode(gen_random_bytes(24),'base64'),'+/=','-_');
ALTER TABLE public.tontines ALTER COLUMN invite_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tontines_invite_token_key ON public.tontines(invite_token);

CREATE TABLE public.tontine_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id uuid NOT NULL REFERENCES public.tontines(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','refused','cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  override_disputes boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tontine_join_requests_one_pending ON public.tontine_join_requests(tontine_id, user_id) WHERE status = 'pending';
GRANT SELECT ON public.tontine_join_requests TO authenticated;
GRANT ALL ON public.tontine_join_requests TO service_role;
ALTER TABLE public.tontine_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requester or group admin can view join requests" ON public.tontine_join_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tontine_admin(auth.uid(), tontine_id));
CREATE TRIGGER touch_join_requests BEFORE UPDATE ON public.tontine_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
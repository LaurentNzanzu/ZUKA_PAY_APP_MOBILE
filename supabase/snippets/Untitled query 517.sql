-- Supprimer les invitations legacy orphelines (système remplacé par tontine_join_requests)
DELETE FROM public.tontine_invitations WHERE status = 'obsolete';

-- Documenter que la table n'est plus utilisée
COMMENT ON TABLE public.tontine_invitations IS
  'LEGACY : remplacé par tontine_join_requests. Ne pas utiliser pour de nouveaux flux.';

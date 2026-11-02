-- Ajout de la colonne device_id pour le rate limiting par appareil
ALTER TABLE public.auth_otp_rate_limits 
ADD COLUMN IF NOT EXISTS device_id text;

-- Index partiel pour les requêtes sur device_id non nulles
CREATE INDEX IF NOT EXISTS auth_otp_rate_limits_device_idx 
ON public.auth_otp_rate_limits(device_id, created_at DESC) 
WHERE device_id IS NOT NULL;

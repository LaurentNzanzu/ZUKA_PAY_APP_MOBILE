SELECT id, phone, attempts, max_attempts, is_used, created_at 
FROM public.auth_otps 
ORDER BY created_at DESC 
LIMIT 1;
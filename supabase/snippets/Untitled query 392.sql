SELECT id, kind, status, triggered_by, started_at, duration_ms 
FROM public.cron_runs 
ORDER BY started_at DESC 
LIMIT 1;
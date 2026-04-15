-- Scheduled WhatsApp notification jobs via pg_cron
-- Requires: pg_cron extension (enabled by default on Supabase)
-- Requires: net extension for HTTP calls (enable in Supabase Dashboard → Database → Extensions)

-- Remove existing jobs if any
SELECT cron.unschedule('notif-sexta')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-sexta');
SELECT cron.unschedule('notif-sabado')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-sabado');
SELECT cron.unschedule('notif-aniv')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notif-aniv');

-- Friday 18:00 BRT (21:00 UTC) — confirmation reminder for next Sunday
SELECT cron.schedule(
  'notif-sexta',
  '0 21 * * 5',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/notificacoes',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"job":"sexta"}'
  );
  $$
);

-- Saturday 09:00 BRT (12:00 UTC) — reinforcement + Líder Geral alert
SELECT cron.schedule(
  'notif-sabado',
  '0 12 * * 6',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/notificacoes',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"job":"sabado"}'
  );
  $$
);

-- Daily 08:00 BRT (11:00 UTC) — birthday check
SELECT cron.schedule(
  'notif-aniv',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/notificacoes',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"job":"aniversario"}'
  );
  $$
);

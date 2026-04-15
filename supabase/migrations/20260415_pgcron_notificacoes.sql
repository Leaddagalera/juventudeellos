-- Scheduled WhatsApp notification jobs via pg_cron + pg_net
-- Requires: pg_cron extension (enabled by default on Supabase)
-- Requires: pg_net extension — enable in: Dashboard → Database → Extensions → pg_net

-- Remove existing jobs if any (idempotent)
SELECT cron.unschedule('notif-sexta')   FROM cron.job WHERE jobname = 'notif-sexta';
SELECT cron.unschedule('notif-sabado')  FROM cron.job WHERE jobname = 'notif-sabado';
SELECT cron.unschedule('notif-aniv')    FROM cron.job WHERE jobname = 'notif-aniv';

-- Friday 18:00 BRT (21:00 UTC) — confirmation reminder for next Sunday
SELECT cron.schedule(
  'notif-sexta',
  '0 21 * * 5',
  $$
  SELECT net.http_post(
    url     := 'https://mboimduiogwaggzkikna.supabase.co/functions/v1/notificacoes',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"job":"sexta","secret":"ellos-cron-2026"}'::jsonb
  );
  $$
);

-- Saturday 09:00 BRT (12:00 UTC) — reinforcement + Líder Geral alert
SELECT cron.schedule(
  'notif-sabado',
  '0 12 * * 6',
  $$
  SELECT net.http_post(
    url     := 'https://mboimduiogwaggzkikna.supabase.co/functions/v1/notificacoes',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"job":"sabado","secret":"ellos-cron-2026"}'::jsonb
  );
  $$
);

-- Daily 08:00 BRT (11:00 UTC) — birthday check
SELECT cron.schedule(
  'notif-aniv',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mboimduiogwaggzkikna.supabase.co/functions/v1/notificacoes',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"job":"aniversario","secret":"ellos-cron-2026"}'::jsonb
  );
  $$
);

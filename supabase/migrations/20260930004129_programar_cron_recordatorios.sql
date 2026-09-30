-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Eliminar el job previo si existía para evitar duplicados
SELECT cron.unschedule('revisar-recordatorios-diario') 
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'revisar-recordatorios-diario'
);

-- 3. Programar el cron leyendo dinámicamente el URL y Anon Key del entorno de Supabase
SELECT cron.schedule(
    'revisar-recordatorios-diario',
    '0 12 * * *', -- Todos los días a las 12:00 UTC (9:00 AM Argentina)
    $$
    SELECT net.http_post(
        url := (SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/revisar-recordatorios',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.anon_key', true))
        ),
        body := '{}'::jsonb
    );
    $$
);
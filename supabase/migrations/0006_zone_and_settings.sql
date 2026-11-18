-- 0006 : zone d'un projet ; réglages de l'application (connexion Airtable) lisibles par le serveur uniquement
alter table projects add column if not exists zone text;

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- RLS activée sans politique : seul le serveur (clé service) lit et écrit ; le jeton Airtable n'est jamais renvoyé au navigateur
alter table app_settings enable row level security;

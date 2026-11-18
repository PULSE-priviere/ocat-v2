-- 0003 : noms du staff et du contact OSC, informations de l'organisation, approfondissement par section
alter table profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table subjects
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name text,
  add column if not exists country text,
  add column if not exists org_type text,
  add column if not exists org_size text;

-- {"1": true, "4": false} : l'OSC souhaite-t-elle approfondir la section ?
alter table assessments
  add column if not exists section_deepen jsonb not null default '{}'::jsonb;

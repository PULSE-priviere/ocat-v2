-- 0013 : types de structure propres à un projet
-- [{ "key": "loi_90", "fr": "Association loi 90", "en": "Association (law 90)" }, ...]
-- Liste vide = on utilise la liste par défaut de app.config.js.
alter table projects add column if not exists org_types jsonb not null default '[]'::jsonb;
alter table projects drop constraint if exists projects_org_types_check;
alter table projects add constraint projects_org_types_check check (jsonb_typeof(org_types) = 'array');

notify pgrst, 'reload schema';
-- 0012 : séances d'accompagnement (notes libres) et statut des besoins par diagnostic.
-- Remplace la saisie champ par champ par : une note libre par séance + un statut par besoin.
-- Les colonnes coach_notes, coach_action, coach_owner restent en place (ancien flux disponible).

-- Objectif de séances d'un projet (null = projet sans séances comptées : le compteur est masqué)
alter table projects add column if not exists sessions_target int;
alter table projects drop constraint if exists projects_sessions_target_check;
alter table projects add constraint projects_sessions_target_check
  check (sessions_target is null or sessions_target between 1 and 200);

-- Une séance = une date + des notes libres
create table if not exists coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  session_date date not null default current_date,
  notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'done')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coaching_sessions_assessment on coaching_sessions(assessment_id, session_date);

-- Statut de chaque besoin pour un diagnostic, avec le résumé validé par le coach
create table if not exists need_status (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  need_id uuid not null references needs(id) on delete cascade,
  status text not null default 'todo'
    check (status in ('todo', 'discussed', 'covered', 'autonomy', 'out_of_scope')),
  decided text,        -- « Décidé »
  next_step text,      -- « Prochaine étape », texte libre (« T2 », « suivi »…)
  open_points text,    -- « Reste ouvert »
  last_session_id uuid references coaching_sessions(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (assessment_id, need_id)
);
create index if not exists need_status_assessment on need_status(assessment_id);

-- Un besoin ne peut être suivi que dans un diagnostic de SON projet
create or replace function need_status_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select project_id from needs where id = new.need_id)
     is distinct from project_of_assessment(new.assessment_id) then
    raise exception 'need_of_other_project';
  end if;
  return new;
end $$;
drop trigger if exists need_status_guard on need_status;
create trigger need_status_guard before insert or update of need_id, assessment_id on need_status
  for each row execute function need_status_guard();

-- Horodatage
drop trigger if exists coaching_sessions_touch on coaching_sessions;
create trigger coaching_sessions_touch before update on coaching_sessions
  for each row execute function touch_updated_at();
drop trigger if exists need_status_touch on need_status;
create trigger need_status_touch before update on need_status
  for each row execute function touch_updated_at();

-- Journal : on ajoute les deux tables. Les notes elles-mêmes ne sont pas journalisées
-- (enregistrement automatique fréquent) ; leur statut et leur date le sont.
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  n jsonb := to_jsonb(new);
  k text; pid uuid; lbl text;
begin
  pid := case tg_table_name
    when 'answers' then project_of_assessment((n->>'assessment_id')::uuid)
    when 'assessments' then (select project_id from subjects where id = (n->>'subject_id')::uuid)
    when 'action_plans' then project_of_assessment((n->>'assessment_id')::uuid)
    when 'coaching_sessions' then project_of_assessment((n->>'assessment_id')::uuid)
    when 'need_status' then project_of_assessment((n->>'assessment_id')::uuid)
    when 'subjects' then (n->>'project_id')::uuid end;
  lbl := coalesce((select email::text from profiles where id = auth.uid()), 'OSC');
  for k in select jsonb_object_keys(n) loop
    continue when k in ('id','updated_at','created_at','token_hash','token_expires_at','edited_by_coach');
    continue when tg_table_name = 'coaching_sessions' and k = 'notes';
    if (o -> k) is distinct from (n -> k) and not (tg_op = 'INSERT' and n -> k = 'null'::jsonb) then
      insert into audit_log(project_id, table_name, row_id, field, old_value, new_value, actor_id, actor_label)
      values (pid, tg_table_name, (n->>'id')::uuid, k, o ->> k, n ->> k, auth.uid(), lbl);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists audit_coaching_sessions on coaching_sessions;
create trigger audit_coaching_sessions after insert or update on coaching_sessions
  for each row execute function audit_row();
drop trigger if exists audit_need_status on need_status;
create trigger audit_need_status after insert or update on need_status
  for each row execute function audit_row();

-- Droits : mêmes règles que les réponses (owner du projet, coach affecté, administrateur)
alter table coaching_sessions enable row level security;
drop policy if exists cs_rw on coaching_sessions;
create policy cs_rw on coaching_sessions for all to authenticated
  using (can_assessment(assessment_id)) with check (can_assessment(assessment_id));

alter table need_status enable row level security;
drop policy if exists ns_rw on need_status;
create policy ns_rw on need_status for all to authenticated
  using (can_assessment(assessment_id)) with check (can_assessment(assessment_id));

notify pgrst, 'reload schema';

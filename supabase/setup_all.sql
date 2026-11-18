-- OCAT v2 — schéma de base (pilote)
create extension if not exists citext;
create extension if not exists pgcrypto;

-- Cadres d'évaluation (OCAT OSC aujourd'hui, entrepreneurs plus tard)
create table frameworks (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  version text not null default '1'
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references frameworks(id) on delete cascade,
  num int not null,
  name_fr text not null,
  name_en text not null,
  unique (framework_id, num)
);

-- Banque de questions ; assessment_id non nul = question ajoutée par le coach (F12)
create table questions (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references frameworks(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  concept_id text not null,
  code text,
  ord int not null default 0,
  format text not null default 'scale' check (format in ('scale','yesno','text')),
  text_fr text not null,
  text_en text not null default '',
  guide_fr text,
  guide_en text,
  active boolean not null default true,
  assessment_id uuid,               -- FK ajoutée plus bas
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index questions_bank_concept on questions(framework_id, concept_id) where assessment_id is null;

-- Profils staff (1-1 avec auth.users) ; administrateur = drapeau
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext unique not null,
  name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cohort text,
  framework_id uuid not null references frameworks(id),
  public_slug text unique not null default encode(gen_random_bytes(9),'hex'),
  public_active boolean not null default true,
  welcome_fr text,
  welcome_en text,
  offer_coach_choice boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table memberships (
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  role text not null check (role in ('owner','coach')),
  offered_to_osc boolean not null default true,   -- apparaît dans la liste F0/F30
  created_at timestamptz not null default now(),
  primary key (user_id, project_id, role)
);

-- L'OSC (ou l'entrepreneur)
create table subjects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  email citext not null,
  coach_id uuid references profiles(id) on delete set null,
  origin text not null default 'public' check (origin in ('public','manual')),
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  type text not null default 'baseline' check (type in ('baseline','followup','endline')),
  status text not null default 'in_progress' check (status in ('in_progress','submitted','locked')),
  token_hash text unique,
  token_expires_at timestamptz,
  section_comments jsonb not null default '{}'::jsonb,   -- {"1": "…"} commentaire OSC par section
  notes_shared boolean not null default false,          -- notes coach visibles dans le rapport OSC
  submitted_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table questions add constraint questions_assessment_fk
  foreign key (assessment_id) references assessments(id) on delete cascade;

create table answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  code text check (code in ('NA','1','2','3','yes','no')),   -- code stocké, jamais le libellé
  value_text text,                                          -- questions ajoutées au format texte
  support boolean,                                          -- appui demandé (seulement si 1 ou 2)
  coach_notes text,
  edited_by_coach boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (assessment_id, question_id)
);

create table needs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (project_id, label)
);

create table answer_needs (
  answer_id uuid not null references answers(id) on delete cascade,
  need_id uuid not null references needs(id) on delete cascade,
  primary key (answer_id, need_id)
);

create table action_plans (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid unique not null references assessments(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','validated','shared')),
  updated_at timestamptz not null default now()
);

-- Journal des modifications (F11, F29)
create table audit_log (
  id bigserial primary key,
  project_id uuid,
  table_name text not null,
  row_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  actor_id uuid,          -- null = OSC (via serveur)
  actor_label text,
  at timestamptz not null default now()
);

-- Limite de créations par IP (IP hachée)
create table rate_events (
  id bigserial primary key,
  kind text not null,
  ip_hash text not null,
  at timestamptz not null default now()
);
create index rate_events_idx on rate_events(kind, ip_hash, at);

create index on subjects(project_id);
create index on subjects(coach_id);
create index on assessments(subject_id);
create index on answers(assessment_id);
create index on audit_log(project_id, at desc);
-- OCAT v2 — droits par ligne, journal, règles métier

-- ── Fonctions d'accès (security definer : évitent la récursion RLS) ──
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

create or replace function has_role(p uuid, r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where user_id = auth.uid() and project_id = p and role = r)
$$;

create or replace function is_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or has_role(p, 'owner')
$$;

create or replace function is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from memberships where user_id = auth.uid() and project_id = p)
$$;

-- Owner du projet, ou coach encore membre ET affecté à l'OSC
create or replace function can_subject(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subjects x where x.id = s and (
      is_owner(x.project_id) or (x.coach_id = auth.uid() and has_role(x.project_id, 'coach'))
    ))
$$;

create or replace function can_assessment(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_subject((select subject_id from assessments where id = a))
$$;

create or replace function can_answer(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_assessment((select assessment_id from answers where id = a))
$$;

create or replace function shares_project(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m1 join memberships m2 using (project_id)
                 where m1.user_id = auth.uid() and m2.user_id = u)
$$;

create or replace function project_of_assessment(a uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.project_id from assessments x join subjects s on s.id = x.subject_id where x.id = a
$$;

-- ── Règles métier ──
-- Appui seulement pour 1 ou 2 ; marque les modifications faites par le staff ; horodatage
create or replace function answers_before() returns trigger language plpgsql as $$
begin
  if new.code is distinct from '1' and new.code is distinct from '2' then new.support := null; end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and
     (new.code is distinct from old.code or new.value_text is distinct from old.value_text
      or new.support is distinct from old.support) then
    new.edited_by_coach := true;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger answers_before before insert or update on answers
  for each row execute function answers_before();

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger plans_touch before update on action_plans for each row execute function touch_updated_at();

-- Seul un owner (ou admin) change le coach affecté
create or replace function subjects_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.coach_id is distinct from old.coach_id and not is_owner(new.project_id) then
    raise exception 'only_owner_can_reassign';
  end if;
  return new;
end $$;
create trigger subjects_guard before update on subjects for each row execute function subjects_guard();

-- Il reste toujours au moins un administrateur (F27)
create or replace function keep_one_admin() returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE' and old.is_admin) or (tg_op = 'UPDATE' and old.is_admin and not new.is_admin) then
    if (select count(*) from profiles where is_admin and id <> old.id) = 0 then
      raise exception 'last_admin';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger keep_one_admin before update or delete on profiles for each row execute function keep_one_admin();

-- ── Journal : auteur, date, ancienne valeur (jamais le jeton) ──
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
    when 'subjects' then (n->>'project_id')::uuid end;
  lbl := coalesce((select email::text from profiles where id = auth.uid()), 'OSC');
  for k in select jsonb_object_keys(n) loop
    continue when k in ('id','updated_at','created_at','token_hash','token_expires_at','edited_by_coach');
    if (o -> k) is distinct from (n -> k) and not (tg_op = 'INSERT' and n -> k = 'null'::jsonb) then
      insert into audit_log(project_id, table_name, row_id, field, old_value, new_value, actor_id, actor_label)
      values (pid, tg_table_name, (n->>'id')::uuid, k, o ->> k, n ->> k, auth.uid(), lbl);
    end if;
  end loop;
  return new;
end $$;
create trigger audit_answers after insert or update on answers for each row execute function audit_row();
create trigger audit_assessments after update on assessments for each row execute function audit_row();
create trigger audit_subjects after update on subjects for each row execute function audit_row();
create trigger audit_plans after update on action_plans for each row execute function audit_row();

-- ── RLS ──
alter table frameworks enable row level security;
alter table sections enable row level security;
alter table questions enable row level security;
alter table profiles enable row level security;
alter table projects enable row level security;
alter table memberships enable row level security;
alter table subjects enable row level security;
alter table assessments enable row level security;
alter table answers enable row level security;
alter table needs enable row level security;
alter table answer_needs enable row level security;
alter table action_plans enable row level security;
alter table audit_log enable row level security;
alter table rate_events enable row level security;    -- aucune policy : serveur uniquement

create policy fw_read on frameworks for select to authenticated using (true);
create policy fw_admin on frameworks for all to authenticated using (is_admin()) with check (is_admin());
create policy sec_read on sections for select to authenticated using (true);
create policy sec_admin on sections for all to authenticated using (is_admin()) with check (is_admin());

create policy q_read on questions for select to authenticated
  using (assessment_id is null or can_assessment(assessment_id));
create policy q_insert on questions for insert to authenticated
  with check (is_admin() or (assessment_id is not null and can_assessment(assessment_id)));
create policy q_update on questions for update to authenticated
  using (is_admin() or (assessment_id is not null and can_assessment(assessment_id)));
create policy q_delete on questions for delete to authenticated
  using (is_admin() or (assessment_id is not null and can_assessment(assessment_id)));

create policy prof_read on profiles for select to authenticated
  using (id = auth.uid() or is_admin() or shares_project(id));
create policy prof_admin on profiles for update to authenticated using (is_admin()) with check (is_admin());
create policy prof_self on profiles for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select p.is_admin from profiles p where p.id = auth.uid()));

create policy proj_read on projects for select to authenticated using (is_member(id));
create policy proj_insert on projects for insert to authenticated with check (is_admin());
create policy proj_update on projects for update to authenticated using (is_owner(id)) with check (is_owner(id));
create policy proj_delete on projects for delete to authenticated using (is_admin());

create policy mem_read on memberships for select to authenticated
  using (user_id = auth.uid() or is_owner(project_id));
create policy mem_write on memberships for all to authenticated
  using (is_admin() or (role = 'coach' and is_owner(project_id)))
  with check (is_admin() or (role = 'coach' and is_owner(project_id)));

create policy subj_read on subjects for select to authenticated using (can_subject(id));
create policy subj_insert on subjects for insert to authenticated with check (is_owner(project_id));
create policy subj_update on subjects for update to authenticated using (can_subject(id)) with check (can_subject(id) or is_owner(project_id));
create policy subj_delete on subjects for delete to authenticated using (is_owner(project_id));

create policy ass_read on assessments for select to authenticated using (can_subject(subject_id));
create policy ass_insert on assessments for insert to authenticated with check (can_subject(subject_id));
create policy ass_update on assessments for update to authenticated using (can_subject(subject_id)) with check (can_subject(subject_id));
create policy ass_delete on assessments for delete to authenticated
  using (is_owner((select project_id from subjects where id = subject_id)));

create policy ans_rw on answers for all to authenticated
  using (can_assessment(assessment_id)) with check (can_assessment(assessment_id));

create policy needs_read on needs for select to authenticated using (is_member(project_id));
create policy needs_insert on needs for insert to authenticated with check (is_member(project_id));
create policy needs_update on needs for update to authenticated using (is_owner(project_id));
create policy needs_delete on needs for delete to authenticated using (is_owner(project_id));

create policy an_rw on answer_needs for all to authenticated
  using (can_answer(answer_id)) with check (can_answer(answer_id));

create policy plan_rw on action_plans for all to authenticated
  using (can_assessment(assessment_id)) with check (can_assessment(assessment_id));

create policy audit_read on audit_log for select to authenticated using (is_owner(project_id));
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
-- 0004 : action et responsable par question (session coach) ; sections et questions propres à un projet

alter table answers
  add column if not exists coach_action text,
  add column if not exists coach_owner text;

alter table sections  add column if not exists project_id uuid references projects(id) on delete cascade;
alter table questions add column if not exists project_id uuid references projects(id) on delete cascade;
create index if not exists sections_project_idx  on sections(project_id);
create index if not exists questions_project_idx on questions(project_id);

-- Sections : lecture par les membres du projet ; écriture par l'owner (ou l'admin) pour son projet, l'admin pour la banque commune
drop policy if exists sec_read on sections;
drop policy if exists sec_admin on sections;
create policy sec_read on sections for select to authenticated
  using (project_id is null or is_member(project_id));
create policy sec_write on sections for all to authenticated
  using (is_admin() or (project_id is not null and is_owner(project_id)))
  with check (is_admin() or (project_id is not null and is_owner(project_id)));

-- Questions : même logique (les questions ajoutées par un coach à une évaluation restent inchangées)
drop policy if exists q_read on questions;
drop policy if exists q_insert on questions;
drop policy if exists q_update on questions;
drop policy if exists q_delete on questions;
create policy q_read on questions for select to authenticated
  using ((assessment_id is null and (project_id is null or is_member(project_id)))
         or (assessment_id is not null and can_assessment(assessment_id)));
create policy q_insert on questions for insert to authenticated
  with check (is_admin()
              or (assessment_id is not null and can_assessment(assessment_id))
              or (assessment_id is null and project_id is not null and is_owner(project_id)));
create policy q_update on questions for update to authenticated
  using (is_admin()
         or (assessment_id is not null and can_assessment(assessment_id))
         or (assessment_id is null and project_id is not null and is_owner(project_id)));
create policy q_delete on questions for delete to authenticated
  using (is_admin()
         or (assessment_id is not null and can_assessment(assessment_id))
         or (assessment_id is null and project_id is not null and is_owner(project_id)));

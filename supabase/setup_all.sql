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
-- 0005 : sections libres (données, sans score) et types de questions supplémentaires
alter table sections add column if not exists kind text not null default 'scored';
alter table sections drop constraint if exists sections_kind_check;
alter table sections add constraint sections_kind_check check (kind in ('scored', 'data'));

alter table questions drop constraint if exists questions_format_check;
alter table questions add constraint questions_format_check check (format in ('scale', 'yesno', 'text', 'short', 'number', 'choice'));
-- Liste des choix d'une question « choice » : [{ "key": "o1", "fr": "…", "en": "…" }]
alter table questions add column if not exists options jsonb;
-- 0006 : zone d'un projet ; réglages de l'application (connexion Airtable) lisibles par le serveur uniquement
alter table projects add column if not exists zone text;

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- RLS activée sans politique : seul le serveur (clé service) lit et écrit ; le jeton Airtable n'est jamais renvoyé au navigateur
alter table app_settings enable row level security;
-- 0007 : équipe d'un projet
-- Un owner gère les rôles (owner et/ou coach, jamais administrateur) ; tout membre du projet voit l'équipe ; un projet garde au moins un owner.

drop policy if exists mem_read on memberships;
drop policy if exists mem_write on memberships;

-- Tous les membres du projet (coachs compris) voient qui fait partie de l'équipe et avec quel rôle
create policy mem_read on memberships for select to authenticated using (is_member(project_id));

-- Seuls les owners du projet (et l'administrateur) ajoutent, modifient ou retirent des rôles
create policy mem_write on memberships for all to authenticated
  using (is_owner(project_id)) with check (is_owner(project_id));

-- Un owner ne peut pas retirer le dernier owner du projet (l'administrateur et le serveur ne sont pas concernés)
create or replace function keep_one_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.role = 'owner' and not is_admin()
     and not exists (select 1 from memberships m where m.project_id = old.project_id and m.role = 'owner' and m.user_id <> old.user_id) then
    raise exception 'last_owner';
  end if;
  return old;
end $$;
drop trigger if exists keep_one_owner on memberships;
create trigger keep_one_owner before delete on memberships for each row execute function keep_one_owner();
-- 0008 : suivi de la session d'accompagnement d'une évaluation
-- À planifier → planifiée → en cours → terminée. Le plan garde ses propres statuts (brouillon, validé, partagé).
alter table assessments add column if not exists session_status text not null default 'to_plan';
alter table assessments drop constraint if exists assessments_session_status_check;
alter table assessments add constraint assessments_session_status_check check (session_status in ('to_plan', 'planned', 'in_progress', 'done'));
alter table assessments add column if not exists session_date date;
-- 0009 : pays d'un projet (plusieurs possibles) ; le pays d'une organisation est choisi parmi eux au début du questionnaire.
-- Les pays sont stockés en codes ISO 3166-1 (MA, ZA…) ; leurs noms sont affichés dans la langue de l'écran.
alter table projects add column if not exists countries text[] not null default '{}';

-- Anciennes valeurs de la fiche organisation (liste fixe) : conversion en codes ISO
update subjects set country = case country
  when 'morocco' then 'MA' when 'algeria' then 'DZ' when 'tunisia' then 'TN' when 'libya' then 'LY'
  when 'egypt' then 'EG' when 'mauritania' then 'MR' when 'south_africa' then 'ZA' else country end
where country in ('morocco', 'algeria', 'tunisia', 'libya', 'egypt', 'mauritania', 'south_africa');
-- « Autre » n'existe plus : l'organisation choisira son pays dans la liste du projet
update subjects set country = null where country = 'other';
-- 0010 : invitations de l'équipe (coach, owner, administrateur)
-- Le lien d'activation envoyé par e-mail n'expire pas : il reste valable tant qu'il n'a pas servi (révocable).
-- Seule l'empreinte du jeton est conservée. Aucune politique d'accès : seul le serveur (clé service) lit et écrit.
create table if not exists staff_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  email text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists staff_invites_user on staff_invites(user_id);
alter table staff_invites enable row level security;

-- Recharge le schéma côté API (au cas où la table vient d'être créée)
notify pgrst, 'reload schema';
-- 0011 : une question rattachée à un projet ne peut se trouver que dans une section commune ou dans une section de CE projet.
-- (Un owner peut ajouter des questions à la fin des sections communes ; elles ne comptent pas dans le score.)
-- Le contrôle voit toutes les sections, y compris celles d'autres projets que la sécurité par ligne cacherait : fonction « security definer ».
create or replace function questions_section_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare sp uuid;
begin
  if new.assessment_id is null and new.project_id is not null then
    select project_id into sp from sections where id = new.section_id;
    if sp is not null and sp <> new.project_id then raise exception 'section_of_other_project'; end if;
  end if;
  return new;
end $$;
drop trigger if exists questions_section_guard on questions;
create trigger questions_section_guard before insert or update of section_id, project_id on questions
  for each row execute function questions_section_guard();
-- 0012 : question à choix multiple (plusieurs réponses possibles)
alter table questions drop constraint if exists questions_format_check;
alter table questions add constraint questions_format_check
  check (format in ('scale','yesno','text','short','number','choice','multi'));

notify pgrst, 'reload schema';
-- 0013 : types de structure propres à un projet
-- [{ "key": "loi_90", "fr": "Association loi 90", "en": "Association (law 90)" }, ...]
-- Liste vide = on utilise la liste par défaut de app.config.js.
alter table projects add column if not exists org_types jsonb not null default '[]'::jsonb;
alter table projects drop constraint if exists projects_org_types_check;
alter table projects add constraint projects_org_types_check check (jsonb_typeof(org_types) = 'array');

notify pgrst, 'reload schema';-- 0012 : séances d'accompagnement (notes libres) et statut des besoins par diagnostic.
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
-- Performance : index manquants et règles d'accès (RLS) calculées une seule fois par requête.
-- Avant : can_subject / can_assessment / can_answer étaient appelées pour chaque ligne lue,
-- avec plusieurs sous-requêtes imbriquées à chaque fois. Désormais, l'ensemble des OSC et des
-- évaluations accessibles est calculé une fois, puis comparé par hachage. Les droits sont inchangés.

-- ── Index ──
create index if not exists memberships_project_idx on memberships(project_id, user_id, role);
create index if not exists answer_needs_need_idx   on answer_needs(need_id);
create index if not exists needs_project_idx       on needs(project_id);
create index if not exists questions_framework_idx on questions(framework_id, ord) where assessment_id is null;
create index if not exists questions_assessment_idx on questions(assessment_id) where assessment_id is not null;
create index if not exists sections_framework_idx  on sections(framework_id, num);
create index if not exists answers_assessment_question_idx on answers(assessment_id, question_id);
create index if not exists need_status_assessment_idx on need_status(assessment_id);

-- ── Ensembles accessibles (mêmes règles que can_subject : owner du projet, ou coach membre affecté à l'OSC) ──
create or replace function my_subject_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from subjects s
  where is_admin()
     or s.project_id in (select project_id from memberships where user_id = auth.uid() and role = 'owner')
     or (s.coach_id = auth.uid()
         and s.project_id in (select project_id from memberships where user_id = auth.uid() and role = 'coach'))
$$;

create or replace function my_assessment_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id from assessments a where a.subject_id in (select my_subject_ids())
$$;

-- ── Règles réécrites ──
drop policy if exists subj_read on subjects;
create policy subj_read on subjects for select to authenticated
  using (id in (select my_subject_ids()));
drop policy if exists subj_update on subjects;
create policy subj_update on subjects for update to authenticated
  using (id in (select my_subject_ids()))
  with check (id in (select my_subject_ids()) or is_owner(project_id));

drop policy if exists ass_read on assessments;
create policy ass_read on assessments for select to authenticated
  using (subject_id in (select my_subject_ids()));
drop policy if exists ass_insert on assessments;
create policy ass_insert on assessments for insert to authenticated
  with check (subject_id in (select my_subject_ids()));
drop policy if exists ass_update on assessments;
create policy ass_update on assessments for update to authenticated
  using (subject_id in (select my_subject_ids()))
  with check (subject_id in (select my_subject_ids()));

drop policy if exists ans_rw on answers;
create policy ans_rw on answers for all to authenticated
  using (assessment_id in (select my_assessment_ids()))
  with check (assessment_id in (select my_assessment_ids()));

drop policy if exists an_rw on answer_needs;
create policy an_rw on answer_needs for all to authenticated
  using (answer_id in (select x.id from answers x where x.assessment_id in (select my_assessment_ids())))
  with check (answer_id in (select x.id from answers x where x.assessment_id in (select my_assessment_ids())));

drop policy if exists plan_rw on action_plans;
create policy plan_rw on action_plans for all to authenticated
  using (assessment_id in (select my_assessment_ids()))
  with check (assessment_id in (select my_assessment_ids()));

drop policy if exists cs_rw on coaching_sessions;
create policy cs_rw on coaching_sessions for all to authenticated
  using (assessment_id in (select my_assessment_ids()))
  with check (assessment_id in (select my_assessment_ids()));

drop policy if exists ns_rw on need_status;
create policy ns_rw on need_status for all to authenticated
  using (assessment_id in (select my_assessment_ids()))
  with check (assessment_id in (select my_assessment_ids()));

analyze memberships; analyze subjects; analyze assessments; analyze answers; analyze answer_needs;

notify pgrst, 'reload schema';
-- Chargement d'un projet en UN seul appel (espace équipe : cohorte, besoins, équipe…).
-- Avant : 9 à 22 requêtes en 5 à 8 vagues successives, soit 2 à 4 s quand chaque aller-retour coûte ~0,45 s.
-- La fonction s'exécute avec les droits de l'appelant (security invoker) : la sécurité par ligne s'applique
-- exactement comme pour les requêtes qu'elle remplace (un coach ne reçoit que ses organisations).
-- Elle renvoie un seul objet JSON : la limite de 1 000 lignes de l'API ne s'applique pas.

create or replace function project_load(p uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  with s as (
    select x.id, x.name, x.email, x.contact_first_name, x.contact_last_name, x.country, x.org_type, x.org_size,
           x.coach_id, x.origin, x.created_at
    from subjects x where x.project_id = p
  ),
  a as (
    select y.id, y.subject_id, y.type, y.status, y.submitted_at, y.created_at, y.session_status, y.session_date
    from assessments y join s on s.id = y.subject_id
  ),
  ans as (
    select z.id, z.assessment_id, z.question_id, z.code, z.support,
           (btrim(coalesce(z.coach_notes, '')) <> '' or btrim(coalesce(z.coach_action, '')) <> '') as work
    from answers z join a on a.id = z.assessment_id
  )
  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(to_jsonb(s) || jsonb_build_object('coach',
               case when pr.id is null then null
                    else jsonb_build_object('id', pr.id, 'name', pr.name, 'first_name', pr.first_name, 'last_name', pr.last_name, 'email', pr.email) end)
             order by s.name)
      from s left join profiles pr on pr.id = s.coach_id), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(to_jsonb(a)) from a), '[]'::jsonb),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('id', ans.id, 'assessment_id', ans.assessment_id,
               'question_id', ans.question_id, 'code', ans.code, 'support', ans.support)) from ans), '[]'::jsonb),
    'work', coalesce((select jsonb_agg(distinct ans.assessment_id) from ans where ans.work), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('assessment_id', pl.assessment_id, 'status', pl.status))
               from action_plans pl join a on a.id = pl.assessment_id), '[]'::jsonb),
    'needs', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'label', n.label) order by n.label)
               from needs n where n.project_id = p), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('answer_id', l.answer_id, 'need_id', l.need_id))
               from answer_needs l join needs n on n.id = l.need_id and n.project_id = p
               join ans on ans.id = l.answer_id), '[]'::jsonb)
  )
$$;

revoke all on function project_load(uuid) from public, anon;
grant execute on function project_load(uuid) to authenticated;

notify pgrst, 'reload schema';
-- Analytics de cohorte (mise à jour 3.12)
-- 1. Mode de passation d'une évaluation : auto-évaluation ou passation guidée (choisi par le coach, journalisé par l'audit existant)
alter table assessments add column if not exists administration_mode text not null default 'self';
alter table assessments drop constraint if exists assessments_administration_mode_check;
alter table assessments add constraint assessments_administration_mode_check check (administration_mode in ('self', 'guided'));

-- 2. Structure d'accompagnement d'une organisation (texte libre, par exemple « Luhnyezi ») : ce n'est pas un compte
alter table subjects add column if not exists support_org text;
alter table subjects drop constraint if exists subjects_support_org_len;
alter table subjects add constraint subjects_support_org_len check (support_org is null or char_length(support_org) <= 120);

-- Seul un owner du projet (ou l'administrateur) change la structure d'accompagnement. Le serveur (clé service, auth.uid() vide) n'est pas concerné.
create or replace function guard_support_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.support_org is distinct from old.support_org and auth.uid() is not null and not is_owner(new.project_id) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;
drop trigger if exists subjects_support_org_guard on subjects;
create trigger subjects_support_org_guard before update of support_org on subjects
  for each row execute function guard_support_org();

-- 3. Données de l'onglet Analytics en UN appel, réservé aux owners du projet et à l'administrateur.
-- Un seul objet JSON : la limite de 1 000 lignes de l'API ne s'applique pas.
-- Réponses retenues : questions à échelle de la banque ou du projet (pas celles ajoutées à une évaluation), codes NA, 1, 2, 3.
-- Le tri fin (questions complémentaires exclues, sections libres) est fait par isScored dans lib/scoring.js, seule source de la règle.
-- Périmètre : évaluations soumises, ou verrouillées après soumission ; p_include_in_progress ajoute les évaluations en cours
-- (et celles verrouillées avant d'avoir été soumises). p_type null = tous les types (l'écran filtre ensuite sans nouvel appel).
create or replace function analytics_rows(p_project uuid, p_type text default null, p_include_in_progress boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_owner(p_project) then raise exception 'forbidden'; end if;
  with s as (
    select x.id, x.name, x.country, x.org_type, x.org_size, x.coach_id, x.support_org,
           nullif(btrim(coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.name, pr.email)), '') as coach_name
    from subjects x left join profiles pr on pr.id = x.coach_id
    where x.project_id = p_project
  ),
  a as (
    select y.id, y.subject_id, y.type, y.status, y.administration_mode, y.submitted_at, y.created_at, y.section_comments
    from assessments y join s on s.id = y.subject_id
    where (p_type is null or y.type = p_type)
      and (p_include_in_progress or y.status = 'submitted' or (y.status = 'locked' and y.submitted_at is not null))
  )
  select jsonb_build_object(
    'subjects', coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from s), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(to_jsonb(a)) from a), '[]'::jsonb),
    -- Réponses en tableaux compacts : [assessment_id, question_id, code, support]
    'answers', coalesce((
      select jsonb_agg(jsonb_build_array(z.assessment_id, z.question_id, z.code, z.support))
      from answers z
      join a on a.id = z.assessment_id
      join questions q on q.id = z.question_id
      where q.format = 'scale' and q.assessment_id is null and z.code in ('NA', '1', '2', '3')), '[]'::jsonb)
  ) into out;
  return out;
end $$;

revoke all on function analytics_rows(uuid, text, boolean) from public, anon;
grant execute on function analytics_rows(uuid, text, boolean) to authenticated;

notify pgrst, 'reload schema';

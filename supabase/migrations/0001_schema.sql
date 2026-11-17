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

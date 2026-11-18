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

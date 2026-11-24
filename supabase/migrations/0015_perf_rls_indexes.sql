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

-- 0008 : suivi de la session d'accompagnement d'une évaluation
-- À planifier → planifiée → en cours → terminée. Le plan garde ses propres statuts (brouillon, validé, partagé).
alter table assessments add column if not exists session_status text not null default 'to_plan';
alter table assessments drop constraint if exists assessments_session_status_check;
alter table assessments add constraint assessments_session_status_check check (session_status in ('to_plan', 'planned', 'in_progress', 'done'));
alter table assessments add column if not exists session_date date;

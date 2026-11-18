-- Test des droits : à lancer sur une base de TEST (crée puis annule des données).
-- Supabase : coller dans l'éditeur SQL. Tout est dans une transaction annulée à la fin.
begin;

-- Données : 2 projets, 1 admin, 1 owner (P1), 2 coachs (P1), 3 OSC
insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-00000000000a','admin@test'),
 ('00000000-0000-0000-0000-00000000000b','owner@test'),
 ('00000000-0000-0000-0000-00000000000c','coach1@test'),
 ('00000000-0000-0000-0000-00000000000d','coach2@test');
insert into profiles(id, email, is_admin) values
 ('00000000-0000-0000-0000-00000000000a','admin@test', true),
 ('00000000-0000-0000-0000-00000000000b','owner@test', false),
 ('00000000-0000-0000-0000-00000000000c','coach1@test', false),
 ('00000000-0000-0000-0000-00000000000d','coach2@test', false);
insert into frameworks(id, key, name) values ('10000000-0000-0000-0000-000000000001','test_fw','Test');
insert into sections(id, framework_id, num, name_fr, name_en) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,'S1','S1');
insert into questions(id, framework_id, section_id, concept_id, text_fr) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','T-1','Q1');
insert into projects(id, name, framework_id) values
 ('40000000-0000-0000-0000-000000000001','P1','10000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','P2','10000000-0000-0000-0000-000000000001');
insert into memberships(user_id, project_id, role) values
 ('00000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-000000000001','owner'),
 ('00000000-0000-0000-0000-00000000000c','40000000-0000-0000-0000-000000000001','coach'),
 ('00000000-0000-0000-0000-00000000000d','40000000-0000-0000-0000-000000000001','coach');
insert into subjects(id, project_id, name, email, coach_id) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','OSC A','a@test','00000000-0000-0000-0000-00000000000c'),
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','OSC B','b@test','00000000-0000-0000-0000-00000000000d'),
 ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','OSC C','c@test', null);
insert into assessments(id, subject_id) values
 ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002'),
 ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003');
insert into answers(assessment_id, question_id, code, support) values
 ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','1', true),
 ('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','3', true),
 ('60000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','2', false);

create temp table results(test text, ok boolean);
grant all on results to authenticated;


-- Règle : l'appui est effacé pour une réponse 3
insert into results select 'support effacé si code 3',
  (select support from answers where assessment_id = '60000000-0000-0000-0000-000000000002') is null;

set local role authenticated;

-- Coach 1 : uniquement OSC A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into results select 'coach1 voit 1 OSC', (select count(*) from subjects) = 1;
insert into results select 'coach1 voit 1 réponse', (select count(*) from answers) = 1;
insert into results select 'coach1 ne voit pas P2', (select count(*) from projects where name = 'P2') = 0;
update answers set code = '2' where assessment_id = '60000000-0000-0000-0000-000000000002';
update answers set code = '2', coach_notes = 'note' where assessment_id = '60000000-0000-0000-0000-000000000001';
insert into results select 'coach1 modifie OSC A → marqué',
  (select edited_by_coach from answers where assessment_id = '60000000-0000-0000-0000-000000000001');
insert into results select 'coach1 ne lit pas le journal', (select count(*) from audit_log) = 0;
insert into results select 'coach1 ne lit pas rate_events', (select count(*) from rate_events) = 0;

-- Owner P1 : OSC A et B, pas C
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into results select 'owner voit 2 OSC', (select count(*) from subjects) = 2;
insert into results select 'owner voit le journal (ancienne valeur 1)',
  exists (select 1 from audit_log where field = 'code' and old_value = '1' and actor_label = 'coach1@test');
insert into results select 'owner voit 2 coachs', (select count(*) from memberships where role = 'coach') = 2;

-- Sections propres à un projet
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  insert into sections(framework_id, num, name_fr, name_en, project_id)
    values ('10000000-0000-0000-0000-000000000001', 10, 'Export', 'Export', '40000000-0000-0000-0000-000000000001');
  insert into results values ('owner ajoute une section à son projet', true);
exception when others then insert into results values ('owner ajoute une section à son projet', false); end $$;
do $$ begin
  insert into sections(framework_id, num, name_fr, name_en, project_id)
    values ('10000000-0000-0000-0000-000000000001', 11, 'Autre', 'Other', '40000000-0000-0000-0000-000000000002');
  insert into results values ('owner ne peut pas ajouter à un autre projet', false);
exception when others then insert into results values ('owner ne peut pas ajouter à un autre projet', true); end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into results select 'coach voit la section de son projet', (select count(*) from sections where project_id is not null) = 1;
do $$ begin
  insert into sections(framework_id, num, name_fr, name_en, project_id)
    values ('10000000-0000-0000-0000-000000000001', 12, 'Coach', 'Coach', '40000000-0000-0000-0000-000000000001');
  insert into results values ('coach ne peut pas ajouter de section', false);
exception when others then insert into results values ('coach ne peut pas ajouter de section', true); end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into sections(framework_id, num, name_fr, name_en, project_id)
  values ('10000000-0000-0000-0000-000000000001', 13, 'P2', 'P2', '40000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into results select 'owner P1 ne voit pas les sections de P2', (select count(*) from sections where project_id = '40000000-0000-0000-0000-000000000002') = 0;

-- Admin : tout
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into results select 'admin voit 3 OSC', (select count(*) from subjects) = 3;
insert into results select 'coach1 n''a pas pu modifier OSC B',
  (select code from answers where assessment_id = '60000000-0000-0000-0000-000000000002') = '3';

-- Révocation du coach 1 par l'owner : accès coupé immédiatement
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
delete from memberships where user_id = '00000000-0000-0000-0000-00000000000c';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into results select 'coach1 révoqué ne voit plus rien', (select count(*) from subjects) = 0;

-- Anonyme : rien
select set_config('request.jwt.claim.sub', '', true);
insert into results select 'non connecté ne voit rien', (select count(*) from subjects) = 0;

reset role;
select test, case when ok then 'OK' else 'ÉCHEC' end as result from results;
rollback;

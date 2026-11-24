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
create temp table p2sec as select id from sections where project_id = '40000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into results select 'owner P1 ne voit pas les sections de P2', (select count(*) from sections where project_id = '40000000-0000-0000-0000-000000000002') = 0;

-- Questions du projet : ajout à la fin d'une section COMMUNE par l'owner ; questions de base en lecture seule ; garde sur les sections d'autres projets
do $$ begin
  insert into questions(framework_id, section_id, project_id, concept_id, ord, text_fr)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'proj-test-1', 2, 'Q ajoutée');
  insert into results values ('owner ajoute une question à la fin d''une section commune', true);
exception when others then insert into results values ('owner ajoute une question à la fin d''une section commune', false); end $$;
do $$ declare n int; begin
  update questions set text_fr = 'modifiée' where id = '30000000-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  insert into results values ('owner ne peut pas modifier une question de base', n = 0);
end $$;
do $$ declare n int; begin
  delete from questions where id = '30000000-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  insert into results values ('owner ne peut pas supprimer une question de base', n = 0);
end $$;
do $$ declare n int; begin
  update questions set text_fr = 'Q ajoutée (modifiée)' where concept_id = 'proj-test-1'; get diagnostics n = row_count;
  insert into results values ('owner modifie une question qu''il a ajoutée', n = 1);
end $$;
do $$ begin
  insert into questions(framework_id, section_id, project_id, concept_id, ord, text_fr)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'proj-test-2', 3, 'pour P2');
  insert into results values ('owner ne peut pas ajouter une question à un AUTRE projet', false);
exception when others then insert into results values ('owner ne peut pas ajouter une question à un AUTRE projet', true); end $$;
do $$ begin
  insert into questions(framework_id, section_id, project_id, concept_id, ord, text_fr)
    values ('10000000-0000-0000-0000-000000000001', (select id from p2sec), '40000000-0000-0000-0000-000000000001', 'proj-test-3', 1, 'dans la section de P2');
  insert into results values ('une question de P1 ne peut pas être placée dans la section d''un autre projet (même invisible pour l''owner)', false);
exception when others then insert into results values ('une question de P1 ne peut pas être placée dans la section d''un autre projet (même invisible pour l''owner)', sqlerrm = 'section_of_other_project'); end $$;
do $$ begin
  update questions set section_id = (select id from p2sec) where concept_id = 'proj-test-1';
  insert into results values ('on ne peut pas non plus déplacer une question du projet vers la section d''un autre projet', false);
exception when others then insert into results values ('on ne peut pas non plus déplacer une question du projet vers la section d''un autre projet', sqlerrm = 'section_of_other_project'); end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into results select 'coach voit les questions ajoutées à son projet (et les questions de base)', (select count(*) from questions where project_id = '40000000-0000-0000-0000-000000000001') = 1 and (select count(*) from questions where project_id is null) = 1;
do $$ begin
  insert into questions(framework_id, section_id, project_id, concept_id, ord, text_fr)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'proj-test-4', 4, 'par un coach');
  insert into results values ('coach ne peut pas ajouter de question', false);
exception when others then insert into results values ('coach ne peut pas ajouter de question', true); end $$;
do $$ declare n int; begin
  update questions set text_fr = 'x' where concept_id = 'proj-test-1'; get diagnostics n = row_count;
  insert into results values ('coach ne peut pas modifier une question ajoutée', n = 0);
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);

-- Chargement en un appel (project_load) : mêmes droits que les tables
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into results select 'project_load : owner reçoit 2 OSC et 2 réponses',
  jsonb_array_length(project_load('40000000-0000-0000-0000-000000000001')->'subjects') = 2
  and jsonb_array_length(project_load('40000000-0000-0000-0000-000000000001')->'answers') = 2;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
insert into results select 'project_load : coach2 ne reçoit que son OSC',
  jsonb_array_length(project_load('40000000-0000-0000-0000-000000000001')->'subjects') = 1
  and project_load('40000000-0000-0000-0000-000000000001')->'subjects'->0->>'name' = 'OSC B';
insert into results select 'project_load : rien sur un projet dont on n''est pas membre',
  jsonb_array_length(project_load('40000000-0000-0000-0000-000000000002')->'subjects') = 0;

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

-- Équipe : lecture par les membres, rôles gérés par l'owner, dernier owner protégé
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
insert into results select 'coach voit l''équipe de son projet', (select count(*) from memberships where project_id = '40000000-0000-0000-0000-000000000001') = 2;
do $$ begin
  insert into memberships(user_id, project_id, role) values ('00000000-0000-0000-0000-00000000000d', '40000000-0000-0000-0000-000000000001', 'owner');
  insert into results values ('coach ne peut pas se donner le rôle owner', false);
exception when others then insert into results values ('coach ne peut pas se donner le rôle owner', true); end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  insert into memberships(user_id, project_id, role) values ('00000000-0000-0000-0000-00000000000d', '40000000-0000-0000-0000-000000000001', 'owner');
  insert into results values ('owner donne le rôle owner à un coach (qui reste coach)', true);
exception when others then insert into results values ('owner donne le rôle owner à un coach (qui reste coach)', false); end $$;
insert into results select 'la personne cumule les rôles owner et coach', (select count(*) from memberships where user_id = '00000000-0000-0000-0000-00000000000d' and project_id = '40000000-0000-0000-0000-000000000001') = 2;
do $$ begin
  delete from memberships where user_id = '00000000-0000-0000-0000-00000000000b' and role = 'owner';
  insert into results values ('un owner peut se retirer s''il reste un autre owner', true);
exception when others then insert into results values ('un owner peut se retirer s''il reste un autre owner', false); end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  delete from memberships where user_id = '00000000-0000-0000-0000-00000000000d' and role = 'owner';
  insert into results values ('le dernier owner ne peut pas être retiré', false);
exception when others then insert into results values ('le dernier owner ne peut pas être retiré', sqlerrm = 'last_owner'); end $$;

-- Séances d'accompagnement : droits et verrou « besoin du bon projet »
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);  -- coach1, OSC A
do $$ begin
  insert into coaching_sessions(assessment_id, notes) values ('60000000-0000-0000-0000-000000000001','n');
  insert into results values ('coach1 écrit une séance sur son OSC', true);
exception when others then insert into results values ('coach1 écrit une séance sur son OSC', false); end $$;
do $$ begin
  insert into coaching_sessions(assessment_id, notes) values ('60000000-0000-0000-0000-000000000003','x');
  insert into results values ('coach1 ne peut pas écrire une séance sur une autre OSC', false);
exception when others then insert into results values ('coach1 ne peut pas écrire une séance sur une autre OSC', true); end $$;

-- Un besoin ne peut être suivi que dans un diagnostic de son projet
insert into needs(id, project_id, label) values
 ('70000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Besoin P1'),
 ('70000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','Besoin P2');
do $$ begin
  insert into need_status(assessment_id, need_id, status) values ('60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','discussed');
  insert into results values ('coach1 pose un statut sur un besoin du bon projet', true);
exception when others then insert into results values ('coach1 pose un statut sur un besoin du bon projet', false); end $$;
do $$ begin
  insert into need_status(assessment_id, need_id, status) values ('60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','discussed');
  insert into results values ('need_status refuse un besoin d''un autre projet', false);
exception when others then insert into results values ('need_status refuse un besoin d''un autre projet', sqlerrm = 'need_of_other_project'); end $$;

-- L'owner lit les séances de son projet
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into results select 'owner lit les séances de son projet',
  (select count(*) from coaching_sessions where assessment_id = '60000000-0000-0000-0000-000000000001') >= 1;

reset role;
select test, case when ok then 'OK' else 'ÉCHEC' end as result from results;
rollback;

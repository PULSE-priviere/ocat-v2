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

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

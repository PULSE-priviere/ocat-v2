-- Facilitateur d'une organisation : nom d'un coach OU d'une structure d'accompagnement, en texte libre.
-- Champ d'analyse uniquement : aucun droit associé (coach_id reste la seule référence pour les droits).
-- Les règles d'accès existantes sur subjects s'appliquent telles quelles. Relançable sans risque.
alter table subjects add column if not exists facilitator text;

-- Analytics : même fonction qu'en 0017, qui renvoie en plus le facilitateur de chaque organisation
create or replace function analytics_rows(p_project uuid, p_type text default null, p_include_in_progress boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_owner(p_project) then raise exception 'forbidden'; end if;
  with s as (
    select x.id, x.name, x.country, x.org_type, x.org_size, x.coach_id, x.support_org, x.facilitator,
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
    'answers', coalesce((
      select jsonb_agg(jsonb_build_array(z.assessment_id, z.question_id, z.code, z.support))
      from answers z
      join a on a.id = z.assessment_id
      join questions q on q.id = z.question_id
      where q.format = 'scale' and q.assessment_id is null and z.code in ('NA', '1', '2', '3')), '[]'::jsonb)
  ) into out;
  return out;
end $$;

notify pgrst, 'reload schema';

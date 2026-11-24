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

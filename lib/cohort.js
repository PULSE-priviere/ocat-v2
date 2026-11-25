// Données d'un projet visibles par l'utilisateur (la RLS limite le coach à ses OSC)
import { sb, fetchAll, fetchIn } from './supabase';
import { loadBank } from './bank';
import { sectionProgress, sectionDisplay, globalDisplay, completion, EVAL_ORDER } from './scoring';
import { stageOf } from './stage';

// Un seul aller-retour : la fonction SQL project_load (migration 0016) renvoie organisations, évaluations, réponses,
// plans, travail du coach, besoins et leurs liens. Elle s'exécute avec les droits de l'appelant.
// Si la migration n'est pas encore passée, repli sur l'ancien chargement (plusieurs requêtes).
async function loadRaw(db, project) {
  const { data, error } = await db.rpc('project_load', { p: project.id });
  if (!error) return data;
  if (!['PGRST202', '42883'].includes(error.code)) throw error;     // fonction absente : on se replie, sinon vraie erreur
  return loadRawLegacy(db, project);
}

async function loadRawLegacy(db, project) {
  const [subjects, { data: needs, error: e1 }] = await Promise.all([
    fetchAll(() => db.from('subjects')
      .select('id, name, email, contact_first_name, contact_last_name, country, org_type, org_size, coach_id, facilitator, origin, created_at, coach:profiles(id, name, first_name, last_name, email)').eq('project_id', project.id).order('name')),
    db.from('needs').select('id, label').eq('project_id', project.id).order('label'),
  ]);
  if (e1) throw e1;
  const assessments = subjects.length ? await fetchIn(ids => db.from('assessments')
    .select('id, subject_id, type, status, submitted_at, created_at, session_status, session_date').in('subject_id', ids), subjects.map(s => s.id)) : [];
  const aIds = assessments.map(a => a.id);
  const needIds = (needs || []).map(n => n.id);
  const [answers, plans, work, links] = await Promise.all([
    aIds.length ? fetchIn(ids => db.from('answers').select('id, assessment_id, question_id, code, support').in('assessment_id', ids), aIds) : [],
    aIds.length ? fetchIn(ids => db.from('action_plans').select('assessment_id, status').in('assessment_id', ids), aIds) : [],
    aIds.length ? fetchIn(ids => db.from('answers').select('assessment_id, coach_notes, coach_action').in('assessment_id', ids).or('coach_notes.not.is.null,coach_action.not.is.null'), aIds) : [],
    // Liens filtrés par besoin du projet (quelques identifiants) et non par réponse (des milliers) : un seul lot
    needIds.length ? fetchIn(ids => db.from('answer_needs').select('answer_id, need_id').in('need_id', ids), needIds) : [],
  ]);
  const workIds = [...new Set(work.filter(w => String(w.coach_notes || '').trim() || String(w.coach_action || '').trim()).map(w => w.assessment_id))];
  return { subjects, assessments, answers, plans, work: workIds, needs: needs || [], links };
}

export async function loadCohort(project) {
  const db = sb();
  const [{ sections, questions }, raw] = await Promise.all([
    loadBank(db, project.framework_id, null, project.id),
    loadRaw(db, project),
  ]);
  const { subjects, assessments, answers, plans } = raw;
  const planBy = Object.fromEntries(plans.map(p => [p.assessment_id, p]));
  const workBy = Object.fromEntries(raw.work.map(id => [id, true]));
  const byAssessment = {};
  answers.forEach(a => { (byAssessment[a.assessment_id] = byAssessment[a.assessment_id] || {})[a.question_id] = a; });
  const assessBy = {};
  assessments.forEach(a => { (assessBy[a.subject_id] = assessBy[a.subject_id] || []).push(a); });

  const rows = subjects.map(s => {
    const list = (assessBy[s.id] || [])
      .sort((a, b) => EVAL_ORDER.indexOf(a.type) - EVAL_ORDER.indexOf(b.type) || a.created_at.localeCompare(b.created_at));
    const current = list[list.length - 1] || null;
    const progress = current ? sectionProgress(sections, questions, byAssessment[current.id] || {}) : [];
    const gd = progress.length ? globalDisplay(progress) : { value: null, provisional: false };
    return {
      subject: s, assessments: list, current, plan: current ? planBy[current.id] || null : null, hasWork: !!(current && workBy[current.id]),
      stage: stageOf({ assessment: current, plan: current ? planBy[current.id] : null, hasWork: !!(current && workBy[current.id]) }), progress,
      completion: completion(progress), global: gd.value, globalProvisional: gd.provisional,
      scores: progress.map(x => sectionDisplay(x).value),
    };
  });
  return { sections, questions, rows, answers, byAssessment, raw: { needs: raw.needs, links: raw.links } };
}

// F20 : besoins agrégés (nombre d'OSC concernées + liste). Les besoins et leurs liens arrivent avec la cohorte : aucun appel réseau.
export function loadNeeds(project, cohort) {
  const { needs, links } = cohort.raw;
  const answerToSubject = {};
  const assessToSubject = Object.fromEntries(cohort.rows.flatMap(r => r.assessments.map(a => [a.id, r.subject])));
  cohort.answers.forEach(a => { answerToSubject[a.id] = assessToSubject[a.assessment_id]; });
  const linksBy = {};
  links.forEach(l => { (linksBy[l.need_id] = linksBy[l.need_id] || []).push(l); });
  const agg = needs.map(n => {
    const subs = {};
    (linksBy[n.id] || []).forEach(l => { const s = answerToSubject[l.answer_id]; if (s) subs[s.id] = s; });
    return { need: n, subjects: Object.values(subs) };
  }).sort((a, b) => b.subjects.length - a.subjects.length || a.need.label.localeCompare(b.need.label));
  return { needs, agg };
}

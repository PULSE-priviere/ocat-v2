// Données d'un projet visibles par l'utilisateur (la RLS limite le coach à ses OSC)
import { sb, fetchAll, fetchIn } from './supabase';
import { loadBank } from './bank';
import { sectionProgress, sectionScore, globalScore, completion, EVAL_ORDER } from './scoring';

export async function loadCohort(project) {
  const db = sb();
  const { sections, questions } = await loadBank(db, project.framework_id, null);
  const subjects = await fetchAll(() => db.from('subjects')
    .select('id, name, email, coach_id, origin, created_at, coach:profiles(id, name, email)').eq('project_id', project.id).order('name'));
  const assessments = subjects.length ? await fetchIn(ids => db.from('assessments')
    .select('id, subject_id, type, status, submitted_at, created_at').in('subject_id', ids), subjects.map(s => s.id)) : [];
  const answers = assessments.length ? await fetchIn(ids => db.from('answers')
    .select('id, assessment_id, question_id, code, support').in('assessment_id', ids), assessments.map(a => a.id)) : [];
  const byAssessment = {};
  answers.forEach(a => { (byAssessment[a.assessment_id] = byAssessment[a.assessment_id] || {})[a.question_id] = a; });

  const rows = subjects.map(s => {
    const list = assessments.filter(a => a.subject_id === s.id)
      .sort((a, b) => EVAL_ORDER.indexOf(a.type) - EVAL_ORDER.indexOf(b.type) || a.created_at.localeCompare(b.created_at));
    const current = list[list.length - 1] || null;
    const progress = current ? sectionProgress(sections, questions, byAssessment[current.id] || {}) : [];
    return {
      subject: s, assessments: list, current, progress,
      completion: completion(progress), global: progress.length ? globalScore(progress) : null,
      scores: progress.map(sectionScore),
    };
  });
  return { sections, questions, rows, answers, byAssessment };
}

// F20 : besoins agrégés (nombre d'OSC concernées + liste)
export async function loadNeeds(project, cohort) {
  const db = sb();
  const { data: needs } = await db.from('needs').select('id, label').eq('project_id', project.id).order('label');
  const ids = cohort.answers.map(a => a.id);
  const links = ids.length ? await fetchIn(chunk => db.from('answer_needs').select('answer_id, need_id').in('answer_id', chunk), ids) : [];
  const answerToSubject = {};
  const assessToSubject = Object.fromEntries(cohort.rows.flatMap(r => r.assessments.map(a => [a.id, r.subject])));
  cohort.answers.forEach(a => { answerToSubject[a.id] = assessToSubject[a.assessment_id]; });
  const agg = (needs || []).map(n => {
    const subs = {};
    links.filter(l => l.need_id === n.id).forEach(l => { const s = answerToSubject[l.answer_id]; if (s) subs[s.id] = s; });
    return { need: n, subjects: Object.values(subs) };
  }).sort((a, b) => b.subjects.length - a.subjects.length || a.need.label.localeCompare(b.need.label));
  return { needs: needs || [], agg };
}

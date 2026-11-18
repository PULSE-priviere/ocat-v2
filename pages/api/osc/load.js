// POST {token} : données de l'évaluation pour l'OSC (jamais de score)
import { admin, fail, assessmentFromToken } from '../../../lib/server';
import { loadBank } from '../../../lib/bank';
import { planRows } from '../../../lib/plan';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const db = admin();
  const { assessment: a, error } = await assessmentFromToken(db, req.body?.token);
  if (error) return fail(res, error === 'expired_link' ? 410 : 404, error);
  const s = a.subjects;
  const { sections, questions } = await loadBank(db, s.projects.framework_id, a.id, s.project_id);
  const { data: answers } = await db.from('answers')
    .select('question_id, code, value_text, support, edited_by_coach, coach_notes, coach_action, coach_owner').eq('assessment_id', a.id);
  let plan = null;
  const { data: p } = await db.from('action_plans').select('items, status').eq('assessment_id', a.id).maybeSingle();
  // Plan partagé : lignes dérivées de la session (action, responsable) + échéances choisies par le coach
  if (p && p.status === 'shared') {
    const byQ = Object.fromEntries((answers || []).map(x => [x.question_id, x]));
    plan = planRows(questions, byQ, p.items).filter(r => r.kept).map(r => ({
      id: r.q.id, questionId: r.q.id, title: '', action: r.a.coach_action || '', owner: r.a.coach_owner || '', due: r.due }));
  }
  let coach = null;
  if (s.coach_id) {
    const { data: c } = await db.from('profiles').select('first_name, last_name, name').eq('id', s.coach_id).maybeSingle();
    if (c) coach = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name || null;
  }
  res.json({
    assessment: { status: a.status, type: a.type, section_comments: a.section_comments, section_deepen: a.section_deepen || {}, notes_shared: a.notes_shared },
    subject: { name: s.name, email: s.email, contact_first_name: s.contact_first_name, contact_last_name: s.contact_last_name,
      country: s.country, org_type: s.org_type, org_size: s.org_size },
    project: { name: s.projects.name }, coach,
    sections, questions,
    // Notes du coach visibles seulement si partagées
    answers: (answers || []).map(({ coach_action, coach_owner, ...x }) => ({ ...x, coach_notes: a.notes_shared ? x.coach_notes : null })),
    plan,
  });
}

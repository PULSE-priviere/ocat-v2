// POST {token} : données de l'évaluation pour l'OSC (jamais de score)
import { admin, fail, assessmentFromToken } from '../../../lib/server';
import { loadBank } from '../../../lib/bank';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const db = admin();
  const { assessment: a, error } = await assessmentFromToken(db, req.body?.token);
  if (error) return fail(res, error === 'expired_link' ? 410 : 404, error);
  const s = a.subjects;
  const { sections, questions } = await loadBank(db, s.projects.framework_id, a.id);
  const { data: answers } = await db.from('answers')
    .select('question_id, code, value_text, support, edited_by_coach, coach_notes').eq('assessment_id', a.id);
  let plan = null;
  const { data: p } = await db.from('action_plans').select('items, status').eq('assessment_id', a.id).maybeSingle();
  if (p && p.status === 'shared') plan = p.items;
  res.json({
    assessment: { status: a.status, type: a.type, section_comments: a.section_comments, notes_shared: a.notes_shared },
    subject: { name: s.name }, project: { name: s.projects.name },
    sections, questions,
    // Notes du coach visibles seulement si partagées
    answers: (answers || []).map(x => ({ ...x, coach_notes: a.notes_shared ? x.coach_notes : null })),
    plan,
  });
}

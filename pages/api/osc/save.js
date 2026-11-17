// POST {token, op, ...} : enregistre une réponse ou un commentaire de section (F3)
import { admin, fail, assessmentFromToken, tokenExpiry } from '../../../lib/server';

const CODES = ['NA', '1', '2', '3', 'yes', 'no'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const db = admin();
  const { assessment: a, error } = await assessmentFromToken(db, req.body?.token);
  if (error) return fail(res, error === 'expired_link' ? 410 : 404, error);
  if (a.status === 'locked') return fail(res, 423, 'locked');
  const { op } = req.body;

  if (op === 'answer') {
    const { questionId, code, support, valueText } = req.body;
    if (code != null && !CODES.includes(code)) return fail(res, 400, 'invalid_form');
    const { data: q } = await db.from('questions').select('id, framework_id, assessment_id').eq('id', questionId).maybeSingle();
    const ok = q && (q.assessment_id ? q.assessment_id === a.id : q.framework_id === a.subjects.projects.framework_id);
    if (!ok) return fail(res, 400, 'invalid_form');
    const row = { assessment_id: a.id, question_id: questionId, code: code ?? null,
      support: typeof support === 'boolean' ? support : null,
      value_text: valueText != null ? String(valueText).slice(0, 5000) : null };
    const { error: e } = await db.from('answers').upsert(row, { onConflict: 'assessment_id,question_id' });
    if (e) return fail(res, 500, 'server_error');
  } else if (op === 'comment') {
    const section = String(req.body.section || '');
    const comments = { ...(a.section_comments || {}), [section]: String(req.body.text || '').slice(0, 5000) };
    const { error: e } = await db.from('assessments').update({ section_comments: comments }).eq('id', a.id);
    if (e) return fail(res, 500, 'server_error');
  } else return fail(res, 400, 'invalid_form');

  // Le lien se prolonge à chaque réponse enregistrée
  await db.from('assessments').update({ token_expires_at: tokenExpiry() }).eq('id', a.id);
  res.json({ ok: true });
}

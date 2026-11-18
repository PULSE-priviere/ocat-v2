// POST {token} : soumission (F6) quand les 9 sections sont complètes ; notifie owners et coach
import { admin, fail, assessmentFromToken, appUrl } from '../../../lib/server';
import { loadBank } from '../../../lib/bank';
import { sendMail } from '../../../lib/mail';
import { airtableReady, buildRows, pushToAirtable } from '../../../lib/scoresExport';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const db = admin();
  const { assessment: a, error } = await assessmentFromToken(db, req.body?.token);
  if (error) return fail(res, error === 'expired_link' ? 410 : 404, error);
  if (a.status === 'locked') return fail(res, 423, 'locked');
  if (a.status === 'submitted') return res.json({ ok: true });

  const { questions } = await loadBank(db, a.subjects.projects.framework_id, null, a.subjects.project_id);
  const scale = questions.filter(q => q.format === 'scale');
  const { data: answers } = await db.from('answers').select('question_id, code').eq('assessment_id', a.id);
  const done = new Set((answers || []).filter(x => x.code).map(x => x.question_id));
  if (scale.some(q => !done.has(q.id))) return fail(res, 400, 'incomplete');

  await db.from('assessments').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', a.id);

  // Suivi-évaluation : les scores partent vers Airtable dès l'envoi ; un échec n'empêche pas la soumission
  if (airtableReady() && process.env.AIRTABLE_SCORES_AUTO !== 'false') {
    try { await pushToAirtable(await buildRows(db, [a.id])); } catch (e) { console.error('[airtable] envoi des scores impossible :', e.message); }
  }

  const { data: owners } = await db.from('memberships').select('profiles(email)')
    .eq('project_id', a.subjects.project_id).eq('role', 'owner');
  const to = new Set((owners || []).map(o => o.profiles?.email).filter(Boolean));
  if (a.subjects.coach_id) {
    const { data: c } = await db.from('profiles').select('email').eq('id', a.subjects.coach_id).maybeSingle();
    if (c) to.add(c.email);
  }
  const url = `${appUrl()}/staff/subject/${a.subjects.id}`;
  for (const email of to) await sendMail({ to: email, kind: 'submitted', vars: { name: a.subjects.name, url } }).catch(() => {});
  res.json({ ok: true });
}

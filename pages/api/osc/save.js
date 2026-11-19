// POST {token, op, ...} : enregistre une réponse ou un commentaire de section (F3)
import { admin, fail, assessmentFromToken, tokenExpiry } from '../../../lib/server';
import { isCountry } from '../../../lib/countries';
import appConfig from '../../../app.config';


export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const db = admin();
  const { assessment: a, error } = await assessmentFromToken(db, req.body?.token);
  if (error) return fail(res, error === 'expired_link' ? 410 : 404, error);
  if (a.status === 'locked') return fail(res, 423, 'locked');
  const { op } = req.body;

  if (op === 'answer') {
    const { questionId, code, support, valueText } = req.body;
    const { data: q } = await db.from('questions').select('id, framework_id, assessment_id, project_id, format, options').eq('id', questionId).maybeSingle();
    const ok = q && (q.assessment_id ? q.assessment_id === a.id : q.framework_id === a.subjects.projects.framework_id && (!q.project_id || q.project_id === a.subjects.project_id));
    if (!ok) return fail(res, 400, 'invalid_form');
    const row = { assessment_id: a.id, question_id: questionId, code: null, support: null, value_text: null };
    const v = valueText == null ? '' : String(valueText);
    if (q.format === 'scale') {
      if (code != null && !['NA', '1', '2', '3'].includes(code)) return fail(res, 400, 'invalid_form');
      row.code = code ?? null; row.support = typeof support === 'boolean' ? support : null;
    } else if (q.format === 'yesno') {
      if (code != null && !['yes', 'no'].includes(code)) return fail(res, 400, 'invalid_form');
      row.code = code ?? null;
    } else if (q.format === 'number') {
      const n = v.trim() === '' ? null : Number(v.replace(',', '.'));
      if (n !== null && (!Number.isFinite(n) || Math.abs(n) > 1e12)) return fail(res, 400, 'invalid_form');
      row.value_text = n === null ? null : String(n);
    } else if (q.format === 'choice') {
      const keys = (Array.isArray(q.options) ? q.options : []).map(o => o.key);
      if (v && !keys.includes(v)) return fail(res, 400, 'invalid_form');
      row.value_text = v || null;
    } else if (q.format === 'short') row.value_text = v.slice(0, 300) || null;
    else row.value_text = v.slice(0, 5000) || null;
    const { error: e } = await db.from('answers').upsert(row, { onConflict: 'assessment_id,question_id' });
    if (e) return fail(res, 500, 'server_error');
  } else if (op === 'comment') {
    const section = String(req.body.section || '');
    const comments = { ...(a.section_comments || {}), [section]: String(req.body.text || '').slice(0, 5000) };
    const { error: e } = await db.from('assessments').update({ section_comments: comments }).eq('id', a.id);
    if (e) return fail(res, 500, 'server_error');
  } else if (op === 'deepen') {
    const section = String(req.body.section || '');
    if (!/^\d{1,4}$/.test(section)) return fail(res, 400, 'invalid_form');
    const deepen = { ...(a.section_deepen || {}), [section]: req.body.value === true };
    const { error: e } = await db.from('assessments').update({ section_deepen: deepen }).eq('id', a.id);
    if (e) return fail(res, 500, 'server_error');
  } else if (op === 'profile') {
    const patch = req.body.patch || {}, out = {};
    for (const f of ['contact_first_name', 'contact_last_name']) {
      if (f in patch) { const v = String(patch[f] || '').trim().slice(0, 100); if (!v) return fail(res, 400, 'invalid_profile'); out[f] = v; }
    }
    const keys = { country: 'country', org_type: 'org_type', org_size: 'org_size' };
    for (const f of Object.keys(keys)) {
      if (!(f in patch)) continue;
      const v = patch[f] ? String(patch[f]) : null;
      if (f === 'country') {
        const list = a.subjects.projects.countries || [];
        if (v && (!isCountry(v) || (list.length && !list.includes(v.toUpperCase())))) return fail(res, 400, 'invalid_profile');
        out[f] = v ? v.toUpperCase() : null;
        continue;
      }
      if (v && !appConfig.profileOptions[f].includes(v)) return fail(res, 400, 'invalid_profile');
      out[f] = v;
    }
    if (!Object.keys(out).length) return fail(res, 400, 'invalid_form');
    const { error: e } = await db.from('subjects').update(out).eq('id', a.subjects.id);
    if (e) return fail(res, 500, 'server_error');
  } else return fail(res, 400, 'invalid_form');

  // Le lien se prolonge à chaque réponse enregistrée
  await db.from('assessments').update({ token_expires_at: tokenExpiry() }).eq('id', a.id);
  res.json({ ok: true });
}

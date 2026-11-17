// POST : entrée par le lien public (F0). Un nom ne rouvre jamais un dossier : seul l'e-mail reçoit le lien.
import { admin, fail, isEmail, clientIp, verifyTurnstile, rateLimited, newToken, hashToken, tokenExpiry, personalUrl, rotateToken } from '../../../lib/server';
import { sendMail } from '../../../lib/mail';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const { slug, name, email, coachId, consent, lang = 'fr', captcha } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 200);
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanName || !isEmail(cleanEmail)) return fail(res, 400, 'invalid_form');
  if (!consent) return fail(res, 400, 'consent_required');
  const ip = clientIp(req);
  if (!(await verifyTurnstile(captcha, ip))) return fail(res, 400, 'captcha_failed');

  const db = admin();
  const { data: p } = await db.from('projects').select('id, public_active, archived')
    .eq('public_slug', String(slug || '')).maybeSingle();
  if (!p || !p.public_active || p.archived) return fail(res, 404, 'link_inactive');
  if (await rateLimited(db, 'public_entry', ip)) return fail(res, 429, 'too_many_attempts');

  // E-mail déjà connu : nouveau lien envoyé à cette adresse uniquement, rien n'est affiché
  const { data: existing } = await db.from('subjects').select('id').eq('project_id', p.id).eq('email', cleanEmail).maybeSingle();
  if (existing) {
    const { data: a } = await db.from('assessments').select('id').eq('subject_id', existing.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (a) {
      const url = await rotateToken(db, a.id);
      await sendMail({ to: cleanEmail, kind: 'resume_link', lang, vars: { url } }).catch(() => {});
    }
    return res.json({ status: 'exists' });
  }

  // Coach choisi : seulement un coach proposé de ce projet
  let coach = null;
  if (coachId) {
    const { data: m } = await db.from('memberships').select('user_id').eq('project_id', p.id)
      .eq('user_id', coachId).eq('role', 'coach').eq('offered_to_osc', true).maybeSingle();
    coach = m ? m.user_id : null;
  }
  const { data: subj, error: e1 } = await db.from('subjects')
    .insert({ project_id: p.id, name: cleanName, email: cleanEmail, coach_id: coach, origin: 'public' }).select('id').single();
  if (e1) return fail(res, 500, 'server_error');
  const token = newToken();
  const { error: e2 } = await db.from('assessments')
    .insert({ subject_id: subj.id, type: 'baseline', token_hash: hashToken(token), token_expires_at: tokenExpiry() });
  if (e2) return fail(res, 500, 'server_error');
  const url = personalUrl(token);
  await sendMail({ to: cleanEmail, kind: 'personal_link', lang, vars: { url, name: cleanName } }).catch(() => {});
  res.json({ status: 'created', url });
}

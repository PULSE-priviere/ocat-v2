// POST : entrée par le lien public (F0). Un nom ne rouvre jamais un dossier : seul l'e-mail reçoit le lien.
import { admin, fail, isEmail, clientIp, verifyTurnstile, rateLimited, newToken, hashToken, tokenExpiry, personalUrl, rotateToken } from '../../../lib/server';
import { sendMail } from '../../../lib/mail';
import { isCountry } from '../../../lib/countries';
import { syncAssessmentsSafe } from '../../../lib/airtableSync';
import { inBackground } from '../../../lib/background';
import appConfig from '../../../app.config';
import { orgTypesOf } from '../../../lib/orgTypes';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const { slug, name, firstName, lastName, email, coachId, consent, lang = 'fr', captcha, country, orgType, orgSize } = req.body || {};
  const first = String(firstName || '').trim().slice(0, 100), last = String(lastName || '').trim().slice(0, 100);
  const cleanName = String(name || '').trim().slice(0, 200);
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanName || !first || !last || !isEmail(cleanEmail)) return fail(res, 400, 'invalid_form');
  if (!consent) return fail(res, 400, 'consent_required');
  const ip = clientIp(req);
  if (!(await verifyTurnstile(captcha, ip))) return fail(res, 400, 'captcha_failed');

  const db = admin();
  const { data: p } = await db.from('projects').select('id, public_active, archived, countries, org_types')
    .eq('public_slug', String(slug || '')).maybeSingle();
  if (!p || !p.public_active || p.archived) return fail(res, 404, 'link_inactive');
  // Profil de l'organisation, demandé au début du questionnaire : pays (parmi ceux du projet), type de structure (liste du projet, sinon liste par défaut), taille
  const list = p.countries || [];
  const cc = String(country || (list.length === 1 ? list[0] : '')).toUpperCase();
  if (!isCountry(cc) || (list.length && !list.includes(cc))
    || !orgTypesOf(p).some(x => x.key === orgType) || !appConfig.profileOptions.org_size.includes(orgSize)) return fail(res, 400, 'invalid_entry_profile');
  if (await rateLimited(db, 'public_entry', ip)) return fail(res, 429, 'too_many_attempts');

  // E-mail déjà connu : nouveau lien envoyé à cette adresse uniquement, rien n'est affiché
  const { data: existing } = await db.from('subjects').select('id').eq('project_id', p.id).eq('email', cleanEmail).maybeSingle();
  if (existing) {
    const { data: a } = await db.from('assessments').select('id').eq('subject_id', existing.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (a) {
      const url = await rotateToken(db, a.id);
      await inBackground(sendMail({ to: cleanEmail, kind: 'resume_link', lang, vars: { url } }));
    }
    return res.json({ status: 'exists' });
  }

  // Coach choisi : seulement un coach proposé de ce projet
  let coach = null;
  if (coachId) {
    const { data: m } = await db.from('memberships').select('user_id').eq('project_id', p.id)
      .eq('user_id', coachId).eq('role', 'coach').maybeSingle();
    coach = m ? m.user_id : null;
  }
  const { data: subj, error: e1 } = await db.from('subjects')
    .insert({ project_id: p.id, name: cleanName, contact_first_name: first, contact_last_name: last, email: cleanEmail, coach_id: coach, origin: 'public', country: cc, org_type: orgType, org_size: orgSize }).select('id').single();
  if (e1) return fail(res, 500, 'server_error');
  const token = newToken();
  const { data: asm, error: e2 } = await db.from('assessments')
    .insert({ subject_id: subj.id, type: 'baseline', token_hash: hashToken(token), token_expires_at: tokenExpiry() }).select('id').single();
  if (e2) return fail(res, 500, 'server_error');
  const url = personalUrl(token);
  // L'e-mail et l'envoi vers Airtable se font en même temps, en tâche de fond : le lien s'affiche sans attendre
  await inBackground(Promise.all([
    sendMail({ to: cleanEmail, kind: 'personal_link', lang, vars: { url, name: cleanName, contact: first } }).catch(() => {}),
    syncAssessmentsSafe(db, [asm.id], { timeoutMs: 8000 }),
  ]));
  res.json({ status: 'created', url });
}
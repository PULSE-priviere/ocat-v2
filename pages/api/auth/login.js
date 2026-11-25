// POST {email} : envoie un lien de connexion si un compte staff existe, et/ou le lien personnel
// des dossiers d'organisation enregistrés sous cette adresse. Réponse identique dans tous les cas.
import { admin, fail, isEmail, clientIp, rateLimited, rotateToken } from '../../../lib/server';
import { sendLoginLink } from '../../../lib/login';
import { sendMail } from '../../../lib/mail';
import { inBackground } from '../../../lib/background';

const MAX_DOSSIERS = 5; // garde-fou : une adresse ne peut pas déclencher un envoi massif

async function sendOrgLinks(db, email, lang) {
  try {
    const { data: subs, error } = await db
      .from('subjects')
      .select('id, assessments(id, created_at)')
      .eq('email', email); // colonne citext : insensible à la casse
    if (error) return console.error('[login] lecture des organisations impossible :', error.message);

    // un lien par organisation, vers son évaluation la plus récente
    const targets = (subs || [])
      .map((s) => (s.assessments || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0])
      .filter(Boolean)
      .slice(0, MAX_DOSSIERS);

    for (const a of targets) {
      const url = await rotateToken(db, a.id);
      await sendMail({ to: email, kind: 'resume_link', lang, vars: { url } });
    }
  } catch (e) {
    console.error('[login] envoi des liens d\'organisation impossible :', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) return fail(res, 400, 'invalid_form');
  const db = admin();
  if (await rateLimited(db, 'login', clientIp(req))) return fail(res, 429, 'too_many_attempts');

  const { data: p, error } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (error) console.error('[login] lecture des profils impossible :', error.message);

  const jobs = [sendOrgLinks(db, email, req.body?.lang)];
  if (p) jobs.push(sendLoginLink(db, email, req.body?.lang));
  await inBackground(Promise.all(jobs)); // la réponse part tout de suite, les e-mails suivent
  res.json({ ok: true });
}
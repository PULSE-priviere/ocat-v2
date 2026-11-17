// POST {email} : envoie un lien de connexion si un compte staff existe (réponse identique sinon)
import { admin, fail, isEmail, clientIp, rateLimited } from '../../../lib/server';
import { sendLoginLink } from '../../../lib/login';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) return fail(res, 400, 'invalid_form');
  const db = admin();
  if (await rateLimited(db, 'login', clientIp(req))) return fail(res, 429, 'too_many_attempts');
  const { data: p } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (p) await sendLoginLink(db, email, req.body?.lang).catch(() => {});
  res.json({ ok: true });
}

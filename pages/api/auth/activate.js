// Activation d'un compte invité.
//   GET  ?t=…   état du lien (valid, used, invalid) : ne consomme rien, donc sans risque si un antivirus d'e-mail ouvre l'adresse
//   POST {t}    consomme l'invitation et renvoie un jeton de connexion frais, que le navigateur échange contre une session
import { admin, fail, clientIp, rateLimited } from '../../../lib/server';
import { inviteStatus, consumeInvite, mintLoginToken, TOKEN_RE } from '../../../lib/activation';

export default async function handler(req, res) {
  const db = admin();
  if (req.method === 'GET') {
    const t = String(req.query.t || '');
    if (!TOKEN_RE.test(t)) return res.json({ status: 'invalid' });
    return res.json(await inviteStatus(db, t));
  }
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const t = String(req.body?.t || '');
  if (!TOKEN_RE.test(t)) return res.status(404).json({ status: 'invalid' });
  if (await rateLimited(db, 'activate', clientIp(req), { max: 60, perHours: 1 })) return fail(res, 429, 'too_many_attempts');
  const r = await consumeInvite(db, t);
  if (r.status !== 'ok') return res.status(r.status === 'used' ? 410 : 404).json({ status: r.status });
  try {
    const m = await mintLoginToken(db, r.email);
    if (!m.tokenHash) throw new Error('empreinte absente');
    res.json({ ok: true, tokenHash: m.tokenHash, type: m.type });
  } catch (e) {
    console.error('[activation] jeton de connexion impossible :', e.message);
    fail(res, 500, 'server_error');
  }
}

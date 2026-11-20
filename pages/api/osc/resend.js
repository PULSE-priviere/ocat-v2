// POST {token} : lien expiré → nouveau lien envoyé à l'e-mail enregistré (jamais affiché)
import { admin, fail, assessmentFromToken, rotateToken, clientIp, rateLimited } from '../../../lib/server';
import { sendMail } from '../../../lib/mail';
import { inBackground } from '../../../lib/background';

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const db = admin();
  if (await rateLimited(db, 'resend', clientIp(req))) return fail(res, 429, 'too_many_attempts');
  const { assessment: a } = await assessmentFromToken(db, req.body?.token, { allowExpired: true });
  if (a) {
    const url = await rotateToken(db, a.id);
    await inBackground(sendMail({ to: a.subjects.email, kind: 'resume_link', lang: req.body?.lang, vars: { url } }));
  }
  res.json({ ok: true });
}

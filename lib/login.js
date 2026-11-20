// Lien de connexion staff : jeton généré par Supabase, lien sur NOTRE domaine (meilleure délivrabilité), page de confirmation à bouton
import { appUrl } from './server';
import { sendMail } from './mail';
import { mintLoginToken } from './activation';

export async function sendLoginLink(db, email, lang = 'fr') {
  let m;
  try { m = await mintLoginToken(db, email); }
  catch (e) { console.error('[login] Supabase n\'a pas pu générer le lien :', e.message); throw e; }
  // Si Supabase ne renvoie pas d'empreinte (très ancienne version), on retombe sur son lien d'origine
  const url = m.tokenHash ? `${appUrl()}/auth/confirm?token_hash=${encodeURIComponent(m.tokenHash)}&type=${encodeURIComponent(m.type)}` : m.actionLink;
  await sendMail({ to: email, kind: 'login', lang, vars: { url } });
}

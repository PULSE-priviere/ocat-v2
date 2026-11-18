// Lien magique staff : généré par Supabase, envoyé par notre propre relais d'e-mail
import { appUrl } from './server';
import { sendMail } from './mail';

export async function sendLoginLink(db, email, lang = 'fr') {
  const { data, error } = await db.auth.admin.generateLink({
    type: 'magiclink', email, options: { redirectTo: `${appUrl()}/staff` } });
  if (error) { console.error('[login] Supabase n\'a pas pu générer le lien :', error.message); throw error; }
  await sendMail({ to: email, kind: 'login', lang, vars: { url: data.properties.action_link } });
}

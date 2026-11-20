// Envoi d'une invitation à l'équipe : lien d'activation durable, envoyé uniquement à l'adresse de la personne invitée
import { createInvite } from './activation';
import { sendMail } from './mail';
import fr from '../locales/fr.json';
import en from '../locales/en.json';

const L = { fr, en };
export const rolesLabel = (roles, lang = 'fr') => {
  const d = L[lang] || L.fr;
  return [...new Set(roles)].sort().reverse().map(r => String(d.role[r] || r).toLowerCase()).join(` ${d.email.and} `);   // « owner de projet et coach »
};

// Ne lève jamais d'exception. Renvoie { ok } ou { ok: false, reason: 'invite' | 'mail', detail } :
//   'invite' : le lien d'activation n'a pas pu être enregistré en base (migration 0010 absente ?) ; 'mail' : le serveur d'e-mail a refusé l'envoi
export async function sendInvitation(svc, { userId, email, contact, inviter, inviterId, project, roles, lang = 'fr' }) {
  let url;
  try { url = await createInvite(svc, { userId, email, createdBy: inviterId }); }
  catch (e) { console.error('[invite] lien d\'activation non enregistré :', e.message); return { ok: false, reason: 'invite', detail: e.message }; }
  try {
    await sendMail({ to: email, kind: project ? 'invite' : 'invite_admin', lang, vars: { url, contact, inviter, project: project || '', roles: rolesLabel(roles || [], lang) } });
    return { ok: true };
  } catch (e) { console.error('[invite] e-mail non envoyé :', e.message); return { ok: false, reason: 'mail', detail: e.detail || e.message }; }
}

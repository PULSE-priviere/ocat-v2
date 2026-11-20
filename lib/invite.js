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

// Renvoie true si l'e-mail est parti ; ne lève jamais d'exception (l'appelant prévient l'invitant si false)
export async function sendInvitation(svc, { userId, email, contact, inviter, inviterId, project, roles, lang = 'fr' }) {
  try {
    const url = await createInvite(svc, { userId, email, createdBy: inviterId });
    await sendMail({ to: email, kind: project ? 'invite' : 'invite_admin', lang, vars: { url, contact, inviter, project: project || '', roles: rolesLabel(roles || [], lang) } });
    return true;
  } catch (e) { console.error('[invite] invitation non envoyée :', e.message); return false; }
}

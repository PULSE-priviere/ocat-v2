// Noms affichés : prénom + nom, sinon nom d'usage, sinon partie locale de l'e-mail
import { safeStr } from './safe';

export function fullName(p) {
  if (!p) return '';
  const joined = [safeStr(p.first_name), safeStr(p.last_name)].filter(Boolean).join(' ');
  return joined || safeStr(p.name) || safeStr(p.email).split('@')[0];
}
export const contactName = s => (s ? [safeStr(s.contact_first_name), safeStr(s.contact_last_name)].filter(Boolean).join(' ') : '');

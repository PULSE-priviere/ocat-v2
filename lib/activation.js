// Invitations de l'équipe : lien d'activation durable, sur notre propre domaine.
// Le lien n'expire pas ; il se consomme à l'activation (clic sur le bouton, jamais à l'ouverture de la page).
import { newToken, hashToken, appUrl } from './server';

export const GRACE_MS = 30 * 60 * 1000;   // après l'activation, le même lien reste utilisable 30 minutes (double clic, nouvel essai)
export const TOKEN_RE = /^[0-9a-f]{48}$/;

// Crée une invitation et renvoie l'adresse d'activation. À n'envoyer QU'À la personne invitée : jamais à l'invitant.
export async function createInvite(db, { userId, email, createdBy }) {
  const token = newToken();
  const { error } = await db.from('staff_invites').insert({ token_hash: hashToken(token), user_id: userId, email, created_by: createdBy || null });
  if (error) throw error;
  return `${appUrl()}/activate?t=${token}`;
}

async function find(db, token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const { data } = await db.from('staff_invites').select('id, email, used_at, revoked_at, user:profiles!staff_invites_user_id_fkey(first_name)').eq('token_hash', hashToken(token)).maybeSingle();
  return data || null;
}
const spent = inv => !!inv.used_at && Date.now() - Date.parse(inv.used_at) > GRACE_MS;

// Lecture seule : l'ouverture de la page (ou le passage d'un antivirus d'e-mail) ne consomme rien
export async function inviteStatus(db, token) {
  const inv = await find(db, token);
  if (!inv || inv.revoked_at) return { status: 'invalid' };
  if (spent(inv)) return { status: 'used' };
  return { status: 'valid', firstName: inv.user?.first_name || '' };
}

// Consomme l'invitation (une seule fois, de façon atomique) et renvoie l'adresse du compte à connecter
export async function consumeInvite(db, token) {
  const inv = await find(db, token);
  if (!inv || inv.revoked_at) return { status: 'invalid' };
  if (spent(inv)) return { status: 'used' };
  if (!inv.used_at) await db.from('staff_invites').update({ used_at: new Date().toISOString() }).eq('id', inv.id).is('used_at', null);
  return { status: 'ok', email: inv.email };
}

// Jeton de connexion tout frais, utilisé dans les secondes qui suivent : sa durée de vie (1 heure chez Supabase) n'a plus d'importance
export async function mintLoginToken(db, email) {
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const p = data.properties || {};
  return { tokenHash: p.hashed_token || '', type: p.verification_type || 'magiclink', actionLink: p.action_link || '' };
}

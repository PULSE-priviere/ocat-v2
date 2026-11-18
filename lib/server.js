// Utilitaires serveur uniquement (routes API). Ne jamais importer côté client.
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import appConfig from '../app.config';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const admin = () => createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const asUser = jwt => createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = t => crypto.createHash('sha256').update(String(t || '')).digest('hex');
export const tokenExpiry = () => new Date(Date.now() + appConfig.tokenDays * 864e5).toISOString();
export const appUrl = () => {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  if (!u) console.error('[config] APP_URL est vide : les liens envoyés par e-mail seront incomplets');
  return u.replace(/\/$/, '');
};
export const personalUrl = token => `${appUrl()}/a/${token}`;

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}
export const ipHash = ip => crypto.createHash('sha256').update((process.env.IP_HASH_SALT || '') + ip).digest('hex');

// Réponse d'erreur : un code que l'interface traduit
export const fail = (res, status, code) => res.status(status).json({ error: code });

export function isEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }

// Charge l'évaluation désignée par un jeton OSC (vérifié côté serveur)
export async function assessmentFromToken(db, token, { allowExpired = false } = {}) {
  if (!token || String(token).length < 20) return { error: 'invalid_link' };
  const { data } = await db.from('assessments')
    .select('*, subjects!inner(id, name, email, project_id, coach_id, contact_first_name, contact_last_name, country, org_type, org_size, projects!inner(id, name, framework_id, archived))')
    .eq('token_hash', hashToken(token)).maybeSingle();
  if (!data) return { error: 'invalid_link' };
  if (!allowExpired && new Date(data.token_expires_at) < new Date()) return { error: 'expired_link', assessment: data };
  return { assessment: data };
}

// Crée un nouveau jeton (l'ancien devient invalide) et renvoie l'URL en clair une seule fois
export async function rotateToken(db, assessmentId) {
  const token = newToken();
  const { error } = await db.from('assessments')
    .update({ token_hash: hashToken(token), token_expires_at: tokenExpiry() }).eq('id', assessmentId);
  if (error) throw error;
  return personalUrl(token);
}

// Session staff : vérifie le JWT et renvoie l'utilisateur + un client soumis à la RLS
export async function staffFromReq(req) {
  const jwt = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!jwt) return {};
  const { data } = await admin().auth.getUser(jwt);
  if (!data?.user) return {};
  return { user: data.user, db: asUser(jwt) };
}

export async function verifyTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET_KEY) return true; // désactivé en local
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token || '', remoteip: ip });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return (await r.json()).success === true;
}

export async function rateLimited(db, kind, ip) {
  const { max, perHours } = appConfig.publicEntryLimit;
  const since = new Date(Date.now() - perHours * 36e5).toISOString();
  const h = ipHash(ip);
  const { count } = await db.from('rate_events').select('id', { count: 'exact', head: true })
    .eq('kind', kind).eq('ip_hash', h).gte('at', since);
  if ((count || 0) >= max) return true;
  await db.from('rate_events').insert({ kind, ip_hash: h });
  return false;
}

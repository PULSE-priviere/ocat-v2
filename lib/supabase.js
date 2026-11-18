// Client navigateur (clé anon + RLS). Uniquement pour le staff connecté.
import { createClient } from '@supabase/supabase-js';
let client;
export function sb() {
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });
  return client;
}

// Lit toutes les lignes malgré la limite de 1000 par requête
export async function fetchAll(build) {
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) return out;
  }
}

// Requêtes .in() découpées (URL trop longue au-delà de quelques centaines d'identifiants)
export async function fetchIn(build, ids, chunk = 150) {
  const out = [];
  for (let i = 0; i < ids.length; i += chunk) out.push(...await fetchAll(() => build(ids.slice(i, i + chunk))));
  return out;
}

// Appel d'une action staff côté serveur, avec le jeton de session
export async function staffApi(action, body) {
  const { data } = await sb().auth.getSession();
  const r = await fetch(`/api/staff/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    body: JSON.stringify(body || {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(json.error || 'server_error'); e.detail = json.detail; throw e; }
  return json;
}

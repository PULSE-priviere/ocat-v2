// Connexion à Airtable : réglages, vérification et erreurs lisibles.
// Les données exportées (organisations, diagnostics, accompagnement) sont construites et envoyées par airtableSync.js.
export const api = () => (process.env.AIRTABLE_API_URL || 'https://api.airtable.com').replace(/\/$/, '');
export const headers = cfg => ({ Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' });

// Airtable accepte 5 requêtes par seconde au plus par base : toutes nos requêtes passent par ce rythme commun
let last = 0;
export async function pace() {
  const wait = 210 - (Date.now() - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
}
export const airtableFetch = async (url, init) => { await pace(); return fetch(url, init); };

export const DEFAULT_SCORES_TABLE = 'Scores';
export const DEFAULT_TABLES = { organisations: 'Organisations', diagnostics: 'Diagnostics', accompagnement: 'Accompagnement' };

// Connexion réglée par l'administrateur dans l'application (table app_settings), sinon variables d'environnement
export async function airtableConfig(svc) {
  let v = {};
  try { const { data } = await svc.from('app_settings').select('value').eq('key', 'airtable').maybeSingle(); v = data?.value || {}; } catch { /* table absente : variables d'environnement */ }
  const t = v.tables || {};
  return {
    token: v.token || process.env.AIRTABLE_TOKEN || '',
    base: v.baseId || process.env.AIRTABLE_BASE_ID || '',
    // Simple (par défaut) : une seule table « Scores », une ligne par diagnostic. Complet : trois tables reliées.
    mode: v.mode === 'complet' ? 'complet' : 'simple',
    table: v.table || process.env.AIRTABLE_SCORES_TABLE || DEFAULT_SCORES_TABLE,
    tables: { organisations: t.organisations || DEFAULT_TABLES.organisations, diagnostics: t.diagnostics || DEFAULT_TABLES.diagnostics, accompagnement: t.accompagnement || DEFAULT_TABLES.accompagnement },
    auto: v.auto ?? process.env.AIRTABLE_SCORES_AUTO !== 'false',
    fromApp: !!v.token,
  };
}
export const airtableReady = cfg => !!(cfg && cfg.token && cfg.base);
export const tableNames = cfg => (cfg.mode === 'complet' ? Object.values(cfg.tables) : [cfg.table]);

// Vérifie en trois temps : le jeton lui-même (401 = refusé), ses droits, puis l'existence de la table (ou des trois tables)
export async function testAirtable(cfg) {
  const w = await airtableFetch(`${api()}/v0/meta/whoami`, { headers: headers(cfg) }).catch(() => null);
  if (w && w.status === 401) throw airtableError(w, await w.json().catch(() => ({})));
  if (w && w.ok) {
    const j = await w.json().catch(() => ({}));
    if (Array.isArray(j.scopes)) {
      const missing = ['data.records:read', 'data.records:write'].filter(x => !j.scopes.includes(x));
      if (missing.length) { const e = new Error(missing.join(', ')); e.code = 'airtable_scopes'; throw e; }
    }
  }
  const missing = [];
  for (const name of tableNames(cfg)) {
    const r = await airtableFetch(`${api()}/v0/${cfg.base}/${encodeURIComponent(name)}?maxRecords=1`, { headers: headers(cfg) });
    if (r.ok) continue;
    if (r.status === 404 || r.status === 403) { missing.push(name); continue; }   // table absente, ou base/droits : le message couvre les deux
    throw airtableError(r, await r.json().catch(() => ({})));
  }
  if (missing.length) { const e = new Error(missing.join(', ')); e.code = 'airtable_tables_missing'; throw e; }
  return { ok: true };
}

// Erreur d'Airtable avec son statut HTTP, pour afficher un message qui dit quoi faire
export function airtableError(r, j) {
  const e = new Error(j?.error?.message || j?.error?.type || (typeof j?.error === 'string' ? j.error : '') || `HTTP ${r.status}`);
  e.status = r.status; e.type = j?.error?.type || '';
  return e;
}
export const airtableCode = e => (e?.code ? e.code : [401, 403, 404, 422, 429].includes(e?.status) ? `airtable_${e.status}` : 'airtable_error');

// Saisies de l'administrateur : on retire ce qui s'est collé en trop
export const cleanToken = v => String(v || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/^\s*bearer\s+/i, '').replace(/[\s"'`]/g, '');
export const cleanBaseId = v => (/app[A-Za-z0-9]{14}/.exec(String(v || '')) || [''])[0];   // accepte aussi l'adresse complète de la base

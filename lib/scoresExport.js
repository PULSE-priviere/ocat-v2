// Export suivi-évaluation : une ligne par évaluation (baseline, midline, endline), pour Airtable ou un CSV.
// Seuls les scores définitifs sont exportés : le score d'une section n'existe qu'une fois la section complète.
import { loadBank } from './bank';
import { sectionProgress, sectionScore, globalScore, completion } from './scoring';
import { fetchAll, fetchIn } from './supabase';

import { countryName } from './countries';
import fr from '../locales/fr.json';
const api = () => (process.env.AIRTABLE_API_URL || 'https://api.airtable.com').replace(/\/$/, '');
const headers = cfg => ({ Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' });

// Connexion Airtable : réglée par l'administrateur dans l'application (table app_settings), sinon variables d'environnement
export async function airtableConfig(svc) {
  let v = {};
  try { const { data } = await svc.from('app_settings').select('value').eq('key', 'airtable').maybeSingle(); v = data?.value || {}; } catch { /* table absente : variables d'environnement */ }
  return {
    token: v.token || process.env.AIRTABLE_TOKEN || '',
    base: v.baseId || process.env.AIRTABLE_BASE_ID || '',
    table: v.table || process.env.AIRTABLE_SCORES_TABLE || 'Scores',
    auto: v.auto ?? process.env.AIRTABLE_SCORES_AUTO !== 'false',
    fromApp: !!v.token,
  };
}
export const airtableReady = cfg => !!(cfg && cfg.token && cfg.base);

const EVAL = { baseline: 'Baseline', followup: 'Midline', endline: 'Endline' };
const STATUS = { in_progress: 'En cours', submitted: 'Soumise', locked: 'Verrouillée' };

const txt = name => ({ name, type: 'singleLineText' });
const long = name => ({ name, type: 'multilineText' });
const num = (name, precision = 0) => ({ name, type: 'number', options: { precision } });
const date = name => ({ name, type: 'date', options: { dateFormat: { name: 'iso' } } });

// Colonnes de la table (le premier champ, « Cle », est la clé de mise à jour : l'identifiant de l'évaluation)
export const FIELD_DEFS = [
  txt('Cle'), txt('Organisation'), txt('Contact'), txt('Email'), txt('Projet'), txt('Coach'), txt('Pays'), txt('Type de structure'), txt('Taille'),
  txt('Evaluation'), txt('Statut'), date('Date de creation'), date('Date de soumission'),
  num('Completion (%)'), num('Sections completes'), num('Score global', 2),
  ...Array.from({ length: 9 }, (_, i) => num(`Score S${i + 1}`, 2)),
  long('Scores par section (JSON)'),
  num('Reponses 3 (en place)'), num('Reponses 2 (partiel)'), num('Reponses 1 (non en place)'), num('Reponses N/A'),
  num('Appuis demandes'), num('Actions definies'), long('Besoins'), txt('Mis a jour le'),
];

export async function buildRows(svc, assessmentIds) {
  if (!assessmentIds.length) return [];
  const { data: ass, error } = await svc.from('assessments')
    .select('id, type, status, created_at, submitted_at, subject:subjects(id, name, email, contact_first_name, contact_last_name, country, org_type, org_size, coach_id, project:projects(id, name, framework_id))')
    .in('id', assessmentIds).order('created_at');
  if (error) throw new Error(error.message);
  const coachIds = [...new Set(ass.map(a => a.subject?.coach_id).filter(Boolean))];
  const coaches = coachIds.length ? (await svc.from('profiles').select('id, name, first_name, last_name, email').in('id', coachIds)).data || [] : [];
  const coachName = Object.fromEntries(coaches.map(c => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name || c.email]));
  const answers = await fetchAll(() => svc.from('answers').select('id, assessment_id, question_id, code, support, value_text, coach_action').in('assessment_id', ass.map(a => a.id)));
  const links = answers.length ? await fetchIn(ids => svc.from('answer_needs').select('answer_id, need_id').in('answer_id', ids), answers.map(a => a.id)) : [];
  const needIds = [...new Set(links.map(l => l.need_id))];
  const needs = needIds.length ? await fetchIn(ids => svc.from('needs').select('id, label').in('id', ids), needIds) : [];
  const needLabel = Object.fromEntries(needs.map(n => [n.id, n.label]));
  const answerAss = Object.fromEntries(answers.map(a => [a.id, a.assessment_id]));
  const needsByAss = {};
  links.forEach(l => { const k = answerAss[l.answer_id]; (needsByAss[k] = needsByAss[k] || new Set()).add(needLabel[l.need_id]); });

  const banks = {};
  const rows = [];
  for (const a of ass) {
    const s = a.subject, pr = s.project;
    const bank = banks[pr.id] || (banks[pr.id] = await loadBank(svc, pr.framework_id, null, pr.id));
    const mine = answers.filter(x => x.assessment_id === a.id);
    const byQ = Object.fromEntries(mine.map(x => [x.question_id, x]));
    const progress = sectionProgress(bank.sections, bank.questions, byQ);
    const scored = progress.filter(p => p.section.kind !== 'data');
    const g = globalScore(progress);
    const cnt = { 3: 0, 2: 0, 1: 0, NA: 0 };
    scored.forEach(p => ['3', '2', '1', 'NA'].forEach(c => { cnt[c] += p.counts[c]; }));
    const f = {
      Cle: a.id, Organisation: s.name, Contact: [s.contact_first_name, s.contact_last_name].filter(Boolean).join(' '), Email: s.email,
      Projet: pr.name, Coach: coachName[s.coach_id] || '', Pays: countryName(s.country, 'fr'), 'Type de structure': fr.profile.opt.org_type[s.org_type] || s.org_type || '', Taille: fr.profile.opt.org_size[s.org_size] || s.org_size || '',
      Evaluation: EVAL[a.type] || a.type, Statut: STATUS[a.status] || a.status,
      'Date de creation': a.created_at.slice(0, 10), 'Date de soumission': a.submitted_at ? a.submitted_at.slice(0, 10) : null,
      'Completion (%)': completion(progress), 'Sections completes': scored.filter(p => p.status === 'complete').length, 'Score global': g,
      'Reponses 3 (en place)': cnt[3], 'Reponses 2 (partiel)': cnt[2], 'Reponses 1 (non en place)': cnt[1], 'Reponses N/A': cnt.NA,
      'Appuis demandes': mine.filter(x => x.support).length, 'Actions definies': mine.filter(x => String(x.coach_action || '').trim()).length,
      Besoins: [...(needsByAss[a.id] || [])].sort().join(' ; '), 'Mis a jour le': new Date().toISOString(),
    };
    for (let i = 1; i <= 9; i++) f[`Score S${i}`] = null;
    scored.forEach(p => { if (!p.section.project_id && p.section.idx <= 9) f[`Score S${p.section.idx}`] = sectionScore(p); });
    f['Scores par section (JSON)'] = JSON.stringify(Object.fromEntries(scored.map(p => [`S${p.section.idx}`, { nom: p.section.name_fr, score: sectionScore(p), repondu: `${p.done}/${p.total}` }])));
    rows.push(f);
  }
  return rows;
}

// Mise à jour ou création par lot de 10 (limite d'Airtable), clé = « Cle »
export async function pushToAirtable(rows, cfg) {
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const r = await fetch(`${api()}/v0/${cfg.base}/${encodeURIComponent(cfg.table)}`, {
      method: 'PATCH', headers: headers(cfg),
      body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ['Cle'] }, typecast: true, records: batch.map(fields => ({ fields })) }),
    });
    if (!r.ok) throw airtableError(r, await r.json().catch(() => ({})));
    if (i + 10 < rows.length) await new Promise(res => setTimeout(res, 230));   // 5 requêtes par seconde au plus
  }
}

// Crée la table avec toutes les colonnes (jeton avec le droit schema.bases:write)
export async function createScoresTable(cfg) {
  const r = await fetch(`${api()}/v0/meta/bases/${cfg.base}/tables`, {
    method: 'POST', headers: headers(cfg),
    body: JSON.stringify({ name: cfg.table, description: 'Scores du diagnostic : une ligne par évaluation', fields: FIELD_DEFS }),
  });
  if (r.ok) return { created: true };
  const j = await r.json().catch(() => ({}));
  if (/DUPLICATE_TABLE_NAME/.test(j?.error?.type || '')) return { exists: true };
  throw airtableError(r, j);
}

// Vérifie en trois temps : le jeton lui-même (401 = refusé), ses droits, puis l'accès à la base et à la table
export async function testAirtable(cfg) {
  const w = await fetch(`${api()}/v0/meta/whoami`, { headers: headers(cfg) }).catch(() => null);
  if (w && w.status === 401) throw airtableError(w, await w.json().catch(() => ({})));
  if (w && w.ok) {
    const j = await w.json().catch(() => ({}));
    if (Array.isArray(j.scopes)) {
      const missing = ['data.records:read', 'data.records:write'].filter(x => !j.scopes.includes(x));
      if (missing.length) { const e = new Error(missing.join(', ')); e.code = 'airtable_scopes'; throw e; }
    }
  }
  const r = await fetch(`${api()}/v0/${cfg.base}/${encodeURIComponent(cfg.table)}?maxRecords=1`, { headers: headers(cfg) });
  if (r.ok) return { ok: true };
  throw airtableError(r, await r.json().catch(() => ({})));
}

// Erreur d'Airtable avec son statut HTTP, pour afficher un message qui dit quoi faire
function airtableError(r, j) {
  const e = new Error(j?.error?.message || j?.error?.type || (typeof j?.error === 'string' ? j.error : '') || `HTTP ${r.status}`);
  e.status = r.status; e.type = j?.error?.type || '';
  return e;
}
export const airtableCode = e => (e?.code ? e.code : [401, 403, 404, 422].includes(e?.status) ? `airtable_${e.status}` : 'airtable_error');

// Saisies de l'administrateur : on retire ce qui s'est collé en trop
export const cleanToken = v => String(v || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/^\s*bearer\s+/i, '').replace(/[\s"'`]/g, '');
export const cleanBaseId = v => (/app[A-Za-z0-9]{14}/.exec(String(v || '')) || [''])[0];   // accepte aussi l'adresse complète de la base

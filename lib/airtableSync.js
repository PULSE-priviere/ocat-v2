// Export vers Airtable : trois tables reliées entre elles.
//  - Organisations   : la fiche de chaque organisation (pays, type de structure, taille, contact, coach…)
//  - Diagnostics     : une ligne par diagnostic (baseline, midline, endline) : scores par section, besoins d'appui, étape d'accompagnement
//  - Accompagnement  : une ligne par besoin travaillé en session : notes du coach, action, responsable, échéance
// Chaque ligne a un « Identifiant » technique (clé de mise à jour) ; les liens se font par identifiant d'enregistrement Airtable.
import { loadBank } from './bank';
import { sectionProgress, sectionScore, globalScore, completion } from './scoring';
import { fetchAll, fetchIn } from './supabase';
import { countryName } from './countries';
import { stageOf, effectiveSession } from './stage';
import { wanted } from './plan';
import { api, headers, pace, airtableConfig, airtableReady, airtableError } from './scoresExport';
import fr from '../locales/fr.json';

export const KEY = 'Identifiant';
export const TABLE_KEYS = ['organisations', 'diagnostics', 'accompagnement'];

const txt = (name, description) => ({ name, type: 'singleLineText', ...(description ? { description } : {}) });
const long = name => ({ name, type: 'multilineText' });
const num = (name, precision = 0, description) => ({ name, type: 'number', options: { precision }, ...(description ? { description } : {}) });
const date = name => ({ name, type: 'date', options: { dateFormat: { name: 'iso' } } });
const mail = name => ({ name, type: 'email' });
const link = (name, to) => ({ name, type: 'multipleRecordLinks', link: to });   // « to » : table liée, résolue à la création
const keyField = () => txt(KEY, 'Identifiant technique (clé de mise à jour) : ne pas modifier');

// Colonnes de chaque table ; le premier champ est le champ principal d'Airtable. sectionNames : { 1: 'Gouvernance…' } pour documenter les colonnes de score.
export function tableDefs(sectionNames = {}) {
  return {
    organisations: [
      txt('Organisation'), keyField(), txt('Projet'), txt('Pays'), txt('Type de structure'), txt('Taille'),
      txt('Contact'), mail('E-mail'), txt('Coach'), txt('Origine'), date('Date de création'), txt('Mis à jour le'),
    ],
    diagnostics: [
      txt('Diagnostic'), keyField(), link('Organisation', 'organisations'), txt('Projet'), txt('Évaluation'), txt('Statut'),
      txt("Étape d'accompagnement"), txt('Statut de la session'), date('Date de la session'), txt('Statut du plan'),
      date('Date de création'), date('Date de soumission'), num('Complétion (%)'), num('Sections complètes'), num('Score global', 2),
      ...Array.from({ length: 9 }, (_, i) => num(`Score S${i + 1}`, 2, sectionNames[i + 1])),
      num('Réponses : en place (3)'), num('Réponses : partiel (2)'), num('Réponses : non en place (1)'), num('Réponses : N/A'),
      long("Besoins d'accompagnement"), num('Appuis demandés'), long('Questions avec appui demandé'), txt('Sections à approfondir'), num('Actions définies'),
      long('Scores par section (JSON)'), txt('Mis à jour le'),
    ],
    accompagnement: [
      txt('Besoin'), keyField(), link('Organisation', 'organisations'), link('Diagnostic', 'diagnostics'), txt('Projet'), txt('Coach'), txt('Évaluation'),
      txt('Section'), txt('Question'), long('Intitulé de la question'), txt('Réponse'), txt('Appui demandé'), txt('Besoins identifiés'),
      long('Notes du coach'), long('Action à mener'), txt('Responsable'), date('Échéance'), txt('Dans le plan'),
      txt('Statut du plan'), txt('Statut de la session'), date('Date de la session'), txt('Mis à jour le'),
    ],
  };
}
// Mode simple : l'ancienne table « Scores » (une ligne par diagnostic), colonnes identiques à celles de la version qui fonctionnait
export const SCORES_KEY = 'Cle';
export function scoresDefs(sectionNames = {}) {
  return [
    txt('Cle'), txt('Organisation'), txt('Contact'), txt('Email'), txt('Projet'), txt('Coach'), txt('Pays'), txt('Type de structure'), txt('Taille'),
    txt('Evaluation'), txt('Statut'), date('Date de creation'), date('Date de soumission'),
    num('Completion (%)'), num('Sections completes'), num('Score global', 2),
    ...Array.from({ length: 9 }, (_, i) => num(`Score S${i + 1}`, 2, sectionNames[i + 1])),
    long('Scores par section (JSON)'),
    num('Reponses 3 (en place)'), num('Reponses 2 (partiel)'), num('Reponses 1 (non en place)'), num('Reponses N/A'),
    num('Appuis demandes'), num('Actions definies'), long('Besoins'), txt('Mis a jour le'),
  ];
}
export const CSV_KEYS = [...TABLE_KEYS, 'scores'];
export const fieldNames = key => (key === 'scores' ? scoresDefs() : tableDefs()[key]).map(f => f.name);

// Une ligne « Scores » = le diagnostic + la fiche de son organisation, à plat
export function legacyRows(data) {
  const org = Object.fromEntries(data.organisations.map(o => [o[KEY], o]));
  return data.diagnostics.map(d => {
    const o = org[d._org] || {};
    const r = {
      Cle: d[KEY], Organisation: d.Organisation, Contact: o.Contact || '', Email: o['E-mail'] || '', Projet: d.Projet, Coach: o.Coach || '',
      Pays: o.Pays || '', 'Type de structure': o['Type de structure'] || '', Taille: o.Taille || '',
      Evaluation: d['Évaluation'], Statut: d.Statut, 'Date de creation': d['Date de création'], 'Date de soumission': d['Date de soumission'],
      'Completion (%)': d['Complétion (%)'], 'Sections completes': d['Sections complètes'], 'Score global': d['Score global'],
    };
    for (let i = 1; i <= 9; i++) r[`Score S${i}`] = d[`Score S${i}`] ?? null;
    Object.assign(r, {
      'Scores par section (JSON)': d['Scores par section (JSON)'],
      'Reponses 3 (en place)': d['Réponses : en place (3)'], 'Reponses 2 (partiel)': d['Réponses : partiel (2)'],
      'Reponses 1 (non en place)': d['Réponses : non en place (1)'], 'Reponses N/A': d['Réponses : N/A'],
      'Appuis demandes': d['Appuis demandés'], 'Actions definies': d['Actions définies'], Besoins: d["Besoins d'accompagnement"], 'Mis a jour le': d['Mis à jour le'],
    });
    return r;
  });
}

const EVAL = { baseline: 'Baseline', followup: 'Midline', endline: 'Endline' };
const PLAN = { draft: 'Brouillon', validated: 'Validé', shared: 'Partagé' };
const ORIGIN = { public: 'Lien public', manual: "Créée par l'équipe" };
const cut = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

// Construit les lignes des trois tables pour des évaluations données (texte seulement : les liens sont posés à l'envoi)
export async function buildData(svc, assessmentIds) {
  const out = { organisations: [], diagnostics: [], accompagnement: [] };
  if (!assessmentIds.length) return out;
  const { data: ass, error } = await svc.from('assessments')
    .select('id, type, status, created_at, submitted_at, session_status, session_date, section_deepen, subject:subjects(id, name, email, contact_first_name, contact_last_name, country, org_type, org_size, coach_id, origin, created_at, project:projects(id, name, framework_id))')
    .in('id', assessmentIds).order('created_at');
  if (error) throw new Error(error.message);
  const aIds = ass.map(a => a.id);
  const coachIds = [...new Set(ass.map(a => a.subject?.coach_id).filter(Boolean))];
  const coaches = coachIds.length ? (await svc.from('profiles').select('id, name, first_name, last_name, email').in('id', coachIds)).data || [] : [];
  const coachName = Object.fromEntries(coaches.map(c => [c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name || c.email]));
  const answers = await fetchAll(() => svc.from('answers').select('id, assessment_id, question_id, code, support, value_text, coach_notes, coach_action, coach_owner').in('assessment_id', aIds).order('id'));
  const links = answers.length ? await fetchIn(ids => svc.from('answer_needs').select('answer_id, need_id').in('answer_id', ids), answers.map(a => a.id)) : [];
  const needIds = [...new Set(links.map(l => l.need_id))];
  const needs = needIds.length ? await fetchIn(ids => svc.from('needs').select('id, label').in('id', ids), needIds) : [];
  const needLabel = Object.fromEntries(needs.map(n => [n.id, n.label]));
  const needsByAnswer = {};
  links.forEach(l => { (needsByAnswer[l.answer_id] = needsByAnswer[l.answer_id] || []).push(needLabel[l.need_id]); });
  const { data: plans } = await svc.from('action_plans').select('assessment_id, status, items').in('assessment_id', aIds);
  const planBy = Object.fromEntries((plans || []).map(p => [p.assessment_id, p]));
  const now = new Date().toISOString();

  const banks = {}, orgs = new Map();
  for (const a of ass) {
    const s = a.subject, pr = s.project;
    const bank = banks[pr.id] || (banks[pr.id] = await loadBank(svc, pr.framework_id, null, pr.id));
    const secById = Object.fromEntries(bank.sections.map(x => [x.id, x]));
    const mine = answers.filter(x => x.assessment_id === a.id);
    const byQ = Object.fromEntries(mine.map(x => [x.question_id, x]));
    const progress = sectionProgress(bank.sections, bank.questions, byQ);
    const scored = progress.filter(p => p.section.kind !== 'data');
    const cnt = { 3: 0, 2: 0, 1: 0, NA: 0 };
    scored.forEach(p => ['3', '2', '1', 'NA'].forEach(c => { cnt[c] += p.counts[c]; }));
    const plan = planBy[a.id] || null;
    const items = Array.isArray(plan?.items) ? plan.items : [];
    const itemBy = Object.fromEntries(items.filter(i => i && i.questionId).map(i => [i.questionId, i]));
    const hasWork = mine.some(x => String(x.coach_notes || '').trim() || String(x.coach_action || '').trim());
    const stage = stageOf({ assessment: a, plan: plan ? { status: plan.status } : null, hasWork });
    const sessionLabel = fr.sess[effectiveSession(a, hasWork)] || '';
    const coach = coachName[s.coach_id] || '';
    const evalLabel = EVAL[a.type] || a.type;

    // Organisation (une ligne par organisation, même si plusieurs diagnostics)
    orgs.set(s.id, {
      Organisation: s.name, [KEY]: s.id, Projet: pr.name, Pays: countryName(s.country, 'fr'),
      'Type de structure': fr.profile.opt.org_type[s.org_type] || s.org_type || '', Taille: fr.profile.opt.org_size[s.org_size] || s.org_size || '',
      Contact: [s.contact_first_name, s.contact_last_name].filter(Boolean).join(' '), 'E-mail': s.email || null, Coach: coach,
      Origine: ORIGIN[s.origin] || s.origin || '', 'Date de création': s.created_at.slice(0, 10), 'Mis à jour le': now,
    });

    // Questions pour lesquelles l'organisation demande un appui, dans l'ordre du questionnaire
    const supportLines = bank.questions.filter(q => byQ[q.id]?.support).map(q => `${q.code} · ${cut(q.text_fr, 140)}`);
    const needSet = new Set();
    mine.forEach(x => (needsByAnswer[x.id] || []).forEach(l => l && needSet.add(l)));
    const deepen = Object.entries(a.section_deepen || {}).filter(([, v]) => v === true)
      .map(([num]) => bank.sections.find(x => String(x.num) === String(num))).filter(Boolean)
      .map(x => `S${x.idx ?? x.num} ${x.name_fr}`);

    const d = {
      Diagnostic: `${s.name} — ${evalLabel}`, [KEY]: a.id, Organisation: s.name, _org: s.id, Projet: pr.name, Évaluation: evalLabel,
      Statut: fr.astatus[a.status] || a.status, "Étape d'accompagnement": fr.stage[stage] || stage, 'Statut de la session': sessionLabel,
      'Date de la session': a.session_date || null, 'Statut du plan': plan ? PLAN[plan.status] || plan.status : '',
      'Date de création': a.created_at.slice(0, 10), 'Date de soumission': a.submitted_at ? a.submitted_at.slice(0, 10) : null,
      'Complétion (%)': completion(progress), 'Sections complètes': scored.filter(p => p.status === 'complete').length, 'Score global': globalScore(progress),
      'Réponses : en place (3)': cnt[3], 'Réponses : partiel (2)': cnt[2], 'Réponses : non en place (1)': cnt[1], 'Réponses : N/A': cnt.NA,
      "Besoins d'accompagnement": [...needSet].sort().join(' ; '), 'Appuis demandés': supportLines.length, 'Questions avec appui demandé': supportLines.join('\n'),
      'Sections à approfondir': deepen.join(' ; '), 'Actions définies': mine.filter(x => String(x.coach_action || '').trim()).length,
      'Scores par section (JSON)': JSON.stringify(Object.fromEntries(scored.map(p => [`S${p.section.idx}`, { nom: p.section.name_fr, score: sectionScore(p), repondu: `${p.done}/${p.total}` }]))),
      'Mis à jour le': now,
    };
    for (let i = 1; i <= 9; i++) d[`Score S${i}`] = null;
    scored.forEach(p => { if (!p.section.project_id && p.section.idx <= 9) d[`Score S${p.section.idx}`] = sectionScore(p); });
    out.diagnostics.push(d);

    // Accompagnement : un appui demandé, une note, une action ou un responsable suffisent pour qu'une question ait sa ligne
    for (const q of bank.questions) {
      const x = byQ[q.id];
      if (!x) continue;
      const notes = String(x.coach_notes || '').trim(), action = String(x.coach_action || '').trim(), owner = String(x.coach_owner || '').trim();
      if (!x.support && !notes && !action && !owner) continue;
      const item = itemBy[q.id];
      const sec = secById[q.section_id];
      out.accompagnement.push({
        Besoin: cut(`${s.name} · ${q.code} ${q.text_fr}`, 110), [KEY]: `${a.id}:${q.id}`, Organisation: s.name, _org: s.id, Diagnostic: d.Diagnostic, _diag: a.id,
        Projet: pr.name, Coach: coach, Évaluation: evalLabel, Section: sec ? `S${sec.idx ?? sec.num}. ${sec.name_fr}` : '', Question: q.code, 'Intitulé de la question': q.text_fr,
        Réponse: x.code ? fr.answer[x.code] || x.code : (x.value_text || ''), 'Appui demandé': x.support ? 'Oui' : 'Non',
        'Besoins identifiés': (needsByAnswer[x.id] || []).filter(Boolean).sort().join(' ; '), 'Notes du coach': notes, 'Action à mener': action, Responsable: owner,
        Échéance: item?.due || null, 'Dans le plan': wanted(x) && item?.kept !== false ? 'Oui' : 'Non', 'Statut du plan': plan ? PLAN[plan.status] || plan.status : '',
        'Statut de la session': sessionLabel, 'Date de la session': a.session_date || null, 'Mis à jour le': now,
      });
    }
  }
  out.organisations = [...orgs.values()];
  return out;
}

// ── Envoi ─────────────────────────────────────────────────────────────────
// Mise à jour ou création par lots de 10, clé = « Identifiant » ; renvoie { identifiant : id d'enregistrement Airtable }
async function upsert(table, rows, cfg, key = KEY) {
  const ids = {};
  for (let i = 0; i < rows.length; i += 10) {
    await pace();
    const r = await fetch(`${api()}/v0/${cfg.base}/${encodeURIComponent(table)}`, {
      method: 'PATCH', headers: headers(cfg),
      body: JSON.stringify({ performUpsert: { fieldsToMergeOn: [key] }, typecast: true, records: rows.slice(i, i + 10).map(fields => ({ fields })) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw airtableError(r, j);
    (j.records || []).forEach(x => { if (x.fields?.[key]) ids[x.fields[key]] = x.id; });
  }
  return ids;
}

// Organisations d'abord, puis diagnostics (liés à leur organisation), puis lignes d'accompagnement (liées aux deux)
export async function pushData(data, cfg) {
  const strip = ({ _org, _diag, ...f }) => f;
  const orgIds = await upsert(cfg.tables.organisations, data.organisations, cfg);
  const withLinks = (r, links) => {
    const f = strip(r);
    for (const [name, rec] of Object.entries(links)) { if (rec) f[name] = [rec]; else delete f[name]; }   // jamais de texte dans un champ lié : Airtable créerait une organisation
    return f;
  };
  const diagIds = await upsert(cfg.tables.diagnostics, data.diagnostics.map(r => withLinks(r, { Organisation: orgIds[r._org] })), cfg);
  await upsert(cfg.tables.accompagnement, data.accompagnement.map(r => withLinks(r, { Organisation: orgIds[r._org], Diagnostic: diagIds[r._diag] })), cfg);
  return { organisations: data.organisations.length, diagnostics: data.diagnostics.length, accompagnement: data.accompagnement.length, orgIds: data.organisations.map(o => o[KEY]) };
}

// Mode simple : une seule table, une ligne par diagnostic
export async function pushScores(data, cfg) {
  const rows = legacyRows(data);
  await upsert(cfg.table, rows, cfg, SCORES_KEY);
  return { organisations: data.organisations.length, diagnostics: rows.length, accompagnement: 0, orgIds: data.organisations.map(o => o[KEY]) };
}

export async function syncAssessments(svc, cfg, ids) {
  const data = await buildData(svc, ids);
  return cfg.mode === 'complet' ? pushData(data, cfg) : pushScores(data, cfg);
}

// Envoi automatique : ne bloque jamais l'action de l'utilisateur et n'échoue jamais bruyamment
export async function syncAssessmentsSafe(svc, ids, { timeoutMs = 5000 } = {}) {
  try {
    const cfg = await airtableConfig(svc);
    if (!airtableReady(cfg) || !cfg.auto) return;
    await Promise.race([syncAssessments(svc, cfg, ids), new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), timeoutMs))]);
  } catch (e) { console.error('[airtable] envoi impossible :', e.message); }
}

// ── Création et mise à jour des tables ────────────────────────────────────
// Crée les tables absentes et ajoute les colonnes manquantes aux tables existantes (sans jamais rien supprimer)
export async function ensureTables(svc, cfg) {
  const names = {};
  try {
    const { data: fw } = await svc.from('frameworks').select('id').limit(1).maybeSingle();
    if (fw) (await loadBank(svc, fw.id, null, null)).sections.filter(s => !s.project_id).forEach((s, i) => { names[s.idx ?? i + 1] = s.name_fr; });
  } catch { /* descriptions facultatives */ }
  const defs = tableDefs(names);
  const meta = async (path, init) => {
    await pace();
    const r = await fetch(`${api()}/v0/meta/bases/${cfg.base}${path}`, { ...init, headers: headers(cfg) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = airtableError(r, j); if (r.status === 403) e.code = 'airtable_schema_scope'; throw e; }
    return j;
  };
  const DESC = {
    organisations: 'Une ligne par organisation : informations renseignées au début du questionnaire.',
    diagnostics: "Une ligne par diagnostic (baseline, midline, endline) : scores par section et besoins d'accompagnement.",
    accompagnement: "Une ligne par besoin travaillé en session d'accompagnement : notes du coach, action, responsable et échéance.",
  };
  const existing = (await meta('/tables')).tables || [];
  const ids = {}, created = [], added = [];
  // Mode simple : la seule table « Scores » ; mode complet : les trois tables, dans l'ordre des liens
  const targets = cfg.mode === 'complet'
    ? TABLE_KEYS.map(key => ({ key, name: cfg.tables[key], defs: defs[key], desc: DESC[key] }))
    : [{ key: 'scores', name: cfg.table, defs: scoresDefs(names), desc: 'Une ligne par diagnostic (baseline, midline, endline) : organisation, scores par section, besoins d\'accompagnement.' }];
  for (const { key, name, defs: fieldDefs, desc } of targets) {
    const api_ = d => { const { link: to, ...rest } = d; return to ? { ...rest, options: { linkedTableId: ids[to] } } : rest; };
    const found = existing.find(t => t.name === name);
    if (!found) {
      const t = await meta('/tables', { method: 'POST', body: JSON.stringify({ name, description: desc, fields: fieldDefs.map(api_) }) });
      ids[key] = t.id; created.push(name);
      continue;
    }
    ids[key] = found.id;
    const have = new Set((found.fields || []).map(f => f.name));
    const missing = fieldDefs.filter(d => !have.has(d.name));
    for (const d of missing) await meta(`/tables/${found.id}/fields`, { method: 'POST', body: JSON.stringify(api_(d)) });
    if (missing.length) added.push(`${name} : ${missing.map(d => d.name).join(', ')}`);
  }
  return { created, added };
}

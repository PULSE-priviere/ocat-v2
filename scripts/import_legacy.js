#!/usr/bin/env node
/**
 * Import de l'ancien Airtable (export CSV) vers Supabase.
 *
 *   node scripts/import_legacy.js data/SEEED.csv --project "SEEED"            (essai à blanc, n'écrit rien)
 *   node scripts/import_legacy.js data/SEEED.csv --project "SEEED" --apply    (écrit dans la base)
 *   node scripts/import_legacy.js data/SEEED.csv --offline                    (contrôle du CSV seul, sans Supabase)
 *
 * Options : --maps scripts/legacy_maps.json   --out data/legacy_import   --keep-audit
 * Variables (.env.local) : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Relançable : une organisation (project + e-mail) ou un diagnostic déjà présent n'est jamais écrasé.
 */
const fs = require('fs');
const path = require('path');

// ───────── arguments ─────────
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--project'
  && argv[argv.indexOf(a) - 1] !== '--maps' && argv[argv.indexOf(a) - 1] !== '--out');
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const APPLY = flag('apply');
const OFFLINE = flag('offline');
const KEEP_AUDIT = flag('keep-audit');
const PROJECT = opt('project', 'SEEED');
const MAPS = opt('maps', 'scripts/legacy_maps.json');
const OUT = opt('out', 'data/legacy_import');
if (!file) { console.error('Usage : node scripts/import_legacy.js <export.csv> --project "Nom" [--apply]'); process.exit(1); }

// ───────── utilitaires ─────────
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// CSV (RFC 4180) : guillemets, virgules et sauts de ligne dans les champs
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((x) => x !== '')) rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const writeCsv = (p, rows) => {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  fs.writeFileSync(p, '\uFEFF' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n'));
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘`]/g, "'")
  .replace(/\s+/g, ' ').trim().toLowerCase();
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// Nom de pays (FR ou EN) -> code ISO, construit avec Intl : aucune liste à maintenir
function countryIndex() {
  const idx = {};
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const lang of ['fr', 'en']) {
    const dn = new Intl.DisplayNames([lang], { type: 'region' });
    for (const a of A) for (const b of A) {
      const code = a + b; let n;
      try { n = dn.of(code); } catch { continue; }
      if (n && n !== code) idx[norm(n)] = code;
    }
  }
  return idx;
}

// Date Airtable « 11/13/2026 11:26 » (M/J/AAAA) -> ISO
function parseDate(s) {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], +(m[4] || 0), +(m[5] || 0)));
  return isNaN(d) ? null : d.toISOString();
}

function scaleCode(v) {
  if (!v) return null;
  if (/non applicable|^n\/?a$/i.test(v)) return 'NA';
  const m = v.match(/^([123])\b/);
  return m ? m[1] : undefined; // undefined = valeur inconnue
}

// ───────── lecture du CSV ─────────
const rowsAll = parseCsv(fs.readFileSync(file, 'utf8'));
const headers = Object.keys(rowsAll[0] || {});
const qCols = {}, appuiCols = {};
for (const h of headers) {
  let m = h.match(/^\[(\d+\.\d+)\]\s*([\s\S]*)$/);
  if (m) { qCols[m[1]] = { header: h, text: m[2] }; continue; }
  m = h.match(/^Appui structure\s*[—–-]\s*(\d+\.\d+)$/);
  if (m) appuiCols[m[1]] = h;
}
const errors = [], warnings = [];
const rows = [];
let skippedDeleted = 0;
for (const r of rowsAll) {
  if (norm(r['Statut_Record']) === 'deleted') { skippedDeleted++; console.log(`  ignorée (supprimée dans Airtable) : #${r['ID']} ${r["Nom de l'OSC"]}`); continue; }
  rows.push(r);
}
console.log(`CSV : ${rowsAll.length} lignes, ${rows.length} à importer, ${skippedDeleted} supprimée(s) ignorée(s) ; ${Object.keys(qCols).length} questions.`);

// ───────── cartes de correspondance ─────────
const maps = JSON.parse(fs.readFileSync(MAPS, 'utf8'));
const todo = (obj) => Object.entries(obj || {}).filter(([, v]) => v === undefined || (typeof v === 'string' && (v === '' || /^TODO/i.test(v)))).map(([k]) => k);

async function main() {
  loadEnv();
  const cIdx = countryIndex();
  let sb = null, project = null, bankByCode = {}, coachByName = {};

  if (!OFFLINE) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (.env.local).'); process.exit(1); }
    sb = require('@supabase/supabase-js').createClient(url, key, { auth: { persistSession: false } });

    const { data: ps, error: pe } = await sb.from('projects').select('id,name,framework_id,countries').eq('name', PROJECT);
    if (pe) throw pe;
    if (ps.length !== 1) { console.error(`Projet « ${PROJECT} » : ${ps.length} résultat(s). Créez-le d'abord (Administration) ou précisez --project.`); process.exit(1); }
    project = ps[0];

    const { data: qs, error: qe } = await sb.from('questions')
      .select('id,code,concept_id,text_fr,section_id').eq('framework_id', project.framework_id).is('assessment_id', null).is('project_id', null).limit(2000);
    if (qe) throw qe;
    for (const q of qs) if (q.code) bankByCode[q.code] = q;
    const missing = Object.keys(qCols).filter((c) => !bankByCode[c]);
    if (missing.length) errors.push(`Questions du CSV absentes de la banque (colonne questions.code) : ${missing.join(', ')}. Vérifiez que seed.js a été lancé et que « code » est au format 1.1, 1.2…`);
    for (const [c, q] of Object.entries(qCols)) {
      const b = bankByCode[c]; if (!b) continue;
      if (norm(b.text_fr).slice(0, 35) !== norm(q.text).slice(0, 35)) warnings.push(`Texte différent pour ${c} : banque « ${b.text_fr.slice(0, 50)}… » / Airtable « ${q.text.slice(0, 50)}… » (même question ? sinon la réponse serait mal rattachée)`);
    }

    // coachs : profil existant + membre coach du projet
    const emails = Object.values(maps.coaches || {}).filter((e) => e && !/^TODO/i.test(e)).map((e) => e.toLowerCase());
    if (!emails.length) warnings.push("Aucun e-mail de coach renseigné dans legacy_maps.json : organisations importées sans coach (affectez-les dans l'application, ou relancez le script plus tard avec les e-mails : il complète les coachs manquants).");
    if (emails.length) {
      const { data: profs } = await sb.from('profiles').select('id,email').in('email', emails);
      const { data: mems } = await sb.from('memberships').select('user_id,role').eq('project_id', project.id).eq('role', 'coach');
      const isCoach = new Set((mems || []).map((m) => m.user_id));
      for (const [name, em] of Object.entries(maps.coaches)) {
        if (!em || /^TODO/i.test(em)) continue;
        const p = (profs || []).find((x) => String(x.email).toLowerCase() === String(em).toLowerCase());
        if (!p) warnings.push(`Coach « ${name} » : aucun compte pour ${em} (invitez-le d'abord) → organisations sans coach.`);
        else if (!isCoach.has(p.id)) warnings.push(`Coach « ${name} » (${em}) n'est pas coach du projet « ${PROJECT} » → organisations sans coach.`);
        else coachByName[name] = p.id;
      }
    }
    if (project.countries && project.countries.length && !project.countries.includes('MG')) { /* avertissement générique ci-dessous */ }
  }

  // cartes incomplètes
  for (const k of ['org_type', 'org_size']) {
    const t = todo(maps[k]); if (t.length) errors.push(`legacy_maps.json › ${k} : à renseigner pour ${t.map((x) => `« ${x} »`).join(', ')}.`);
  }
  const usedTypes = new Set(rows.map((r) => r["Type d'organisation"]).filter(Boolean));
  const usedSizes = new Set(rows.map((r) => r["Taille (nombre d'employes)"]).filter(Boolean));
  for (const t of usedTypes) if (!(t in (maps.org_type || {}))) errors.push(`Type d'organisation absent de la carte : « ${t} ».`);
  for (const t of usedSizes) if (!(t in (maps.org_size || {}))) errors.push(`Taille absente de la carte : « ${t} ».`);

  // ───────── transformation ─────────
  const sections = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const sectionKey = { 1: 'Gouvernance', 2: 'Finances', 3: 'Strategie', 4: 'RH', 5: 'Operations', 6: 'MEAL', 7: 'Communication', 8: 'Culture', 9: 'Relations' };
  const seenEmail = new Set();
  const items = []; let droppedSupport = 0;

  for (const r of rows) {
    const label = `#${r.ID} ${r["Nom de l'OSC"]}`;
    const email = (r['Email de contact'] || '').toLowerCase();
    if (!r["Nom de l'OSC"]) { errors.push(`${label} : nom vide.`); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`${label} : e-mail invalide « ${r['Email de contact']} ».`); continue; }
    if (seenEmail.has(email)) { errors.push(`${label} : e-mail en double dans le CSV (${email}).`); continue; }
    seenEmail.add(email);

    const country = cIdx[norm(r['Pays'])];
    if (!country) { errors.push(`${label} : pays inconnu « ${r['Pays']} ».`); continue; }
    const aType = (maps.assessment_type || {})[r["Type d'évaluation"]];
    if (!aType) { errors.push(`${label} : type d'évaluation non mappé « ${r["Type d'évaluation"]} » (legacy_maps.json › assessment_type).`); continue; }

    const answers = [];
    for (const [c, q] of Object.entries(qCols)) {
      const raw = r[q.header]; if (!raw) continue;
      const code = scaleCode(raw);
      if (code === undefined) { errors.push(`${label} ${c} : valeur inconnue « ${raw} ».`); continue; }
      let support = null;
      const ap = appuiCols[c] ? r[appuiCols[c]] : '';
      if (code === '1' || code === '2') support = /^oui$/i.test(ap) ? true : /^non$/i.test(ap) ? false : null;
      else if (/^oui$/i.test(ap)) droppedSupport++; // la base n'accepte l'appui que pour 1 ou 2
      answers.push({ code: c, value: code, support });
    }
    const comments = {}, deepen = {};
    for (const n of sections) {
      const cm = r[`Commentaire_S${n}_${sectionKey[n]}`]; if (cm) comments[String(n)] = cm;
      deepen[String(n)] = /^oui$/i.test(r[`Approfondir_S${n}`] || '');
    }
    items.push({
      legacy_id: r.ID, name: r["Nom de l'OSC"], email, country,
      org_type: (maps.org_type || {})[r["Type d'organisation"]] || null,
      org_size: (maps.org_size || {})[r["Taille (nombre d'employes)"]] || null,
      facilitator: String(r['Facilitateur'] || '').trim().replace(/\s+/g, ' ').slice(0, 120) || null, coach_id: coachByName[r['Facilitateur']] || null,
      assessment_type: aType,
      submitted_at: parseDate(r['Date de soumission']) || parseDate(r['Modification_date']) || new Date().toISOString(),
      comments, deepen, answers,
      global_comment: r['Commentaire global'],
      legacy_scores: Object.fromEntries([...sections.map((n) => [`S${n}`, r[`Score_S${n}_${sectionKey[n]}`]]), ['global', r['Score_Global']], ['niveau', r['Niveau_Global']]]),
    });
    if (!r['Facilitateur']) warnings.push(`${label} : pas de facilitateur → sans coach.`);
    else if (!OFFLINE && !coachByName[r['Facilitateur']]) { /* déjà signalé plus haut */ }
  }
  if (project && project.countries && project.countries.length) {
    const bad = [...new Set(items.map((i) => i.country))].filter((c) => !project.countries.includes(c));
    if (bad.length) warnings.push(`Pays hors de la liste du projet : ${bad.join(', ')} (ajoutez-les dans Administration > projet, sinon ils s'affichent mais ne seront pas proposés).`);
  }

  // ───────── bilan ─────────
  const nAns = items.reduce((s, i) => s + i.answers.length, 0);
  console.log(`\nÀ importer : ${items.length} organisations, ${items.length} diagnostics, ${nAns} réponses.`);
  console.log(`Types de diagnostic : ${[...new Set(items.map((i) => i.assessment_type))].join(', ')}`);
  console.log(`Commentaires de section : ${items.reduce((s, i) => s + Object.keys(i.comments).length, 0)} ; commentaires globaux : ${items.filter((i) => i.global_comment).length} (non importés, voir rapport).`);
  if (droppedSupport) console.log(`« Appui = Oui » ignoré sur ${droppedSupport} réponses notées 3 ou N/A (règle de la base : appui seulement pour 1 ou 2).`);
  warnings.forEach((w) => console.log('  ⚠ ' + w));
  if (errors.length) { console.log('\nERREURS (à corriger avant --apply) :'); errors.forEach((e) => console.log('  ✗ ' + e)); }

  if (!APPLY) { console.log(errors.length ? '\nEssai à blanc terminé avec erreurs.' : '\nEssai à blanc OK. Relancez avec --apply pour écrire.'); process.exit(errors.length ? 1 : 0); }
  if (errors.length || OFFLINE) { console.error('\n--apply refusé : corrigez les erreurs (et ne pas utiliser --offline).'); process.exit(1); }

  // ───────── écriture ─────────
  const startedAt = new Date(Date.now() - 5000).toISOString();
  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  let created = 0, reused = 0, skipped = 0, nAnsWritten = 0;

  for (const it of items) {
    // organisation : jamais écrasée
    let { data: ex, error: e1 } = await sb.from('subjects').select('id,coach_id,facilitator').eq('project_id', project.id).eq('email', it.email).maybeSingle();
    if (e1) throw e1;
    let subjectId = ex?.id;
    if (!subjectId) {
      const { data, error } = await sb.from('subjects').insert({
        project_id: project.id, name: it.name, email: it.email, country: it.country,
        org_type: it.org_type, org_size: it.org_size, coach_id: it.coach_id, facilitator: it.facilitator, origin: 'manual',
      }).select('id').single();
      if (error) throw new Error(`${it.name} : ${error.message}`);
      subjectId = data.id; created++;
    } else {
      reused++;
      // complète le coach seulement s'il manque (n'écrase jamais une affectation faite dans l'application)
      if (!ex.coach_id && it.coach_id) {
        const { error } = await sb.from('subjects').update({ coach_id: it.coach_id }).eq('id', subjectId);
        if (error) throw new Error(`${it.name} (coach) : ${error.message}`);
      }
      // complète le facilitateur seulement s'il est vide (jamais d'écrasement)
      if (!String(ex.facilitator || '').trim() && it.facilitator) {
        const { error } = await sb.from('subjects').update({ facilitator: it.facilitator }).eq('id', subjectId);
        if (error) throw new Error(`${it.name} (facilitateur) : ${error.message}`);
      }
    }

    // diagnostic : un seul par organisation et par type
    const { data: exA, error: e2 } = await sb.from('assessments').select('id').eq('subject_id', subjectId).eq('type', it.assessment_type).maybeSingle();
    if (e2) throw e2;
    if (exA) { skipped++; report.push({ legacy_id: it.legacy_id, name: it.name, subject_id: subjectId, assessment_id: exA.id, statut: 'déjà présent, non modifié' }); continue; }
    const { data: a, error: e3 } = await sb.from('assessments').insert({
      subject_id: subjectId, type: it.assessment_type, status: 'submitted', submitted_at: it.submitted_at,
      section_comments: it.comments, section_deepen: it.deepen, notes_shared: false,
    }).select('id').single();
    if (e3) throw new Error(`${it.name} : ${e3.message}`);

    const recs = it.answers.map((x) => ({ assessment_id: a.id, question_id: bankByCode[x.code].id, code: x.value, support: x.support }));
    for (const part of chunk(recs, 500)) {
      const { error } = await sb.from('answers').insert(part);
      if (error) throw new Error(`${it.name} (réponses) : ${error.message}`);
    }
    nAnsWritten += recs.length;
    report.push({ legacy_id: it.legacy_id, name: it.name, subject_id: subjectId, assessment_id: a.id, statut: 'importé',
      nb_reponses: recs.length, facilitateur: it.facilitator, coach_affecte: it.coach_id ? 'oui' : 'non',
      ...Object.fromEntries(Object.entries(it.legacy_scores).map(([k, v]) => ['ancien_score_' + k, v])),
      commentaire_global: it.global_comment });
  }

  if (!KEEP_AUDIT) {
    const { error } = await sb.from('audit_log').delete().eq('project_id', project.id).is('actor_id', null).gte('at', startedAt);
    if (error) console.log('  ⚠ nettoyage du journal impossible : ' + error.message);
    else console.log('Journal d\'audit : lignes générées par l\'import supprimées.');
  }
  const rp = path.join(OUT, `rapport_${new Date().toISOString().slice(0, 10)}.csv`);
  writeCsv(rp, report);
  console.log(`\nTerminé : ${created} organisations créées, ${reused} déjà existantes, ${skipped} diagnostics déjà présents, ${nAnsWritten} réponses écrites.\nRapport : ${rp}`);
}
main().catch((e) => { console.error('\nÉCHEC :', e.message || e); process.exit(1); });

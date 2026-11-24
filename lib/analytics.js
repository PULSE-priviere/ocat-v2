// Analytics de cohorte : fonctions pures (aucun appel réseau), utilisées par l'écran ET par les exports,
// pour que les chiffres soient identiques partout. Les règles de score viennent de lib/scoring.js.
import appConfig from '../app.config';
import { isScored, sectionProgress, sectionLive, globalMean, completion, EVAL_ORDER } from './scoring';
import { matches } from './search';

export const CFG = appConfig.analytics;
export const NONE = '__none';                                     // valeur de filtre/groupe « non renseigné »
export const PROFILE_KEYS = ['support_org', 'coach', 'org_size', 'org_type', 'mode', 'country'];
const pickText = (row, field, lang) => (row && (row[`${field}_${lang}`] || row[`${field}_fr`])) || '';

// ── Statistiques ──
const r2 = v => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100) / 100);
export function mean(vals) { return vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : null; }
export function median(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return r2(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}
// Écart-type d'échantillon (n − 1) ; null en dessous de 2 valeurs
export function sd(vals) {
  if (vals.length < 2) return null;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return r2(Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1)));
}
const share = (num, den) => (den ? num / den : null);
export const bandOf = v => (v === null ? null : [...CFG.bands].reverse().find(b => v >= b.min)?.key || CFG.bands[0].key);

// ── Préparation : une fiche par évaluation (scores de section, global, complétude, profil) ──
// bank : { sections, questions } (lib/bank.js) ; raw : réponse de analytics_rows
export function prepare(bank, raw) {
  const secOf = Object.fromEntries(bank.sections.map(s => [s.id, s]));
  const questions = bank.questions.filter(q => secOf[q.section_id] && secOf[q.section_id].kind !== 'data' && isScored(q, secOf[q.section_id]));
  const sections = bank.sections.filter(s => s.kind !== 'data' && questions.some(q => q.section_id === s.id));
  const qIds = new Set(questions.map(q => q.id));
  const byAss = {};
  (raw.answers || []).forEach(([aid, qid, code, support]) => {
    if (!qIds.has(qid)) return;                                    // question non notée : ignorée
    (byAss[aid] = byAss[aid] || {})[qid] = { code, support };
  });
  const subjOf = Object.fromEntries((raw.subjects || []).map(s => [s.id, s]));
  const records = (raw.assessments || []).map(a => {
    const s = subjOf[a.subject_id];
    if (!s) return null;
    const answers = byAss[a.id] || {};
    const progress = sectionProgress(sections, questions, answers);
    return {
      assessment: a, subject: s, answers, progress,
      sectionScores: Object.fromEntries(progress.map(p => [p.section.id, sectionLive(p)])),
      global: globalMean(progress), completion: completion(progress),
      profile: {
        support_org: String(s.support_org || '').trim(), coach: s.coach_id || '', org_size: s.org_size || '',
        org_type: s.org_type || '', mode: a.administration_mode || 'self', country: s.country || '',
      },
    };
  }).filter(Boolean);
  const types = EVAL_ORDER.filter(k => records.some(r => r.assessment.type === k));
  const coachNames = Object.fromEntries((raw.subjects || []).filter(s => s.coach_id).map(s => [s.coach_id, s.coach_name || '']));
  const options = Object.fromEntries(PROFILE_KEYS.map(k => [k, [...new Set(records.map(r => r.profile[k]))].sort()]));
  return { sections, allSections: bank.sections, questions, records, types, coachNames, options };
}

// ── Sélection ──
export const inScope = (a, includeInProgress) =>
  a.status === 'submitted' || (a.status === 'locked' && !!a.submitted_at) || !!includeInProgress;
const matchProfile = (r, f) => PROFILE_KEYS.every(k => !f[k] || (f[k] === NONE ? !r.profile[k] : r.profile[k] === f[k]));
const stamp = a => a.submitted_at || a.created_at || '';

// Une évaluation par organisation (la plus récente du type choisi), dans le périmètre et les filtres
export function selectRecords(model, f, type = f.type) {
  const best = {};
  model.records.forEach(r => {
    if (r.assessment.type !== type || !inScope(r.assessment, f.inProgress) || !matchProfile(r, f)) return;
    const cur = best[r.subject.id];
    if (!cur || stamp(r.assessment) > stamp(cur.assessment)) best[r.subject.id] = r;
  });
  return Object.values(best).sort((a, b) => a.subject.name.localeCompare(b.subject.name));
}

// ── Bloc 2 : maturité par section ──
export function sectionStats(recs, model) {
  return model.sections.map(s => {
    const vals = recs.map(r => r.sectionScores[s.id]).filter(v => v !== null && v !== undefined);
    const bands = Object.fromEntries(CFG.bands.map(b => [b.key, 0]));
    vals.forEach(v => { bands[bandOf(v)]++; });
    return { section: s, mean: mean(vals), median: median(vals), sd: sd(vals), n: vals.length, bands };
  });
}

// ── Bloc 1 : chiffres clés ──
export function keyFigures(recs, model, secStats = sectionStats(recs, model)) {
  const globals = recs.map(r => r.global).filter(v => v !== null);
  let yes = 0, known = 0;
  recs.forEach(r => Object.values(r.answers).forEach(a => {
    if (!['1', '2'].includes(a.code) || a.support === null || a.support === undefined) return;
    known++; if (a.support === true) yes++;
  }));
  return {
    n: recs.length, globalMean: mean(globals), globalMedian: median(globals),
    completion: recs.length ? Math.round(recs.reduce((a, r) => a + r.completion, 0) / recs.length) : null,
    supportRate: share(yes, known), supportYes: yes, supportKnown: known,
    lowSections: secStats.filter(s => s.mean !== null && s.mean < CFG.lowSection).length,
  };
}

// ── Bloc 3 : tableau des questions ──
export function questionStats(recs, model) {
  const secOf = Object.fromEntries(model.sections.map(s => [s.id, s]));
  return model.questions.map(q => {
    const counts = { NA: 0, '1': 0, '2': 0, '3': 0 };
    const byCode = { NA: [], '1': [], '2': [], '3': [] };
    let yes = 0, known = 0;
    recs.forEach(r => {
      const a = r.answers[q.id];
      if (!a || counts[a.code] === undefined) return;
      counts[a.code]++; byCode[a.code].push({ id: r.subject.id, name: r.subject.name, support: a.support });
      if (['1', '2'].includes(a.code) && a.support !== null && a.support !== undefined) { known++; if (a.support === true) yes++; }
    });
    const respondents = counts.NA + counts['1'] + counts['2'] + counts['3'];
    const n13 = counts['1'] + counts['2'] + counts['3'];
    const naShare = share(counts.NA, respondents);
    return {
      question: q, section: secOf[q.section_id], counts, byCode, respondents, n13, missing: recs.length - respondents,
      naShare, mean: n13 ? r2((counts['1'] + 2 * counts['2'] + 3 * counts['3']) / n13) : null,
      gap: share(counts['1'] + counts['2'], n13), supportRate: share(yes, known), supportKnown: known,
      naAlert: naShare !== null && naShare > CFG.naAlert,
    };
  });
}

// ── Bloc 4 : top et flop (questions à fort N/A exclues) ──
export function topFlop(qStats) {
  const ok = qStats.filter(q => !q.naAlert && q.mean !== null);
  const weak = [...ok].sort((a, b) => a.mean - b.mean || (b.gap ?? 0) - (a.gap ?? 0) || b.n13 - a.n13).slice(0, CFG.topN);
  const strong = [...ok].sort((a, b) => b.mean - a.mean || (a.gap ?? 0) - (b.gap ?? 0) || b.n13 - a.n13).slice(0, CFG.topN);
  return { weak, strong };
}

// ── Bloc 5 : comparaison par segment ──
function groupRow(key, recs, model) {
  const secs = Object.fromEntries(model.sections.map(s => [s.id, mean(recs.map(r => r.sectionScores[s.id]).filter(v => v !== null && v !== undefined))]));
  return {
    key, n: recs.length, small: recs.length < CFG.minGroup, sections: secs,
    global: mean(recs.map(r => r.global).filter(v => v !== null)),
    guidedShare: share(recs.filter(r => r.profile.mode === 'guided').length, recs.length),
  };
}
export function segments(recs, model, by) {
  const groups = {};
  recs.forEach(r => { const k = r.profile[by] || NONE; (groups[k] = groups[k] || []).push(r); });
  const keys = Object.keys(groups).sort((a, b) => (a === NONE) - (b === NONE) || a.localeCompare(b));
  return { rows: keys.map(k => groupRow(k, groups[k], model)), total: groupRow('__all', recs, model) };
}

// ── Bloc 6 : évolution (organisations présentes aux deux évaluations seulement) ──
export function evolution(model, f, from, to) {
  const A = Object.fromEntries(selectRecords(model, f, from).map(r => [r.subject.id, r]));
  const pairs = selectRecords(model, f, to).filter(r => A[r.subject.id]).map(r => [A[r.subject.id], r]);
  const row = (get) => {
    const both = pairs.map(([a, b]) => [get(a), get(b)]).filter(([x, y]) => x !== null && x !== undefined && y !== null && y !== undefined);
    const m1 = mean(both.map(p => p[0])), m2 = mean(both.map(p => p[1]));
    return { from: m1, to: m2, diff: m1 !== null && m2 !== null ? r2(m2 - m1) : null, n: both.length };
  };
  return {
    n: pairs.length,
    sections: model.sections.map(s => ({ section: s, ...row(r => r.sectionScores[s.id]) })),
    global: row(r => r.global),
  };
}

// ── Bloc 7 : qualité des données ──
export function quality(recs, qStats) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, n: 0 }));
  recs.forEach(r => { bins[Math.min(9, Math.floor(r.completion / 10))].n++; });
  return {
    bins,
    naQuestions: qStats.filter(q => q.naAlert).sort((a, b) => b.naShare - a.naShare),
    lowOrgs: recs.filter(r => r.completion < CFG.lowCompletion).sort((a, b) => a.completion - b.completion),
  };
}

// ── Bloc 8 : commentaires par section (clé = numéro interne de la section) ──
export function comments(recs, model, { section = '', query = '' } = {}, lang = 'fr') {
  const byNum = Object.fromEntries(model.allSections.map(s => [String(s.num), s]));
  const out = [];
  recs.forEach(r => Object.entries(r.assessment.section_comments || {}).forEach(([num, text]) => {
    const txt = String(text || '').trim(), s = byNum[num];
    if (!txt || !s || (section && s.id !== section)) return;
    if (!matches(query, [txt, r.subject.name, pickText(s, 'name', lang)])) return;
    out.push({ subject: r.subject, section: s, text: txt });
  }));
  return out.sort((a, b) => a.section.idx - b.section.idx || a.subject.name.localeCompare(b.subject.name));
}

// ── Tables d'export (CSV et Excel) : colonnes typées, valeurs brutes ──
// ctx : { t, lang, label(key, value) } fourni par l'écran ; pct = fraction 0-1, score = 1-3
const col = (label, type = 'text') => ({ label, type });
const secLabel = (s, lang) => `S${s.idx} ${pickText(s, 'name', lang)}`;

export const commentsTable = (list, { t, lang }) => ({
  name: t('analytics.b8_title'), columns: [col(t('analytics.col_org')), col(t('analytics.col_section')), col(t('analytics.col_comment'))],
  rows: list.map(c => [c.subject.name, secLabel(c.section, lang), c.text]),
});

export function tables(view, ctx) {
  const { t, lang, label } = ctx;
  const T = k => t(`analytics.${k}`);
  const out = {};
  const k = view.key;
  out.key = { name: T('b1_title'), columns: [col(T('col_indicator')), col(T('col_value'), 'num')], rows: [
    [T('k_orgs'), k.n], [T('k_global_mean'), k.globalMean], [T('k_global_median'), k.globalMedian],
    [T('k_completion'), k.completion === null ? null : k.completion / 100], [T('k_support'), k.supportRate], [T('k_low_sections'), k.lowSections],
  ], rowTypes: ['int', 'score', 'score', 'pct', 'pct', 'int'] };
  out.sections = { name: T('b2_title'), columns: [col(T('col_section')), col(T('col_mean'), 'score'), col(T('col_median'), 'score'), col(T('col_sd'), 'num'), col(T('col_n'), 'int'),
    ...CFG.bands.map(b => col(T(`band_${b.key}`), 'int'))],
    rows: view.sections.map(s => [secLabel(s.section, lang), s.mean, s.median, s.sd, s.n, ...CFG.bands.map(b => s.bands[b.key])]) };
  out.questions = { name: T('b3_title'), columns: [col(T('col_code')), col(T('col_section')), col(T('col_question')), col(T('col_respondents'), 'int'), col(T('col_na'), 'pct'),
    col('1', 'int'), col('2', 'int'), col('3', 'int'), col(T('col_mean'), 'score'), col(T('col_gap'), 'pct'), col(T('col_support'), 'pct'), col(T('col_alert'))],
    rows: view.questions.map(q => [q.question.code, `S${q.section.idx}`, pickText(q.question, 'text', lang), q.respondents, q.naShare,
      q.counts['1'], q.counts['2'], q.counts['3'], q.mean, q.gap, q.supportRate, q.naAlert ? T('na_alert_short') : '']) };
  const tf = (list, kind) => list.map((q, i) => [kind, i + 1, q.question.code, pickText(q.question, 'text', lang), q.mean, q.gap, q.n13]);
  out.topflop = { name: T('b4_title'), columns: [col(T('col_kind')), col(T('col_rank'), 'int'), col(T('col_code')), col(T('col_question')), col(T('col_mean'), 'score'), col(T('col_gap'), 'pct'), col(T('col_n'), 'int')],
    rows: [...tf(view.topFlop.weak, T('weak')), ...tf(view.topFlop.strong, T('strong'))] };
  const seg = view.segments, showGuided = ['support_org', 'coach'].includes(view.segBy);
  const segRow = (r, name) => [name, r.n, r.small ? T('indicative') : '', ...view.model.sections.map(s => r.sections[s.id]), r.global, ...(showGuided ? [r.guidedShare] : [])];
  out.segments = { name: `${T('b5_title')} (${T(`by_${view.segBy}`)})`, columns: [col(T(`by_${view.segBy}`)), col(T('col_n'), 'int'), col(T('col_indicative')),
    ...view.model.sections.map(s => col(`S${s.idx}`, 'score')), col(T('col_global'), 'score'), ...(showGuided ? [col(T('col_guided'), 'pct')] : [])],
    rows: [...seg.rows.map(r => segRow(r, label(view.segBy, r.key))), segRow(seg.total, T('all'))] };
  if (view.evolution) {
    const e = view.evolution;
    out.evolution = { name: T('b6_title'), columns: [col(T('col_section')), col(t(`eval.${view.evoFrom}`), 'score'), col(t(`eval.${view.evoTo}`), 'score'), col(T('col_diff'), 'num'), col(T('col_paired'), 'int')],
      rows: [...e.sections.map(s => [secLabel(s.section, lang), s.from, s.to, s.diff, s.n]), [T('col_global'), e.global.from, e.global.to, e.global.diff, e.global.n]] };
  }
  const q = view.quality;
  out.quality = { name: T('b7_title'), columns: [col(T('col_part')), col(T('col_item')), col(T('col_value'), 'num')], rows: [
    ...q.bins.map(b => [T('q_hist'), `${b.from}-${b.to} %`, b.n]),
    ...q.naQuestions.map(x => [T('q_na'), `${x.question.code} ${pickText(x.question, 'text', lang)}`, x.naShare]),
    ...q.lowOrgs.map(r => [T('q_low'), r.subject.name, r.completion / 100]),
  ], rowTypes: [...q.bins.map(() => 'int'), ...q.naQuestions.map(() => 'pct'), ...q.lowOrgs.map(() => 'pct')] };
  out.comments = commentsTable(view.comments, ctx);
  out.orgs = { name: T('sheet_orgs'), columns: [col(T('col_org')), col(T('f_country')), col(T('f_org_type')), col(T('f_org_size')), col(T('f_coach')), col(T('f_support_org')),
    col(T('f_mode')), col(T('col_type')), col(T('col_status')), col(T('k_completion'), 'pct'), col(T('col_global'), 'score'), ...view.model.sections.map(s => col(`S${s.idx}`, 'score'))],
    rows: view.records.map(r => [r.subject.name, label('country', r.profile.country), label('org_type', r.profile.org_type), label('org_size', r.profile.org_size),
      label('coach', r.profile.coach), r.profile.support_org, label('mode', r.profile.mode), t(`eval.${r.assessment.type}`), t(`astatus.${r.assessment.status}`),
      r.completion / 100, r.global, ...view.model.sections.map(s => r.sectionScores[s.id])]) };
  return out;
}

// Type d'une cellule : celui de sa colonne, ou celui de sa ligne pour les tables « indicateur / valeur »
export const cellType = (table, i, j) => (table.rowTypes && j === table.columns.length - 1 ? table.rowTypes[i] : table.columns[j].type);

// Une table en lignes de CSV : nombres avec la virgule décimale en français, pourcentages en « 12,5 »
export function csvRows(table, lang) {
  const fmt = (v, type) => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v !== 'number') return v;
    const x = type === 'pct' ? Math.round(v * 1000) / 10 : v;
    return lang === 'fr' ? String(x).replace('.', ',') : String(x);
  };
  const pctCol = table.columns.map(c => c.type === 'pct');
  return [table.columns.map((c, j) => (pctCol[j] ? `${c.label} (%)` : c.label)),
    ...table.rows.map((row, i) => row.map((v, j) => fmt(v, cellType(table, i, j))))];
}

// Toutes les données de l'écran pour un jeu de filtres (l'écran et les exports appellent la même fonction)
export function buildView(model, f, opts = {}) {
  const records = selectRecords(model, f);
  const secStats = sectionStats(records, model);
  const qStats = questionStats(records, model);
  const segBy = opts.segBy || 'org_size';
  const evoTo = opts.evoTo && opts.evoTo !== 'baseline' ? opts.evoTo : model.types.find(x => x !== 'baseline');
  return {
    model, filters: f, records, key: keyFigures(records, model, secStats), sections: secStats, questions: qStats,
    topFlop: topFlop(qStats), segBy, segments: segments(records, model, segBy),
    evoFrom: 'baseline', evoTo, evolution: model.types.length >= 2 && evoTo ? evolution(model, f, 'baseline', evoTo) : null,
    quality: quality(records, qStats), comments: comments(records, model, opts.comments || {}, opts.lang),
  };
}

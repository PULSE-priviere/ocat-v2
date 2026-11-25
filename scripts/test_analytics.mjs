// Test à la main de lib/analytics.js sur un petit jeu de données (aucune base, aucun réseau).
// Usage : node --import ./scripts/_esm_hooks.mjs scripts/test_analytics.mjs
import assert from 'node:assert/strict';
import * as A from '../lib/analytics.js';

const P = 'proj';
const sections = [
  { id: 's1', num: 1, idx: 1, name_fr: 'Gouvernance', kind: 'scored', project_id: null },
  { id: 's2', num: 2, idx: 2, name_fr: 'Finances', kind: 'scored', project_id: null },
  { id: 's3', num: 10, idx: 3, name_fr: 'Export (projet)', kind: 'scored', project_id: P },
  { id: 's4', num: 11, idx: 4, name_fr: 'Données libres', kind: 'data', project_id: P },
];
const Q = (id, section_id, extra = {}) => ({ id, section_id, code: id, format: 'scale', text_fr: `Question ${id}`, assessment_id: null, project_id: null, ...extra });
const questions = [
  Q('q11', 's1'), Q('q12', 's1'), Q('q21', 's2'), Q('q22', 's2'),
  Q('q31', 's3', { project_id: P }),                       // section propre au projet : notée, hors score global
  Q('q13', 's1', { project_id: P }),                       // question complémentaire (section commune) : non notée
  Q('qA', 's1', { assessment_id: 'a1' }),                  // question ajoutée à une évaluation : non notée
  Q('q41', 's4', { format: 'text', project_id: P }),       // section libre : non notée
];

const subjects = [], assessments = [], answers = [];
const org = (id, size, extra = {}) => subjects.push({ id, name: `Org ${id}`, org_size: size, country: 'MG', org_type: 'association', coach_id: 'c1', coach_name: 'Coach Un', facilitator: '', ...extra });
const ass = (id, subject_id, a = {}) => assessments.push({ id, subject_id, type: 'baseline', status: 'submitted', submitted_at: '2026-01-01', created_at: '2026-01-01', administration_mode: 'self', section_comments: {}, ...a });
const ans = (aid, map) => Object.entries(map).forEach(([q, v]) => { const [code, support = null] = Array.isArray(v) ? v : [v]; answers.push([aid, q, code, support]); });

org('o1', '1-5', { facilitator: 'Luhnyezi' });
ass('a1', 'o1', { administration_mode: 'guided', section_comments: { 1: 'Bon début de gouvernance', 2: '  ' } });
ans('a1', { q11: ['1', true], q12: ['2', false], q21: '3', q22: 'NA', q31: '1', q13: '3', qA: '1' });
ass('a1f', 'o1', { type: 'followup', submitted_at: '2026-06-01', created_at: '2026-06-01' });
ans('a1f', { q11: '3', q12: '3', q21: '3', q22: '3', q31: '3' });
org('o2', '1-5');
ass('a2', 'o2'); ans('a2', { q11: 'NA', q12: 'NA', q21: '2', q22: '2' });          // q31 sans réponse : complétude 80 %
org('o3', '6-20'); ass('a3', 'o3', { status: 'in_progress', submitted_at: null }); ans('a3', { q11: '3' });
org('o4', '6-20'); ass('a4', 'o4', { status: 'locked', submitted_at: null }); ans('a4', { q11: '3' });
org('o5', '6-20'); ass('a5', 'o5', { status: 'locked' }); ans('a5', { q11: '3', q12: '3', q21: '3', q22: '3', q31: '3' });
for (let i = 6; i <= 14; i++) { org(`o${i}`, '6-20'); ass(`a${i}`, `o${i}`); ans(`a${i}`, { q11: '2', q12: '2', q21: '2', q22: '2', q31: 'NA' }); }

const model = A.prepare({ sections, questions }, { subjects, assessments, answers });
const F = { type: 'baseline', inProgress: false };
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('OK ', name); };

ok('seules les questions notées comptent (pas complémentaire, ajoutée, libre)', () =>
  assert.deepEqual(model.questions.map(q => q.id), ['q11', 'q12', 'q21', 'q22', 'q31']));
ok('sections libres exclues', () => assert.deepEqual(model.sections.map(s => s.id), ['s1', 's2', 's3']));
ok('types présents', () => assert.deepEqual(model.types, ['baseline', 'followup']));

const v = A.buildView(model, F, { segBy: 'org_size' });
ok('périmètre par défaut : soumises + verrouillées après soumission', () => assert.equal(v.records.length, 12));
ok('« inclure en cours » ajoute en cours et verrouillées non soumises', () => assert.equal(A.selectRecords(model, { ...F, inProgress: true }).length, 14));

const r1 = v.records.find(r => r.subject.id === 'o1'), r2 = v.records.find(r => r.subject.id === 'o2');
ok('N/A = valeur manquante, jamais 0 (S2 de o1 = 3)', () => assert.equal(r1.sectionScores.s2, 3));
ok('score de section = moyenne des réponses notées (S1 de o1 = 1,5)', () => assert.equal(r1.sectionScores.s1, 1.5));
ok('global = moyenne des sections, hors section de projet (o1 = 2,25)', () => assert.equal(r1.global, 2.25));
ok('section entièrement N/A : pas de score, global sur les autres (o2 = 2)', () => { assert.equal(r2.sectionScores.s1, null); assert.equal(r2.global, 2); });
ok('complétude (o1 100 %, o2 80 %)', () => { assert.equal(r1.completion, 100); assert.equal(r2.completion, 80); });

const q11 = v.questions.find(q => q.question.id === 'q11'), q31 = v.questions.find(q => q.question.id === 'q31');
ok('répartition q11', () => assert.deepEqual(q11.counts, { NA: 1, '1': 1, '2': 9, '3': 1 }));
ok('lacune q11 = (1+9)/11', () => assert.equal(q11.gap, 10 / 11));
ok('q11 sous le seuil N/A (1/12)', () => assert.equal(q11.naAlert, false));
ok('q31 signalée (> 10 % de N/A)', () => assert.equal(q31.naAlert, true));
ok('q31 exclue du top et du flop', () => { const ids = [...v.topFlop.weak, ...v.topFlop.strong].map(q => q.question.id); assert.ok(!ids.includes('q31')); });
ok('demande d\'appui = 1 oui sur 2 renseignées', () => { assert.equal(v.key.supportRate, 0.5); assert.equal(v.key.supportKnown, 2); });
ok('chiffres clés', () => { assert.equal(v.key.n, 12); assert.equal(v.key.globalMedian, 2); });

const g15 = v.segments.rows.find(r => r.key === '1-5'), g620 = v.segments.rows.find(r => r.key === '6-20');
ok('groupe < 10 : indicatif, jamais exclu', () => { assert.equal(g15.n, 2); assert.equal(g15.small, true); });
ok('groupe de 10 : non indicatif', () => { assert.equal(g620.n, 10); assert.equal(g620.small, false); });
ok('par facilitateur : sans facilitateur seulement dans Ensemble', () => { const sg = A.segments(v.records, model, 'facilitator'); assert.deepEqual(sg.rows.map(r => r.key), ['Luhnyezi']); assert.equal(sg.total.n, 12); });
ok('ligne Ensemble et part de passation guidée', () => { assert.equal(v.segments.total.n, 12); assert.equal(v.segments.total.guidedShare, 1 / 12); });

ok('évolution : seules les organisations appariées', () => {
  assert.equal(v.evolution.n, 1);
  const s1 = v.evolution.sections.find(s => s.section.id === 's1');
  assert.deepEqual([s1.from, s1.to, s1.diff, s1.n], [1.5, 3, 1.5, 1]);
});
ok('filtre de profil (structure d\'accompagnement)', () => assert.equal(A.selectRecords(model, { ...F, facilitator: 'Luhnyezi' }).length, 1));
ok('filtre « non renseigné »', () => assert.equal(A.selectRecords(model, { ...F, facilitator: A.NONE }).length, 11));

ok('commentaires : vides ignorés, recherche sans accents', () => {
  assert.equal(v.comments.length, 1);
  assert.equal(A.comments(v.records, model, { query: 'debut' }).length, 1);
  assert.equal(A.comments(v.records, model, { query: 'finances' }).length, 0);
});
ok('qualité : organisations sous 80 % (avec les en-cours)', () => {
  const recs = A.selectRecords(model, { ...F, inProgress: true });
  const qq = A.quality(recs, A.questionStats(recs, model));
  assert.deepEqual(qq.lowOrgs.map(r => r.subject.id).sort(), ['o3', 'o4']);
  assert.equal(qq.bins.reduce((a, b) => a + b.n, 0), 14);
});
ok('statistiques de base', () => { assert.equal(A.median([1, 2, 3, 4]), 2.5); assert.equal(A.sd([2, 4, 4, 4, 5, 5, 7, 9]), 2.14); assert.equal(A.sd([2]), null); });
ok('tranches de score', () => { assert.equal(A.bandOf(1.49), 'b1'); assert.equal(A.bandOf(1.5), 'b2'); assert.equal(A.bandOf(2.5), 'b4'); assert.equal(A.bandOf(3), 'b4'); });

const t = (k, vars) => k;
const tabs = A.tables(v, { t, lang: 'fr', label: (k, val) => val || '—' });
ok('CSV : virgule décimale et pourcentages', () => {
  const rows = A.csvRows(tabs.questions, 'fr');
  const line = rows.find(r => r[0] === 'q11');
  assert.equal(line[4], '8,3');            // % N/A
  assert.equal(rows[0][4], 'analytics.col_na (%)');
});
ok('table Organisations : une ligne par organisation retenue', () => assert.equal(tabs.orgs.rows.length, 12));
console.log(`\n${n} vérifications réussies`);

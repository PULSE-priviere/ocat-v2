// Calculs partagés : progression (OSC) et scores (staff uniquement)
import appConfig from '../app.config';

export const SCALE_CODES = ['NA', '1', '2', '3'];
export const EVAL_KEY = { baseline: 'baseline', followup: 'followup', endline: 'endline' };
export const EVAL_ORDER = ['baseline', 'followup', 'endline'];

const answered = a => a && (a.code || (a.value_text && a.value_text.trim()));

// Seules les questions de la banque (format échelle) comptent pour la complétion et les scores
export const isBankScale = q => !q.assessment_id && q.format === 'scale';

export function sectionProgress(sections, questions, answersByQ) {
  return sections.map(s => {
    // Section libre (données) : toutes ses questions comptent pour l'avancement, sans être obligatoires ni notées
    const qs = questions.filter(q => q.section_id === s.id && (s.kind === 'data' ? !q.assessment_id : isBankScale(q)));
    const done = qs.filter(q => answered(answersByQ[q.id])).length;
    const status = done === 0 ? 'not_started' : done === qs.length ? 'complete' : 'in_progress';
    const counts = { NA: 0, '1': 0, '2': 0, '3': 0 };
    qs.forEach(q => { const c = answersByQ[q.id]?.code; if (counts[c] !== undefined) counts[c]++; });
    return { section: s, total: qs.length, done, status, counts };
  });
}

export function sectionScore(p) {
  if (appConfig.scoring.requireCompleteSection && p.status !== 'complete') return null;
  let sum = 0, n = 0;
  for (const c of ['1', '2', '3']) { sum += Number(c) * p.counts[c]; n += p.counts[c]; }
  if (!appConfig.scoring.excludeCodes.includes('NA')) n += p.counts.NA;
  return n ? Math.round((sum / n) * 100) / 100 : null;
}

export function globalScore(all) {
  const scoredOnly = all.filter(p => p.section.kind !== 'data');
  const progress = appConfig.scoring.globalIncludesProjectSections ? scoredOnly : scoredOnly.filter(p => !p.section.project_id);
  if (appConfig.scoring.global === 'mean_of_questions') {
    let sum = 0, n = 0;
    progress.forEach(p => ['1', '2', '3'].forEach(c => { sum += Number(c) * p.counts[c]; n += p.counts[c]; }));
    return n ? Math.round((sum / n) * 100) / 100 : null;
  }
  const s = progress.map(sectionScore).filter(v => v !== null);
  return s.length && s.length === progress.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 100) / 100 : null;
}

export function completion(all) {
  const progress = all.filter(p => p.section.kind !== 'data');
  const total = progress.reduce((a, p) => a + p.total, 0);
  const done = progress.reduce((a, p) => a + p.done, 0);
  return total ? Math.round((done / total) * 100) : 0;
}

// Tri des questions par réponse croissante : 1, 2, 3, puis N/A et sans réponse
const RANK = { '1': 0, '2': 1, '3': 2, NA: 3 };
export const byAnswer = answersByQ => (a, b) =>
  (RANK[answersByQ[a.id]?.code] ?? 4) - (RANK[answersByQ[b.id]?.code] ?? 4);

// F14 : propositions de départ (appui demandé d'abord, puis 1, puis 2)
export function proposals(questions, answersByQ) {
  const qs = questions.filter(isBankScale);
  const withSupport = qs.filter(q => ['1', '2'].includes(answersByQ[q.id]?.code) && answersByQ[q.id]?.support)
    .sort(byAnswer(answersByQ));
  const ones = qs.filter(q => answersByQ[q.id]?.code === '1' && !answersByQ[q.id]?.support);
  const twos = qs.filter(q => answersByQ[q.id]?.code === '2' && !answersByQ[q.id]?.support);
  return [...withSupport, ...ones, ...twos];
}

// Valeur provisoire d'une section (moyenne des réponses 1 à 3 données jusqu'ici) pour le graphique en direct de l'OSC
export function sectionLive(p) {
  let sum = 0, n = 0;
  for (const c of ['1', '2', '3']) { sum += Number(c) * p.counts[c]; n += p.counts[c]; }
  return n ? Math.round((sum / n) * 100) / 100 : null;
}

// Valeur affichée dans les graphiques de l'équipe : définitive si la section est complète, sinon provisoire
// (moyenne des réponses déjà données). Réglable avec scoring.showProvisional.
export function sectionDisplay(p) {
  const final = sectionScore(p);
  if (final !== null) return { value: final, provisional: false };
  if (!appConfig.scoring.showProvisional) return { value: null, provisional: false };
  const live = sectionLive(p);
  return { value: live, provisional: live !== null };
}

export function globalDisplay(progress) {
  const scoredOnly = progress.filter(p => p.section.kind !== 'data');
  const base = appConfig.scoring.globalIncludesProjectSections ? scoredOnly : scoredOnly.filter(p => !p.section.project_id);
  const incomplete = base.some(p => p.status !== 'complete');
  const g = globalScore(progress);
  if (g !== null) return { value: g, provisional: incomplete };
  if (!appConfig.scoring.showProvisional) return { value: null, provisional: false };
  const vals = base.map(p => sectionDisplay(p).value).filter(v => v !== null);
  return vals.length ? { value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100, provisional: true } : { value: null, provisional: false };
}

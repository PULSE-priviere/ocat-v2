// Données du plan prêtes à afficher (page, PDF, Word) : fonction pure
import { sectionProgress, sectionDisplay, globalDisplay, EVAL_KEY, EVAL_ORDER } from './scoring';
import { planRows } from './plan';
import appConfig from '../app.config';

export const SERIES_COLOR = { baseline: appConfig.colors.accent, followup: '#D9A441', endline: '#4E9A6C' };
const pickText = (row, field, lang) => (row && (row[`${field}_${lang}`] || row[`${field}_fr`])) || '';

export function fmtDate(iso, lang, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d) ? '' : d.toLocaleDateString(lang, opts);
}

// Une série par type d'évaluation (baseline, suivi, endline), clés normalisées ; valeurs provisoires incluses
export function buildSeries({ assessments, allAnswers, bank, t }) {
  const byKey = {};
  [...assessments].sort((a, b) => EVAL_ORDER.indexOf(a.type) - EVAL_ORDER.indexOf(b.type) || a.created_at.localeCompare(b.created_at)).forEach(a => {
    const pr = sectionProgress(bank.sections, bank.questions, allAnswers[a.id] || {});
    byKey[EVAL_KEY[a.type]] = { key: EVAL_KEY[a.type], label: t(`eval_short.${a.type}`), color: SERIES_COLOR[EVAL_KEY[a.type]], values: pr.map(x => sectionDisplay(x).value), provisional: pr.map(x => sectionDisplay(x).provisional) };
  });
  return Object.values(byKey).filter(s => s.values.some(v => v !== null));
}

export function buildPlanData({ lang, t, orgName, logoUrl, subjectName, projectName, coachName, assessment, assessments, allAnswers, bank, planItems, planStatus, today = new Date() }) {
  const answers = allAnswers[assessment.id] || {};
  const progress = sectionProgress(bank.sections, bank.questions, answers);
  const sections = progress.map(p => { const sd = sectionDisplay(p); return { idx: p.section.idx, name: pickText(p.section, 'name', lang), score: sd.value, provisional: sd.provisional, done: p.done, total: p.total }; });
  const gd = globalDisplay(progress);
  const series = buildSeries({ assessments, allAnswers, bank, t });
  const rows = planRows(bank.questions, answers, planItems).filter(r => r.kept).map((r, i) => ({
    n: i + 1, code: r.q.code || '', question: pickText(r.q, 'text', lang), answerCode: r.a.code || '',
    action: String(r.a.coach_action || '').trim(), owner: String(r.a.coach_owner || '').trim(), notes: String(r.a.coach_notes || '').trim(), due: r.due || '' }));
  return {
    meta: { org: subjectName, project: projectName, coach: coachName || '', evalLabel: t(`eval.${assessment.type}`), statusLabel: t(`plan.status_${planStatus || 'draft'}`),
      date: fmtDate(today.toISOString(), lang), appOrg: orgName, logoUrl: logoUrl || '' },
    sections, global: gd.value, globalProvisional: gd.provisional, hasProvisional: gd.provisional || sections.some(s => s.provisional), series, rows, today: today.toISOString().slice(0, 10),
  };
}

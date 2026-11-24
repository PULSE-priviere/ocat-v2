// Plan d'accompagnement : une ligne par question avec besoin d'accompagnement ou action définie en session.
// Notes, action, responsable et échéance viennent de la session.
import { proposals } from './scoring';

export const wanted = a => !!(a && (a.support || String(a.coach_action || '').trim() || String(a.coach_owner || '').trim()));

// Normalise une échéance « YYYY-MM-DD », « YYYY-MM-DD..YYYY-MM-DD » ou « YYYY-Qx » en ISO représentatif
const Q_START = { 1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01' };
export function dueStartISO(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const q = s.match(/^(\d{4})-Q([1-4])$/);
  if (q) return `${q[1]}-${Q_START[Number(q[2])]}`;
  const r = s.match(/^(\d{4}-\d{2}-\d{2})\.\.\d{4}-\d{2}-\d{2}$/);
  if (r) return r[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

// items : [{ questionId, due, kept }]
export function planRows(questions, answersByQ, items = []) {
  const byQ = Object.fromEntries((items || []).filter(i => i && i.questionId).map(i => [i.questionId, i]));
  // Priorité : d'abord l'ordre choisi dans la séance, puis les questions avec contenu non classées, puis les propositions
  const inOrder = (items || []).map(i => questions.find(q => q.id === i.questionId)).filter(Boolean);
  const seen = new Set(inOrder.map(q => q.id));
  const ordered = proposals(questions, answersByQ).filter(q => !seen.has(q.id));
  const rest = questions.filter(q => !seen.has(q.id) && !ordered.some(x => x.id === q.id));
  return [...inOrder, ...ordered, ...rest]
    .filter(q => wanted(answersByQ[q.id]))
    .map(q => ({ q, a: answersByQ[q.id] || {}, due: dueStartISO(byQ[q.id]?.due), dueRaw: byQ[q.id]?.due || '', kept: byQ[q.id]?.kept !== false }));
}

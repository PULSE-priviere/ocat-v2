// Plan d'accompagnement : une ligne par question avec besoin d'accompagnement ou action définie en session.
// Notes, action et responsable viennent de la session ; seules l'échéance et « dans le plan » se règlent ici.
import { proposals } from './scoring';

export const wanted = a => !!(a && (a.support || String(a.coach_action || '').trim() || String(a.coach_owner || '').trim()));

// items : [{ questionId, due, kept }]
export function planRows(questions, answersByQ, items = []) {
  const byQ = Object.fromEntries((items || []).filter(i => i && i.questionId).map(i => [i.questionId, i]));
  const ordered = proposals(questions, answersByQ);               // appui demandé d'abord, puis 1, puis 2
  const seen = new Set(ordered.map(q => q.id));
  const rest = questions.filter(q => !seen.has(q.id));
  return [...ordered, ...rest]
    .filter(q => wanted(answersByQ[q.id]))
    .map(q => ({ q, a: answersByQ[q.id] || {}, due: byQ[q.id]?.due || '', kept: byQ[q.id]?.kept !== false }));
}

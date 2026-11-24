// Plan d'accompagnement en Markdown (v1 sans IA).
// Pure : pas d'accès réseau. Les notes brutes des séances ne sortent jamais d'ici.
// statuses : [{ need_id, status, decided, next_step, open_points }]
// sessions : [{ id, session_date, status, needs_discussed: [need_id, …] }]  (status='done' pris en compte dans la synthèse)

const ORDER = ['covered', 'discussed', 'autonomy', 'todo', 'out_of_scope'];

const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;

const fmtDate = (iso, lang) => {
  if (!iso) return '';
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d) ? '' : d.toLocaleDateString(lang || 'fr', { day: 'numeric', month: 'long', year: 'numeric' });
};

export function buildPlanMarkdown({ subject, assessment, needs, statuses, sessions, lang } = {}) {
  const L = lang === 'en' ? 'en' : 'fr';
  const T = L === 'en'
    ? { title: 'Support plan', synth: 'Summary', journal: 'Session journal', decided: 'Decided', next: 'Next step', open: 'Still open',
        covered: 'needs covered', autonomy: 'in autonomy', todo: 'to work on', out: 'out of scope',
        sessions: 'Sessions', status: { covered: 'covered', discussed: 'discussed', autonomy: 'in autonomy', todo: 'to work on', out_of_scope: 'out of scope' } }
    : { title: "Plan d'accompagnement", synth: 'Synthèse', journal: 'Journal des séances', decided: 'Décidé', next: 'Prochaine étape', open: 'Reste ouvert',
        covered: 'besoins couverts', autonomy: 'en autonomie', todo: 'à traiter', out: 'hors accompagnement',
        sessions: 'Séances', status: { covered: 'couvert', discussed: 'abordé', autonomy: 'autonomie', todo: 'à traiter', out_of_scope: 'hors accompagnement' } };

  const orgName = subject?.name || '';
  const coachName = assessment?.coachName || '';
  const today = fmtDate(new Date().toISOString(), L);
  const byNeed = Object.fromEntries((statuses || []).map(s => [s.need_id, s]));
  const doneSessions = (sessions || []).filter(s => s.status === 'done');
  const target = assessment?.sessions_target || subject?.sessions_target || null;

  const count = k => (needs || []).filter(n => (byNeed[n.id]?.status || 'todo') === k).length;
  const nCovered = count('covered'), nAutonomy = count('autonomy'), nTodo = count('todo') + count('discussed'), nOut = count('out_of_scope');

  const out = [];
  out.push(`# ${T.title} — ${orgName}`.trim());
  if (coachName || today) out.push(`${[coachName, today].filter(Boolean).join(' · ')}`);
  out.push('');
  out.push(`## ${T.synth}`);
  out.push(`${nCovered} ${T.covered}, ${nAutonomy} ${T.autonomy}, ${nTodo} ${T.todo}, ${nOut} ${T.out}.`);
  if (target) out.push(`${T.sessions} : ${doneSessions.length} / ${target}`);
  else if (doneSessions.length) out.push(`${T.sessions} : ${doneSessions.length}`);
  out.push('');

  const ordered = [...(needs || [])].sort((a, b) => {
    const sa = byNeed[a.id]?.status || 'todo';
    const sb = byNeed[b.id]?.status || 'todo';
    return ORDER.indexOf(sa) - ORDER.indexOf(sb) || String(a.label).localeCompare(String(b.label));
  });

  ordered.forEach(n => {
    const s = byNeed[n.id] || {};
    const st = s.status || 'todo';
    out.push(`## ${n.label}  (${T.status[st]})`);
    if (nonEmpty(s.decided)) out.push(`${T.decided} : ${s.decided.trim()}`);
    if (nonEmpty(s.next_step)) out.push(`${T.next} : ${s.next_step.trim()}`);
    if (nonEmpty(s.open_points)) out.push(`${T.open} : ${s.open_points.trim()}`);
    out.push('');
  });

  if (doneSessions.length) {
    out.push(`## ${T.journal}`);
    doneSessions
      .slice()
      .sort((a, b) => String(a.session_date).localeCompare(String(b.session_date)))
      .forEach(s => {
        const labels = (s.needs_discussed || [])
          .map(nid => (needs || []).find(n => n.id === nid)?.label)
          .filter(Boolean).join(', ');
        out.push(`- ${fmtDate(s.session_date, L)}${labels ? ` : ${labels}` : ''}`);
      });
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

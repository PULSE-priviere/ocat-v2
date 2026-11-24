// Colonne gauche de l'écran de séance : sections thématiques + liste des questions « appui demandé ».
import { useMemo, useState } from 'react';
import { useI18n, pick } from '../../lib/i18n';

export default function SessionAgenda({ bank, answers, selectedId, onSelect }) {
  const { t, lang } = useI18n();

  // Questions avec appui demandé, regroupées par section
  const groups = useMemo(() => {
    const byS = new Map();
    const supportQs = (bank.questions || []).filter(q => answers[q.id]?.support);
    supportQs.forEach(q => {
      const s = (bank.sections || []).find(x => x.id === q.section_id);
      if (!s) return;
      if (!byS.has(s.id)) byS.set(s.id, { section: s, questions: [] });
      byS.get(s.id).questions.push(q);
    });
    return Array.from(byS.values()).sort((a, b) => a.section.idx - b.section.idx);
  }, [bank, answers]);

  const total = groups.reduce((n, g) => n + g.questions.length, 0);
  const [filter, setFilter] = useState('all');   // 'all' | <sectionId>
  const visible = filter === 'all' ? groups : groups.filter(g => g.section.id === filter);

  const touched = a => !!(String(a?.coach_notes || '').trim() || String(a?.coach_action || '').trim() || String(a?.coach_owner || '').trim());
  const doneCount = groups.reduce((n, g) => n + g.questions.filter(q => touched(answers[q.id])).length, 0);

  return (
    <aside className="sess-agenda">
      <header className="sess-agenda-head">
        <h3>{t('session.v1.agenda_title')}</h3>
        <span className="sess-count">{doneCount} / {total}</span>
      </header>

      {groups.length === 0 ? (
        <p className="muted small">{t('session.v1.empty_support')}</p>
      ) : (
        <>
          <div className="sess-sections" role="tablist" aria-label={t('session.v1.filter_section')}>
            <button type="button" role="tab" aria-selected={filter === 'all'} className={`sess-chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
              {t('session.v1.all_sections')} <span className="sess-chip-n">{total}</span>
            </button>
            {groups.map(g => (
              <button key={g.section.id} type="button" role="tab" aria-selected={filter === g.section.id}
                className={`sess-chip ${filter === g.section.id ? 'on' : ''}`} onClick={() => setFilter(g.section.id)}>
                {g.section.idx}. {pick(g.section, 'name', lang)} <span className="sess-chip-n">{g.questions.length}</span>
              </button>
            ))}
          </div>

          <ul className="sess-qlist">
            {visible.map(g => (
              <li key={g.section.id} className="sess-qgroup">
                {filter === 'all' ? <div className="sess-qgroup-head">{g.section.idx}. {pick(g.section, 'name', lang)}</div> : null}
                <ul>
                  {g.questions.map(q => {
                    const a = answers[q.id] || {};
                    const sel = selectedId === q.id;
                    const filled = touched(a);
                    return (
                      <li key={q.id}>
                        <button type="button" className={`sess-qitem ${sel ? 'on' : ''} ${filled ? 'filled' : ''}`} onClick={() => onSelect(q.id)}>
                          <span className="sess-qitem-dot" aria-hidden="true" />
                          {q.code ? <span className="q-code">{q.code}</span> : null}
                          <span className="sess-qitem-text">{pick(q, 'text', lang)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

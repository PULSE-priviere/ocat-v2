// Colonne gauche : dropdown de section + liste des questions « appui demandé »
// présentées comme des pills pastel (une couleur par section, façon Airtable).
import { useMemo, useState } from 'react';
import { useI18n, pick } from '../../lib/i18n';
import { sectionHue } from '../../lib/sectionColors';

export default function SessionAgenda({ bank, answers, selectedId, onSelect }) {
  const { t, lang } = useI18n();

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
  const [filter, setFilter] = useState('all');
  const visible = filter === 'all' ? groups : groups.filter(g => g.section.id === filter);
  const touched = a => !!(String(a?.coach_notes || '').trim() || String(a?.coach_action || '').trim() || String(a?.coach_owner || '').trim());
  const doneCount = groups.reduce((n, g) => n + g.questions.filter(q => touched(answers[q.id])).length, 0);

  const currentSwatch = filter === 'all' ? '#E6E1D8' : sectionHue(groups.find(g => g.section.id === filter)?.section.idx || 1).bg;

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
          <div className="sess-select">
            <label className="sess-select-label">{t('session.v1.filter_section')}</label>
            <div className="sess-select-wrap">
              <span className="sess-select-swatch" style={{ background: currentSwatch }} />
              <select value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="all">{t('session.v1.all_sections')} · {total}</option>
                {groups.map(g => (
                  <option key={g.section.id} value={g.section.id}>{g.section.idx}. {pick(g.section, 'name', lang)} · {g.questions.length}</option>
                ))}
              </select>
            </div>
          </div>

          <ul className="sess-qlist">
            {visible.map(g => {
              const hue = sectionHue(g.section.idx);
              return (
                <li key={g.section.id} className="sess-qgroup">
                  {filter === 'all' ? (
                    <div className="sess-qgroup-head" style={{ background: hue.bg, color: hue.fg }}>
                      <span className="sess-qgroup-idx">{g.section.idx}</span>
                      <span>{pick(g.section, 'name', lang)}</span>
                    </div>
                  ) : null}
                  <ul>
                    {g.questions.map(q => {
                      const a = answers[q.id] || {};
                      const sel = selectedId === q.id;
                      const filled = touched(a);
                      const style = { background: hue.bg, color: hue.fg };
                      return (
                        <li key={q.id}>
                          <button type="button"
                            className={`sess-pill ${sel ? 'on' : ''} ${filled ? 'filled' : ''}`}
                            style={style}
                            onClick={() => onSelect(q.id)}>
                            {filled ? <span className="sess-pill-tick" aria-hidden="true">●</span> : null}
                            {q.code ? <span className="sess-pill-code">{q.code}</span> : null}
                            <span className="sess-pill-text">{pick(q, 'text', lang)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </aside>
  );
}

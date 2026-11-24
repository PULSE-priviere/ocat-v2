// Colonne droite : lignes du plan, badge de section coloré, glisser-déposer pour réordonner.
import { useState } from 'react';
import { useI18n, pick } from '../../lib/i18n';
import { sectionHue } from '../../lib/sectionColors';
import { dueLabel } from './DuePicker';

export default function SessionRecap({ items, bank, answers, onReorder, onSelect, selectedId }) {
  const { t, lang } = useI18n();
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  if (!items || items.length === 0) {
    return (
      <aside className="sess-recap">
        <header className="sess-recap-head"><h3>{t('session.v1.recap_title')}</h3></header>
        <p className="muted small">{t('session.v1.recap_empty')}</p>
      </aside>
    );
  }

  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = items.slice();
    const [card] = next.splice(from, 1);
    next.splice(to, 0, card);
    onReorder(next);
  };

  const sectionOf = q => (bank.sections || []).find(s => s.id === q.section_id);

  return (
    <aside className="sess-recap">
      <header className="sess-recap-head">
        <h3>{t('session.v1.recap_title')}</h3>
        <span className="muted small">{t('session.v1.recap_count', { n: items.length })}</span>
      </header>
      <ol className="sess-recap-list">
        {items.map((it, i) => {
          const q = (bank.questions || []).find(x => x.id === it.questionId);
          if (!q) return null;
          const a = answers[q.id] || {};
          const s = sectionOf(q);
          const hue = s ? sectionHue(s.idx) : { bg: '#EEE', fg: '#333' };
          const firstLine = String(a.coach_action || a.coach_notes || '').split('\n').map(x => x.trim()).find(Boolean) || '';
          const sel = selectedId === q.id;
          const due = dueLabel(it.due, lang);
          return (
            <li key={it.questionId}
              className={`sess-recap-card ${sel ? 'on' : ''} ${dragIdx === i ? 'dragging' : ''} ${overIdx === i && dragIdx !== null ? 'drop-into' : ''}`}
              draggable
              onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch {} }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIdx(i); }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain') || dragIdx); if (!Number.isNaN(from)) move(from, i); setDragIdx(null); setOverIdx(null); }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}>
              <button type="button" className="sess-recap-body" onClick={() => onSelect(q.id)}>
                <div className="sess-recap-top">
                  <span className="sess-recap-grip" aria-hidden="true">⋮⋮</span>
                  <span className="sess-recap-n">{i + 1}</span>
                  {s ? <span className="sess-recap-badge" style={{ background: hue.bg, color: hue.fg }}>{s.idx}. {pick(s, 'name', lang)}</span> : null}
                </div>
                <p className="sess-recap-q">{q.code ? <span className="sess-recap-code">{q.code}</span> : null}{pick(q, 'text', lang)}</p>
                {firstLine ? <p className="sess-recap-first">{firstLine}</p> : null}
                {(a.coach_owner || due) ? (
                  <p className="sess-recap-meta">
                    {a.coach_owner ? <span>{a.coach_owner}</span> : null}
                    {due ? <span>{a.coach_owner ? ' · ' : ''}{due}</span> : null}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

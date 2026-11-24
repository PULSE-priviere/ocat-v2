// Colonne droite : récapitulatif de la séance = lignes du plan dans l'ordre choisi.
// Les flèches réordonnent ; l'ordre est persisté dans action_plans.items.
import { useI18n, pick } from '../../lib/i18n';

export default function SessionRecap({ items, bank, answers, onReorder, onSelect, selectedId }) {
  const { t, lang } = useI18n();

  if (!items || items.length === 0) {
    return (
      <aside className="sess-recap">
        <h3>{t('session.v1.recap_title')}</h3>
        <p className="muted small">{t('session.v1.recap_empty')}</p>
      </aside>
    );
  }

  const move = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    [next[idx], next[to]] = [next[to], next[idx]];
    onReorder(next);
  };

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
          const firstLine = String(a.coach_action || a.coach_notes || '').split('\n').map(s => s.trim()).find(Boolean) || '';
          const sel = selectedId === q.id;
          return (
            <li key={it.questionId} className={`sess-recap-card ${sel ? 'on' : ''}`}>
              <button type="button" className="sess-recap-body" onClick={() => onSelect(q.id)}>
                <div className="sess-recap-top">
                  <span className="sess-recap-n">{i + 1}</span>
                  {q.code ? <span className="q-code">{q.code}</span> : null}
                  <span className="sess-recap-q">{pick(q, 'text', lang)}</span>
                </div>
                {firstLine ? <p className="sess-recap-first">{firstLine}</p> : null}
                {a.coach_owner ? <p className="sess-recap-owner">· {a.coach_owner}</p> : null}
              </button>
              <div className="sess-recap-ctrl">
                <button type="button" aria-label={t('session.v1.up')} title={t('session.v1.up')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label={t('session.v1.down')} title={t('session.v1.down')} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

// Colonne gauche de l'écran de séance : rappel + besoins triés + sections à approfondir.
import { useMemo } from 'react';
import { useI18n } from '../../lib/i18n';

const STATUSES = ['todo', 'discussed', 'covered', 'autonomy', 'out_of_scope'];

export default function SessionAgenda({ needs, statuses, lastSession, deepenSections, answers, bank, onInsertMention, onSetStatus }) {
  const { t } = useI18n();
  const byNeed = Object.fromEntries((statuses || []).map(s => [s.need_id, s]));

  // Nb de réponses à 1 ou 2 par besoin + indicateur « appui demandé »
  const info = useMemo(() => {
    const m = {};
    (needs || []).forEach(n => { m[n.id] = { low: 0, support: false }; });
    Object.values(answers || {}).forEach(a => {
      if (!a) return;
      const low = ['1', '2'].includes(a.code);
      (a.needIds || []).forEach(nid => { if (!m[nid]) return; if (low) m[nid].low += 1; if (a.support) m[nid].support = true; });
    });
    return m;
  }, [needs, answers]);

  const statusOf = id => byNeed[id]?.status || 'todo';
  const score = n => {
    const s = statusOf(n.id);
    const sup = info[n.id]?.support ? 1 : 0;
    const open = (s === 'todo' || s === 'discussed');
    return [open ? 0 : 1, -sup, -(info[n.id]?.low || 0), n.label];
  };
  const sorted = [...(needs || [])].sort((a, b) => {
    const sa = score(a), sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] < sb[i] ? -1 : 1;
    return 0;
  });
  const mainOpen = sorted.filter(n => ['todo', 'discussed'].includes(statusOf(n.id)));
  const others = sorted.filter(n => !mainOpen.includes(n));
  const covered = others.filter(n => statusOf(n.id) === 'covered').length;
  const autonomy = others.filter(n => statusOf(n.id) === 'autonomy').length;
  const todoHidden = 0;

  const deepen = (deepenSections || [])
    .map(num => (bank?.sections || []).find(s => s.num === num))
    .filter(Boolean);

  const lastByNeed = Object.fromEntries((lastSession?.statuses || []).map(s => [s.need_id, s]));

  return (
    <aside className="sess-agenda">
      {lastSession ? (
        <section className="sess-last">
          <h3>{t('session.v1.last_title')}</h3>
          {Object.keys(lastByNeed).length === 0 ? <p className="muted small">{t('session.v1.last_empty')}</p> : null}
          {(needs || []).filter(n => lastByNeed[n.id]).map(n => {
            const s = lastByNeed[n.id];
            return (
              <div key={n.id} className="sess-last-card">
                <b>{n.label}</b>
                {s.decided ? <p><em>{t('session.v1.decided')} :</em> {s.decided}</p> : null}
                {s.open_points ? <p><em>{t('session.v1.open')} :</em> {s.open_points}</p> : null}
              </div>
            );
          })}
        </section>
      ) : null}

      <section>
        <h3>{t('session.v1.agenda_title')}</h3>
        <ul className="sess-need-list">
          {mainOpen.map(n => (
            <NeedRow key={n.id} need={n} status={statusOf(n.id)} info={info[n.id]} t={t}
              onInsert={() => onInsertMention(`@${n.label}`)} onSetStatus={s => onSetStatus(n.id, s)} />
          ))}
        </ul>
      </section>

      {deepen.length ? (
        <section>
          <h3>{t('session.v1.deepen_title')}</h3>
          <ul className="sess-need-list">
            {deepen.map(s => (
              <li key={s.id} className="sess-need deepen">
                <span className="tag">{t('session.v1.deepen_badge')}</span>
                {s.idx}. {s.name_fr || s.name_en}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {others.length ? (
        <details className="sess-others">
          <summary>{t('session.v1.others', { n: others.length, covered, autonomy, todo: todoHidden })}</summary>
          <ul className="sess-need-list">
            {others.map(n => (
              <NeedRow key={n.id} need={n} status={statusOf(n.id)} info={info[n.id]} t={t}
                onInsert={() => onInsertMention(`@${n.label}`)} onSetStatus={s => onSetStatus(n.id, s)} />
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}

function NeedRow({ need, status, info, t, onInsert, onSetStatus }) {
  return (
    <li className="sess-need">
      <button type="button" className="sess-need-label" onClick={onInsert}>{need.label}</button>
      <StatusDot status={status} onChange={onSetStatus} t={t} />
      {info ? (
        <div className="muted small">
          {info.low ? t('session.v1.ctx_low', { n: info.low }) : null}
          {info.low && info.support ? ' · ' : null}
          {info.support ? t('session.v1.ctx_support') : null}
        </div>
      ) : null}
    </li>
  );
}

function StatusDot({ status, onChange, t }) {
  return (
    <select className={`sess-status s-${status}`} value={status} onChange={e => onChange(e.target.value)} aria-label={t('session.v1.status')}>
      {STATUSES.map(s => <option key={s} value={s}>{t(`session.v1.st_${s}`)}</option>)}
    </select>
  );
}

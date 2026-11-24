// Colonne droite : récapitulatif de fin de séance. En v1, trois champs libres + statut par besoin abordé.
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';

const STATUSES = ['todo', 'discussed', 'covered', 'autonomy', 'out_of_scope'];

export default function SessionRecap({ discussedNeeds, statuses, onSave }) {
  const { t } = useI18n();
  const byNeed = Object.fromEntries((statuses || []).map(s => [s.need_id, s]));

  if (!discussedNeeds || discussedNeeds.length === 0) {
    return <aside className="sess-recap"><h3>{t('session.v1.recap_title')}</h3><p className="muted small">{t('session.v1.recap_empty')}</p></aside>;
  }

  return (
    <aside className="sess-recap">
      <h3>{t('session.v1.recap_title')}</h3>
      {discussedNeeds.map(n => <RecapCard key={n.id} need={n} status={byNeed[n.id] || {}} onSave={patch => onSave(n.id, patch)} />)}
    </aside>
  );
}

function RecapCard({ need, status, onSave }) {
  const { t } = useI18n();
  const [f, setF] = useState({ decided: status.decided || '', next_step: status.next_step || '', open_points: status.open_points || '', status: status.status || 'discussed' });
  useEffect(() => { setF({ decided: status.decided || '', next_step: status.next_step || '', open_points: status.open_points || '', status: status.status || 'discussed' }); }, [status.need_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = patch => { const next = { ...f, ...patch }; setF(next); onSave(patch); };
  const blur = k => () => { if ((status[k] || '') !== (f[k] || '')) onSave({ [k]: f[k] }); };

  return (
    <article className="sess-recap-card">
      <header>
        <b>{need.label}</b>
        <select value={f.status} onChange={e => commit({ status: e.target.value })} aria-label={t('session.v1.status')}>
          {STATUSES.map(s => <option key={s} value={s}>{t(`session.v1.st_${s}`)}</option>)}
        </select>
      </header>
      <label>{t('session.v1.decided')}
        <input value={f.decided} placeholder={t('session.v1.ph_decided')} onChange={e => setF({ ...f, decided: e.target.value })} onBlur={blur('decided')} />
      </label>
      <label>{t('session.v1.next')}
        <input value={f.next_step} placeholder={t('session.v1.ph_next')} onChange={e => setF({ ...f, next_step: e.target.value })} onBlur={blur('next_step')} />
      </label>
      <label>{t('session.v1.open')}
        <input value={f.open_points} placeholder={t('session.v1.ph_open')} onChange={e => setF({ ...f, open_points: e.target.value })} onBlur={blur('open_points')} />
      </label>
    </article>
  );
}

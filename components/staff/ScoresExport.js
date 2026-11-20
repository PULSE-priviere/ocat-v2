// Suivi-évaluation d'un projet : envoi vers Airtable (Organisations, Diagnostics, Accompagnement) ou export CSV
import { useI18n } from '../../lib/i18n';
import { useAirtableActions } from '../../lib/airtableActions';

export default function ScoresExport({ project }) {
  const { t } = useI18n();
  const { busy, msg, prog, setup, sync, csv } = useAirtableActions({ projectId: project.id }, `suivi-evaluation-${project.name}`);
  return (
    <section className="card mex">
      <h2>{t('mex.title')}</h2>
      <p className="muted small">{t('mex.intro')}</p>
      <div className="mex-actions">
        <button className="btn" disabled={!!busy} aria-busy={busy === 'setup'} onClick={setup}>{t('mex.setup')}</button>
        <button className="btn primary" disabled={!!busy} aria-busy={busy === 'sync'} onClick={sync}>{t('mex.sync')}</button>
        {prog ? <span className="muted small">{t('mex.progress', prog)}</span> : null}
      </div>
      <div className="mex-actions">
        {['organisations', 'diagnostics', 'accompagnement'].map(k => (
          <button key={k} className="btn small" disabled={!!busy} aria-busy={busy === `csv_${k}`} onClick={() => csv(k)}>{t(`mex.csv_${k}`)}</button>
        ))}
      </div>
      <p className="muted small">{t('mex.setup_hint')} {t('mex.sync_hint')} {t('mex.csv_hint')}</p>
      {msg ? <p className={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</p> : null}
    </section>
  );
}

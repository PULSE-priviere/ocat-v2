// Suivi-évaluation d'un projet : envoi vers Airtable ou export CSV (une table « Scores », ou trois tables selon le mode choisi par l'administrateur)
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { staffApi } from '../../lib/supabase';
import { useAirtableActions } from '../../lib/airtableActions';

export default function ScoresExport({ project }) {
  const { t } = useI18n();
  const [mode, setMode] = useState('simple');
  const { busy, msg, prog, setup, sync, csv } = useAirtableActions({ projectId: project.id }, `suivi-evaluation-${project.name}`);
  useEffect(() => { staffApi('scores_mode', { projectId: project.id }).then(r => setMode(r.mode)).catch(() => {}); }, [project.id]);
  const complet = mode === 'complet';
  return (
    <section className="card mex">
      <h2>{t('mex.title')}</h2>
      <p className="muted small">{t(complet ? 'mex.intro' : 'mex.intro_simple')}</p>
      <div className="mex-actions">
        <button className="btn" disabled={!!busy} aria-busy={busy === 'setup'} onClick={setup}>{t(complet ? 'mex.setup' : 'mex.setup_simple')}</button>
        <button className="btn primary" disabled={!!busy} aria-busy={busy === 'sync'} onClick={sync}>{t('mex.sync')}</button>
        {prog ? <span className="muted small">{t('mex.progress', prog)}</span> : null}
      </div>
      <div className="mex-actions">
        {(complet ? ['organisations', 'diagnostics', 'accompagnement'] : ['scores']).map(k => (
          <button key={k} className="btn small" disabled={!!busy} aria-busy={busy === `csv_${k}`} onClick={() => csv(k)}>{t(`mex.csv_${k}`)}</button>
        ))}
      </div>
      <p className="muted small">{t(complet ? 'mex.setup_hint' : 'mex.setup_hint_simple')} {t('mex.sync_hint')} {t('mex.csv_hint')}</p>
      {msg ? <p className={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</p> : null}
    </section>
  );
}

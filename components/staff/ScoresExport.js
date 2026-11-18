// Suivi-évaluation : export des scores (baseline, midline, endline) vers Airtable ou en CSV
import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { staffApi } from '../../lib/supabase';
import { downloadCsv } from '../../lib/csv';

export default function ScoresExport({ project }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);       // { kind: 'ok' | 'error', text }
  const [prog, setProg] = useState(null);

  const run = async (name, fn) => {
    setBusy(name); setMsg(null); setProg(null);
    try { await fn(); } catch (e) {
      setMsg({ kind: 'error', text: e.message === 'airtable_not_configured' ? t('mex.not_configured') : t('mex.error', { msg: e.detail || t(`errors.${e.message}`) }) });
    }
    setBusy('');
  };
  const setup = () => run('setup', async () => {
    const r = await staffApi('scores_setup', { projectId: project.id });
    setMsg({ kind: 'ok', text: t(r.exists ? 'mex.exists' : 'mex.done_setup') });
  });
  const sync = () => run('sync', async () => {
    let offset = 0, sent = 0;
    for (;;) {
      const r = await staffApi('scores_sync', { projectId: project.id, offset });
      sent += r.sent; setProg({ done: r.done, total: r.total });
      if (r.next == null) break;
      offset = r.next;
    }
    setMsg({ kind: 'ok', text: t('mex.done_sync', { n: sent }) });
  });
  const csv = () => run('csv', async () => {
    let offset = 0, all = [], fields = [];
    for (;;) {
      const r = await staffApi('scores_csv', { projectId: project.id, offset });
      fields = r.fields; all = all.concat(r.rows); setProg({ done: r.done, total: r.total });
      if (r.next == null) break;
      offset = r.next;
    }
    downloadCsv(`suivi-evaluation-${project.name}.csv`, [fields, ...all.map(row => fields.map(f => row[f] ?? ''))]);
  });

  return (
    <section className="card mex">
      <h2>{t('mex.title')}</h2>
      <p className="muted small">{t('mex.intro')}</p>
      <div className="mex-actions">
        <button className="btn info" disabled={!!busy} onClick={setup}>{t('mex.setup')}</button>
        <button className="btn ok" disabled={!!busy} onClick={sync}>{busy === 'sync' ? t('mex.running') : t('mex.sync')}</button>
        <button className="btn" disabled={!!busy} onClick={csv}>{busy === 'csv' ? t('mex.running') : t('mex.csv')}</button>
        {prog ? <span className="muted small">{t('mex.progress', prog)}</span> : null}
      </div>
      <p className="muted small">{t('mex.setup_hint')} {t('mex.sync_hint')} {t('mex.csv_hint')}</p>
      {msg ? <p className={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</p> : null}
    </section>
  );
}

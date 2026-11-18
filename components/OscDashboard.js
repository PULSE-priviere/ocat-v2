// Dashboard : informations de l'organisation + outils (point d'entrée) + graphiques en direct
import dynamic from 'next/dynamic';
import OrgInfoForm from './OrgInfoForm';
import { useI18n } from '../lib/i18n';
import { safeStr } from '../lib/safe';
import appConfig from '../app.config';

const OscCharts = dynamic(() => import('./OscCharts'), { ssr: false });

export default function OscDashboard({ data, progress, onStart, onReport, saveProfile, locked }) {
  const { t } = useI18n();
  const total = progress.reduce((a, p) => a + p.total, 0);
  const done = progress.reduce((a, p) => a + p.done, 0);
  const st = data.assessment.status;
  const cta = st !== 'in_progress' ? 'report' : done > 0 ? 'continue' : 'start';
  const rows = [
    { label: t('dashboard.project'), value: data.project.name },
    { label: t('dashboard.coach'), value: data.coach },
    { label: t('dashboard.evaluation'), value: t(`eval.${data.assessment.type}`) },
  ];
  return (
    <>
      <h1>{t('dashboard.title', { name: safeStr(data.subject.name) })}</h1>
      <p className="lead">{t('dashboard.subtitle')}</p>
      <div className="dash">
        <section className="card">
          <h2>{t('profile.title')}</h2>
          <OrgInfoForm value={data.subject} rows={rows} onSave={saveProfile} editable={!locked} />
        </section>
        <section className="card">
          <h2>{t('dashboard.tools')}</h2>
          <div className="tools">
            {appConfig.tools.map(key => key === 'ocat' ? (
              <article key={key} className="toolcard">
                <div className="toolhead"><h3>{t('tools.ocat.title')}</h3><span className="pill">{t(`eval.${data.assessment.type}`)}</span></div>
                <p className="muted small">{t('tools.ocat.desc')}</p>
                <span className="bar"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
                <p className="small muted">{t('dashboard.progress', { done, total })} · {t(`astatus.${st}`)}</p>
                <button className="btn primary" onClick={cta === 'report' ? onReport : onStart}>{t(`dashboard.${cta}`)}</button>
              </article>
            ) : null)}
          </div>
        </section>
        <section className="card span2">
          <h2>{t('dashboard.live_title')}</h2>
          <p className="muted small">{t('dashboard.live_hint')}</p>
          <OscCharts progress={progress} evalKey={data.assessment.type} />
        </section>
      </div>
    </>
  );
}

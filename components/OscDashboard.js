// Dashboard de l'OSC : accueil, outil de diagnostic (point d'entrée), informations de l'organisation, profil en direct
import dynamic from 'next/dynamic';
import OrgInfoForm from './OrgInfoForm';
import Icon from './Icon';
import { useI18n } from '../lib/i18n';
import { safeStr } from '../lib/safe';
import { sectionLive, sectionScore } from '../lib/scoring';
import appConfig from '../app.config';

const ProfileCharts = dynamic(() => import('./ProfileCharts'), { ssr: false });

export default function OscDashboard({ data, progress, onStart, onReport, saveProfile, locked }) {
  const { t } = useI18n();
  const scored = progress.filter(p => p.section.kind !== 'data');   // les sections libres sont facultatives
  const total = scored.reduce((a, p) => a + p.total, 0);
  const done = scored.reduce((a, p) => a + p.done, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const st = data.assessment.status;
  const cta = st !== 'in_progress' ? 'report' : done > 0 ? 'continue' : 'start';
  const go = cta === 'report' ? onReport : onStart;
  const type = data.assessment.type;
  // Profil de l'OSC : valeurs provisoires dès les premières réponses (aucun chiffre affiché)
  const series = [{ key: type, label: t(`eval_short.${type}`), color: appConfig.colors.accent,
    values: progress.map(p => (appConfig.oscView.liveBeforeComplete ? sectionLive(p) : sectionScore(p))), provisional: progress.map(p => p.status !== 'complete') }];
  const rows = [
    { label: t('dashboard.project'), value: data.project.name },
    { label: t('dashboard.coach'), value: data.coach },
    { label: t('dashboard.evaluation'), value: t(`eval.${type}`) },
  ];
  const first = safeStr(data.subject.contact_first_name);
  return (
    <>
      <section className="hero2">
        <div>
          <p className="eyebrow">{safeStr(data.project.name)} · {safeStr(data.subject.name)}</p>
          <h1 className="display">{first ? t('dashboard.hello', { name: first }) : t('dashboard.hello_anon')}<br /><span className="accent">{t('dashboard.hero_accent')}</span></h1>
        </div>
        <div className="hero2-side">
          <p className="lead">{t('dashboard.hero_text')}</p>
          <button className="btn primary big" onClick={go}>{t(`dashboard.${cta}`)} <Icon name="arrow" size={16} /></button>
        </div>
      </section>
      <div className="dash">
        {appConfig.tools.includes('ocat') ? (
          <section className="toolcard dark">
            <div className="toolhead"><h3>{t('tools.ocat.title')}</h3><span className="pill glass">{t(`eval.${type}`)}</span></div>
            <p className="tool-desc">{t('tools.ocat.desc', { n: scored.length })}</p>
            <div className="tool-big"><span className="v">{pct} %</span><span className="l">{t('dashboard.progress', { done, total })} · {t(`astatus.${st}`)}</span></div>
            <span className="bar"><span style={{ width: `${pct}%` }} /></span>
            <button className="btn white" onClick={go}>{t(`dashboard.${cta}`)}</button>
          </section>
        ) : null}
        <section className="card">
          <h2>{t('profile.title')}</h2>
          <OrgInfoForm value={data.subject} rows={rows} onSave={saveProfile} editable={!locked} countries={data.project.countries} orgTypes={data.project.org_types || []} />
        </section>
        <section className="card span2">
          <h2>{t('dashboard.live_title')}</h2>
          <p className="muted small">{t('dashboard.live_hint')}</p>
          <ProfileCharts progress={progress} series={series} />
        </section>
      </div>
    </>
  );
}

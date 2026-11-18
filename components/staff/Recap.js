// Récapitulatif : radar, scores par section, réponses triées (réservé à l'équipe)
import { useI18n, pick } from '../../lib/i18n';
import dynamic from 'next/dynamic';
import DataAnswers from './DataAnswers';
import { safeStr, safeNum } from '../../lib/safe';
import { sectionDisplay, globalDisplay, completion, byAnswer } from '../../lib/scoring';

const ProfileCharts = dynamic(() => import('../ProfileCharts'), { ssr: false });

export default function Recap({ bank, progress, answers, series, assessment, onStartSession, saveAnswer }) {
  const { t, lang } = useI18n();
  const scored = progress.filter(p => p.section.kind !== 'data');
  const dataSecs = bank.sections.filter(s => s.kind === 'data');
  const g = globalDisplay(progress);
  const anyProvisional = g.provisional || progress.some(p => sectionDisplay(p).provisional);
  const fmt = x => (safeNum(x.value) !== null ? <>{x.value.toFixed(2)}{x.provisional ? <span className="prov" title={t('sheet.provisional_note')}>*</span> : null}</> : '—');
  return (
    <>
      <section className="card">
        <h2>{t('recap.profile_title')}</h2>
        <p className="muted small">{t('recap.profile_hint')}</p>
        <ProfileCharts progress={progress} series={series} showNumbers />
      </section>
      <section className="card">
        <table className="table">
          <thead><tr><th>{t('report.section')}</th><th>{t('sheet.progress')}</th><th>{t('sheet.score')}</th></tr></thead>
          <tbody>
            {scored.map(p => (
              <tr key={p.section.id}><td>{p.section.idx}. {pick(p.section, 'name', lang)}</td><td>{p.done}/{p.total}</td><td>{fmt(sectionDisplay(p))}</td></tr>
            ))}
            <tr className="total"><td>{t('sheet.global')}</td><td>{completion(progress)} %</td><td>{fmt(g)}</td></tr>
          </tbody>
        </table>
        <p className="muted small">{t('sheet.score_rule')}{anyProvisional ? ` ${t('sheet.provisional_note')}` : ''}</p>
        <button className="btn primary" onClick={onStartSession}>{t('subject.start_session')} →</button>
      </section>
      {dataSecs.length ? <DataAnswers sections={dataSecs} questions={bank.questions} answers={answers} saveAnswer={saveAnswer} /> : null}
      {bank.sections.filter(s => s.kind !== 'data').map(s => (
        <details key={s.id} className="acc">
          <summary>{s.idx}. {pick(s, 'name', lang)}{assessment.section_deepen?.[s.num] ? <span className="tag">{t('session.deepen_badge')}</span> : null}</summary>
          <ul className="rlist">{bank.questions.filter(q => q.section_id === s.id).sort(byAnswer(answers)).map(q => (
            <li key={q.id}>
              <span className={`chip c${answers[q.id]?.code || 'none'}`}>{answers[q.id]?.code ? t(`answer.short_${answers[q.id].code}`) : t('report.no_answer')}</span>
              <span>{pick(q, 'text', lang)}{answers[q.id]?.support ? <em className="tag">{t('report.support_requested')}</em> : null}</span>
              {answers[q.id]?.coach_notes ? <p className="coachnote">{safeStr(answers[q.id].coach_notes)}</p> : null}
            </li>
          ))}</ul>
        </details>
      ))}
    </>
  );
}

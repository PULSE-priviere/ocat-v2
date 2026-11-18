// Récapitulatif : radar, scores par section, réponses triées (réservé à l'équipe)
import { useI18n, pick } from '../../lib/i18n';
import ScoreRadar from '../Radar';
import { safeStr, safeNum } from '../../lib/safe';
import { sectionDisplay, globalDisplay, completion, byAnswer } from '../../lib/scoring';

export default function Recap({ bank, progress, answers, radarData, series, assessment, onStartSession }) {
  const { t, lang } = useI18n();
  const g = globalDisplay(progress);
  const anyProvisional = g.provisional || progress.some(p => sectionDisplay(p).provisional);
  const fmt = x => (safeNum(x.value) !== null ? <>{x.value.toFixed(2)}{x.provisional ? <span className="prov" title={t('sheet.provisional_note')}>*</span> : null}</> : '—');
  return (
    <>
      <div className="two">
        <ScoreRadar data={radarData} series={series} />
        <div>
          <table className="table">
            <thead><tr><th>{t('report.section')}</th><th>{t('sheet.progress')}</th><th>{t('sheet.score')}</th></tr></thead>
            <tbody>
              {progress.map(p => (
                <tr key={p.section.id}><td>{p.section.idx}. {pick(p.section, 'name', lang)}</td><td>{p.done}/{p.total}</td><td>{fmt(sectionDisplay(p))}</td></tr>
              ))}
              <tr className="total"><td>{t('sheet.global')}</td><td>{completion(progress)} %</td><td>{fmt(g)}</td></tr>
            </tbody>
          </table>
          <p className="muted small">{t('sheet.score_rule')}{anyProvisional ? ` ${t('sheet.provisional_note')}` : ''}</p>
          <button className="btn primary" onClick={onStartSession}>{t('subject.start_session')} →</button>
        </div>
      </div>
      {bank.sections.map(s => (
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

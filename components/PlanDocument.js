// Document du plan d'accompagnement : bandeau, vue d'ensemble, calendrier, actions (utilisé pour l'écran, le PDF et les tests)
import { radarSvg, barsSvg, timelineSvg } from '../lib/planCharts';
import { fmtDate } from '../lib/planData';

export default function PlanDocument({ d, t, lang }) {
  const m = d.meta;
  const radar = radarSvg({ labels: d.sections.map(s => `S${s.idx}`), series: d.series, responsive: true });
  const bars = barsSvg({ items: d.sections.map(s => ({ label: `${s.idx}. ${s.name}`, value: s.score, provisional: s.provisional })), responsive: true });
  const cal = timelineSvg({ rows: d.rows.map(r => ({ n: r.n, label: r.action || r.question, due: r.due })), today: new Date(`${d.today}T12:00:00`), lang, labels: { today: t('planx.today') }, responsive: true });
  const undated = d.rows.filter(r => !r.due).length;
  return (
    <article className="pdoc">
      <header className="pdoc-head">
        <div className="pdoc-brand">{m.logoUrl ? <img src={m.logoUrl} alt="" /> : null}<span>{m.appOrg}</span></div>
        <p className="pdoc-kicker">{t('plan.title')}</p>
        <h1>{m.org}</h1>
        <p className="pdoc-meta">
          <span><em>{t('dashboard.project')}</em> {m.project}</span>
          <span className="pdoc-pill">{m.evalLabel}</span>
          <span>{m.statusLabel}</span>
          {m.coach ? <span><em>{t('planx.coach')}</em> {m.coach}</span> : null}
          <span>{m.date}</span>
        </p>
      </header>

      <section className="pdoc-sec">
        <h2>{t('planx.overview')}</h2>
        <table className="pdoc-cols"><tbody><tr>
          <td><h3>{t('planx.radar_title')}</h3>{radar.svg ? <div dangerouslySetInnerHTML={{ __html: radar.svg }} /> : <p className="pdoc-empty">{t('planx.no_data')}</p>}</td>
          <td><h3>{t('planx.scores_title')}</h3><div dangerouslySetInnerHTML={{ __html: bars.svg }} />
            <p className="pdoc-global"><span>{t('planx.global')}</span> <b>{d.global != null ? `${d.global.toFixed(2)}${d.globalProvisional ? '*' : ''}` : '—'}</b><small> / 3</small></p>
            {d.hasProvisional ? <p className="pdoc-note">{t('planx.provisional')}</p> : null}</td>
        </tr></tbody></table>
      </section>

      <section className="pdoc-sec">
        <h2>{t('planx.calendar_title')}</h2>
        {cal.svg ? <div className="pdoc-cal" dangerouslySetInnerHTML={{ __html: cal.svg }} /> : <p className="pdoc-empty">{t('planx.no_dates')}</p>}
        {cal.svg && undated ? <p className="pdoc-note">{t('planx.undated', { n: undated })}</p> : null}
      </section>

      <section className="pdoc-sec">
        <h2>{t('planx.actions_title')}</h2>
        {d.rows.length === 0 ? <p className="pdoc-empty">{t('plan.empty')}</p> : d.rows.map(r => (
          <div key={r.n} className={`pact c${r.answerCode || 'none'}`}>
            <div className="pact-n">{r.n}</div>
            <div className="pact-body">
              <p className="pact-q">{r.code ? <b>{r.code}</b> : null} {r.question}{r.answerCode ? <span className={`chip c${r.answerCode}`}>{t(`answer.short_${r.answerCode}`)}</span> : null}</p>
              <table className="pact-f"><tbody><tr>
                <td className="w-action"><span className="pact-l">{t('plan.action')}</span>{r.action || <i>—</i>}</td>
                <td><span className="pact-l">{t('plan.owner')}</span>{r.owner || <i>—</i>}</td>
                <td><span className="pact-l">{t('plan.due')}</span>{r.due ? <b>{fmtDate(r.due, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</b> : <i>—</i>}</td>
              </tr></tbody></table>
              {r.notes ? <p className="pact-notes"><span className="pact-l">{t('plan.notes')}</span>{r.notes}</p> : null}
            </div>
          </div>
        ))}
      </section>
      <footer className="pdoc-foot">{t('planx.generated', { date: m.date })} · {m.appOrg}</footer>
    </article>
  );
}

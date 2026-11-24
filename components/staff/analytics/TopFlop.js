// Bloc 4 : les pratiques les plus faibles et les plus fortes (questions à fort taux de N/A exclues)
import { Block, fmtScore, fmtPct, csvFile, bandColor } from './ui';
import { pick } from '../../../lib/i18n';
import { safeStr } from '../../../lib/safe';
import { CFG } from '../../../lib/analytics';

function List({ title, items, ctx }) {
  const { t, lang } = ctx;
  return (
    <div>
      <h3 className="atf-title">{title}</h3>
      {!items.length ? <p className="muted small">—</p> : (
        <div className="scroll"><table className="table">
          <thead><tr><th>#</th><th>{t('analytics.col_question')}</th><th className="right">{t('analytics.col_mean')}</th><th className="right">{t('analytics.col_gap')}</th><th className="right">{t('analytics.col_n')}</th></tr></thead>
          <tbody>{items.map((q, i) => (
            <tr key={q.question.id}>
              <td className="mono muted">{i + 1}</td>
              <td><span className="mono muted">{safeStr(q.question.code)}</span> {pick(q.question, 'text', lang)}</td>
              <td className="right"><span className="scoredot" style={{ background: bandColor(q.mean) }} /><b>{fmtScore(q.mean, lang)}</b></td>
              <td className="right">{fmtPct(q.gap, lang)}</td>
              <td className="right">{q.n13}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function TopFlop({ view, table, ctx }) {
  const { t, project, type } = ctx;
  return (
    <Block id="a-topflop" title={t('analytics.b4_title')} hint={t('analytics.b4_hint', { n: CFG.topN, pct: Math.round(CFG.naAlert * 100) })}
      table={table} csvName={csvFile(project, 'top-flop', type)}>
      <div className="atopflop">
        <List title={t('analytics.weak_title', { n: CFG.topN })} items={view.topFlop.weak} ctx={ctx} />
        <List title={t('analytics.strong_title', { n: CFG.topN })} items={view.topFlop.strong} ctx={ctx} />
      </div>
    </Block>
  );
}

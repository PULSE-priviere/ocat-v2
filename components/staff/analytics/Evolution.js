// Bloc 6 : évolution entre la baseline et le suivi (ou l'endline), sur les seules organisations présentes aux deux.
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Block, fmtScore, fmtDiff, csvFile } from './ui';
import { pick } from '../../../lib/i18n';
import appConfig from '../../../app.config';
import { CFG } from '../../../lib/analytics';

export default function Evolution({ view, table, ctx, onTo }) {
  const { t, lang, project } = ctx;
  const e = view.evolution;
  const targets = view.model.types.filter(k => k !== 'baseline');
  const data = e ? e.sections.map(s => ({ name: `S${s.section.idx}`, full: pick(s.section, 'name', lang), from: s.from, to: s.to })) : [];
  return (
    <Block id="a-evolution" title={t('analytics.b6_title')} hint={t('analytics.b6_hint')} table={table} csvName={csvFile(project, 'evolution', `baseline-${view.evoTo}`)}
      actions={(
        <label className="inline">{t('analytics.evo_compare')}
          <select value={view.evoTo || ''} onChange={ev => onTo(ev.target.value)}>
            {targets.map(k => <option key={k} value={k}>{t('eval.baseline')} → {t(`eval.${k}`)}</option>)}
          </select>
        </label>
      )}>
      {!e || !e.n ? <p className="empty-inline">{t('analytics.evo_empty')}</p> : (
        <>
          <p className="small"><b>{e.n}</b> {t('analytics.evo_paired')}{e.n < CFG.minGroup ? <span className="pill grey">{t('analytics.indicative')}</span> : null}</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="#EFEFEF" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#525252' }} />
              <YAxis domain={[1, 3]} ticks={[1, 1.5, 2, 2.5, 3]} tick={{ fontSize: 11, fill: '#707070' }} width={32} />
              <Tooltip formatter={v => fmtScore(v, lang)} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.full || ''}`} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="from" name={t('eval.baseline')} fill="#CBD2D9" isAnimationActive={false} />
              <Bar dataKey="to" name={t(`eval.${view.evoTo}`)} fill={appConfig.colors.accent} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <div className="scroll"><table className="table">
            <thead><tr><th>{t('analytics.col_section')}</th><th className="right">{t('eval.baseline')}</th><th className="right">{t(`eval.${view.evoTo}`)}</th><th className="right">{t('analytics.col_diff')}</th><th className="right">{t('analytics.col_paired')}</th></tr></thead>
            <tbody>
              {e.sections.map(s => (
                <tr key={s.section.id}>
                  <td>S{s.section.idx} {pick(s.section, 'name', lang)}</td>
                  <td className="right">{fmtScore(s.from, lang)}</td><td className="right">{fmtScore(s.to, lang)}</td>
                  <td className={`right ${s.diff > 0 ? 'up' : s.diff < 0 ? 'down' : ''}`}><b>{fmtDiff(s.diff, lang)}</b></td><td className="right">{s.n}</td>
                </tr>
              ))}
              <tr className="total">
                <td>{t('analytics.col_global')}</td>
                <td className="right">{fmtScore(e.global.from, lang)}</td><td className="right">{fmtScore(e.global.to, lang)}</td>
                <td className={`right ${e.global.diff > 0 ? 'up' : e.global.diff < 0 ? 'down' : ''}`}>{fmtDiff(e.global.diff, lang)}</td><td className="right">{e.global.n}</td>
              </tr>
            </tbody>
          </table></div>
        </>
      )}
    </Block>
  );
}

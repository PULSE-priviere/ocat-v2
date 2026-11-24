// Bloc 1 : chiffres clés
import { Block, fmtScore, fmtPct, csvFile } from './ui';
import { CFG } from '../../../lib/analytics';

export default function KeyFigures({ view, table, ctx }) {
  const { t, lang, project, type } = ctx;
  const k = view.key;
  const items = [
    { v: k.n, l: t('analytics.k_orgs') },
    { v: fmtScore(k.globalMean, lang), l: t('analytics.k_global_mean'), s: t('analytics.k_median', { v: fmtScore(k.globalMedian, lang) }) },
    { v: k.completion === null ? '—' : `${k.completion} %`, l: t('analytics.k_completion') },
    { v: fmtPct(k.supportRate, lang), l: t('analytics.k_support'), s: t('analytics.k_support_base', { n: k.supportKnown }) },
    { v: k.lowSections, l: t('analytics.k_low_sections_l', { v: fmtScore(CFG.lowSection, lang) }) },
  ];
  return (
    <Block id="a-key" title={t('analytics.b1_title')} table={table} csvName={csvFile(project, 'chiffres-cles', type)}>
      <div className="akpis">
        {items.map(x => (
          <div className="kpi" key={x.l}><span className="v">{x.v}</span><span className="l">{x.l}</span>{x.s ? <span className="l">{x.s}</span> : null}</div>
        ))}
      </div>
    </Block>
  );
}

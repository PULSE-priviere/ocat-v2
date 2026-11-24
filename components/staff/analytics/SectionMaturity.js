// Bloc 2 : maturité par section (moyennes 1 à 3) et répartition des organisations en 4 tranches.
// Clic sur une section : filtre le tableau des questions sur cette section.
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend, CartesianGrid } from 'recharts';
import { Block, fmtScore, bandColor, BAND_COLORS, csvFile } from './ui';
import { CFG } from '../../../lib/analytics';
import { pick } from '../../../lib/i18n';

export default function SectionMaturity({ view, table, ctx, sort, onSort, onPick }) {
  const { t, lang, project, type } = ctx;
  const rows = view.sections.map(s => ({
    id: s.section.id, name: `S${s.section.idx}`, full: pick(s.section, 'name', lang),
    mean: s.mean, median: s.median, sd: s.sd, n: s.n,
    ...Object.fromEntries(CFG.bands.map(b => [b.key, s.n ? (s.bands[b.key] / s.n) * 100 : 0])),
    counts: s.bands,
  }));
  if (sort === 'score') rows.sort((a, b) => (a.mean ?? 9) - (b.mean ?? 9));
  // Le CSV suit l'ordre affiché
  const shown = { ...table, rows: rows.map(r => table.rows[view.sections.findIndex(x => x.section.id === r.id)]) };
  const height = Math.max(220, rows.length * 34 + 40);
  const pickRow = d => d?.payload?.id && onPick(d.payload.id);

  const MeanTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="atip">
        <b>{d.name} · {d.full}</b>
        <span>{t('analytics.col_mean')} : {fmtScore(d.mean, lang)}</span>
        <span>{t('analytics.col_median')} : {fmtScore(d.median, lang)}</span>
        <span>{t('analytics.col_sd')} : {fmtScore(d.sd, lang)}</span>
        <span>{t('analytics.col_n')} : {d.n}</span>
      </div>
    );
  };
  const BandTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="atip">
        <b>{d.name} · {d.full}</b>
        {CFG.bands.map(b => <span key={b.key}>{t(`analytics.band_${b.key}`)} : {d.counts[b.key]}</span>)}
      </div>
    );
  };

  return (
    <Block id="a-sections" title={t('analytics.b2_title')} hint={t('analytics.b2_hint')} table={shown} csvName={csvFile(project, 'sections', type)}
      actions={(
        <div className="seg" role="group" aria-label={t('analytics.sort')}>
          {['order', 'score'].map(k => <button key={k} type="button" className={sort === k ? 'on' : ''} aria-pressed={sort === k} onClick={() => onSort(k)}>{t(`analytics.sort_${k}`)}</button>)}
        </div>
      )}>
      <div className="charts">
        <figure className="chartbox">
          <figcaption>{t('analytics.b2_means')}</figcaption>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 36, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#EFEFEF" />
              <XAxis type="number" domain={[1, 3]} ticks={[1, 1.5, 2, 2.5, 3]} tick={{ fontSize: 11, fill: '#707070' }} />
              <YAxis type="category" dataKey="name" width={36} tick={{ fontSize: 12, fill: '#525252' }} axisLine={false} tickLine={false} />
              <Tooltip content={<MeanTip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="mean" radius={[0, 4, 4, 0]} onClick={pickRow} cursor="pointer" isAnimationActive={false}
                label={{ position: 'right', fontSize: 11, fill: '#525252', formatter: v => fmtScore(v, lang) }}>
                {rows.map(r => <Cell key={r.id} fill={bandColor(r.mean)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </figure>
        <figure className="chartbox">
          <figcaption>{t('analytics.b2_bands')}</figcaption>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v} %`} tick={{ fontSize: 11, fill: '#707070' }} />
              <YAxis type="category" dataKey="name" width={36} tick={{ fontSize: 12, fill: '#525252' }} axisLine={false} tickLine={false} />
              <Tooltip content={<BandTip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              {CFG.bands.map(b => <Bar key={b.key} dataKey={b.key} stackId="b" name={t(`analytics.band_${b.key}`)} fill={BAND_COLORS[b.key]} onClick={pickRow} cursor="pointer" isAnimationActive={false} />)}
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </figure>
      </div>
    </Block>
  );
}

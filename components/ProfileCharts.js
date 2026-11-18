// Profil en direct : radar (surface pleine) + répartition des réponses + état des sections.
// Utilisé par l'OSC (sans chiffres), le coach, l'owner et l'administrateur (avec chiffres au survol).
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Legend, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { useI18n, pick } from '../lib/i18n';
import { filledShape } from './radarShape';
import appConfig from '../app.config';

const C = appConfig.colors;

// rows : [{ section: 'S1', baseline: 2.1, baseline_p: true, … }] ; series : [{ key, label, color }]
export function RadarView({ width, height, rows, series, showNumbers }) {
  const missing = new Set(rows.filter(r => !series.some(s => r[s.key] != null)).map(r => r.section));
  const Tick = ({ x, y, payload, textAnchor }) => (
    <text x={x} y={y} textAnchor={textAnchor} dy={4} fontSize={12} fontWeight={missing.has(payload.value) ? 400 : 700} fill={missing.has(payload.value) ? '#B5AEA3' : C.ink}>{payload.value}</text>
  );
  return (
    <RadarChart width={width} height={height} data={rows} outerRadius="68%">
      <PolarGrid stroke="#E3DED6" />
      <PolarAngleAxis dataKey="section" tick={Tick} />
      <PolarRadiusAxis domain={[0, 3]} tickCount={4} tick={showNumbers ? { fontSize: 9, fill: C.muted } : false} axisLine={false} />
      {series.map(s => (
        <Radar key={s.key} name={s.label} dataKey={s.key} stroke={s.color} fill={s.color} isAnimationActive={false} shape={filledShape({ dataKey: s.key, color: s.color })} />
      ))}
      {showNumbers ? <Tooltip formatter={v => (typeof v === 'number' ? v.toFixed(2) : v)} /> : null}
      {series.length > 1 ? <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /> : null}
    </RadarChart>
  );
}

export default function ProfileCharts({ progress, series, showNumbers = false }) {
  const { t, lang } = useI18n();
  const rows = progress.map((p, i) => {
    const row = { section: `S${p.section.idx}` };
    series.forEach(s => { row[s.key] = s.values[i] ?? null; row[`${s.key}_p`] = !!s.provisional?.[i]; });
    return row;
  });
  const filled = rows.filter(r => series.some(s => r[s.key] != null)).length;
  if (!filled) return <p className="empty-inline">{t('dashboard.live_empty')}</p>;
  const dist = progress.map(p => ({ section: `S${p.section.idx}`, c3: p.counts['3'], c2: p.counts['2'], c1: p.counts['1'], na: p.counts.NA }));
  const { radar, distribution } = appConfig.oscView;
  return (
    <div className="charts">
      {radar ? (
        <figure className="chartbox">
          <figcaption>{t('dashboard.radar_title')}</figcaption>
          <ResponsiveContainer width="100%" height={290}>
            <RadarView rows={rows} series={series} showNumbers={showNumbers} />
          </ResponsiveContainer>
          {filled < 3 ? <p className="muted small">{t('dashboard.fill_hint')}</p> : null}
        </figure>
      ) : null}
      {distribution ? (
        <figure className="chartbox">
          <figcaption>{t('dashboard.dist_title')}</figcaption>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={dist} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="section" width={34} tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} />
              <Bar dataKey="c3" stackId="a" name={t('answer.short_3')} fill={C.ok} />
              <Bar dataKey="c2" stackId="a" name={t('answer.short_2')} fill={C.warn} />
              <Bar dataKey="c1" stackId="a" name={t('answer.short_1')} fill={C.accent} />
              <Bar dataKey="na" stackId="a" name={t('answer.short_NA')} fill="#CBD2D9" />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </figure>
      ) : null}
      <ul className="seclegend">
        {progress.map(p => (
          <li key={p.section.id}><b>S{p.section.idx}</b> {pick(p.section, 'name', lang)}
            <span className={`dot ${p.status}`}>{t(`status.${p.status}`)}</span></li>
        ))}
      </ul>
    </div>
  );
}

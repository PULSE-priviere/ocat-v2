// Graphiques en direct pour l'OSC : aucun chiffre de score affiché. Chargé à la demande (recharts).
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
import { useI18n, pick } from '../lib/i18n';
import { sectionLive } from '../lib/scoring';
import appConfig from '../app.config';

export default function OscCharts({ progress, evalKey }) {
  const { t, lang } = useI18n();
  const c = appConfig.colors;
  const live = progress.map(p => ({ p, v: sectionLive(p) }));
  if (!live.some(x => x.v !== null)) return <p className="empty-inline">{t('dashboard.live_empty')}</p>;
  const { radar, distribution, liveBeforeComplete } = appConfig.oscView;
  // dataKey = clé normalisée du type d'évaluation (baseline, followup, endline)
  const radarData = live.map(({ p, v }) => ({ section: `S${p.section.idx}`, [evalKey]: liveBeforeComplete || p.status === 'complete' ? (v ?? 0) : 0 }));
  const dist = progress.map(p => ({ section: `S${p.section.idx}`, c3: p.counts['3'], c2: p.counts['2'], c1: p.counts['1'], na: p.counts.NA }));
  return (
    <div className="charts">
      {radar ? (
        <figure className="chartbox">
          <figcaption>{t('dashboard.radar_title')}</figcaption>
          <ResponsiveContainer width="100%" height={270}>
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke={c.line} />
              <PolarAngleAxis dataKey="section" tick={{ fontSize: 12, fill: c.muted }} />
              <PolarRadiusAxis domain={[0, 3]} tick={false} axisLine={false} />
              <Radar dataKey={evalKey} stroke={c.accent} fill={c.accent} fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </figure>
      ) : null}
      {distribution ? (
        <figure className="chartbox">
          <figcaption>{t('dashboard.dist_title')}</figcaption>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={dist} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="section" width={34} tick={{ fontSize: 12, fill: c.muted }} axisLine={false} tickLine={false} />
              <Bar dataKey="c3" stackId="a" name={t('answer.short_3')} fill={c.ok} />
              <Bar dataKey="c2" stackId="a" name={t('answer.short_2')} fill={c.warn} />
              <Bar dataKey="c1" stackId="a" name={t('answer.short_1')} fill={c.accent} />
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

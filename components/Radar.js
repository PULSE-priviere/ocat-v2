// Radar des scores par section ; dataKey = clés normalisées (baseline, followup, endline)
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip } from 'recharts';
import { useI18n } from '../lib/i18n';
import appConfig from '../app.config';

const COLORS = { baseline: appConfig.colors.accent, followup: appConfig.colors.warn, endline: appConfig.colors.ok };

// data : [{ section: 'S1', baseline: 2.1, followup: … }]; series : ['baseline', …]
export default function ScoreRadar({ data, series }) {
  const { t } = useI18n();
  const has = data.some(r => series.some(k => r[k] != null));
  if (!data.length || !series.length || !has) return <p className="empty-inline">{t('sheet.no_data')}</p>;
  return (
    <div className="radar">
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={appConfig.colors.line} />
          <PolarAngleAxis dataKey="section" tick={{ fontSize: 12, fill: appConfig.colors.muted }} />
          <PolarRadiusAxis domain={[0, 3]} tickCount={4} tick={{ fontSize: 10 }} />
          {series.map(k => (
            <Radar key={k} dataKey={k} name={t(`eval.${k}`)} stroke={COLORS[k]} fill={COLORS[k]} fillOpacity={0.15} />
          ))}
          <Tooltip />
          {series.length > 1 ? <Legend /> : null}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Bloc 5 : comparaison par segment. Carte de chaleur (une ligne par groupe + « Ensemble », une colonne par section).
// Groupes de moins de 10 organisations : grisés, mention « indicatif », jamais exclus.
import { Block, fmtScore, fmtPct, heatColor, csvFile } from './ui';
import { PROFILE_KEYS, CFG } from '../../../lib/analytics';
import { pick } from '../../../lib/i18n';

export default function SegmentHeatmap({ view, table, ctx, onBy }) {
  const { t, lang, label, project, type } = ctx;
  const by = view.segBy, seg = view.segments, sections = view.model.sections;
  const showGuided = ['facilitator', 'coach'].includes(by);
  const keys = PROFILE_KEYS.filter(k => k !== 'country' || view.model.options.country.length > 1);
  const cell = (v, r, title) => (
    <td className="hcell" style={{ background: heatColor(v) }} title={`${title} : ${fmtScore(v, lang)} (${t('analytics.col_n')} ${r.n})`}>{fmtScore(v, lang)}</td>
  );
  const row = (r, name, total) => (
    <tr key={r.key} className={`${r.small && !total ? 'small' : ''} ${total ? 'total' : ''}`}>
      <th scope="row">{name}{r.small && !total ? <span className="pill grey">{t('analytics.indicative')}</span> : null}</th>
      {sections.map(s => cell(r.sections[s.id], r, `S${s.idx} ${pick(s, 'name', lang)}`))}
      {cell(r.global, r, t('analytics.col_global'))}
      <td className="right">{r.n}</td>
    </tr>
  );
  return (
    <Block id="a-segments" title={t('analytics.b5_title')} hint={t('analytics.b5_hint', { n: CFG.minGroup })} table={table} csvName={csvFile(project, `segments-${by}`, type)}
      actions={(
        <label className="inline">{t('analytics.compare_by')}
          <select value={by} onChange={e => onBy(e.target.value)}>
            {keys.map(k => <option key={k} value={k}>{t(`analytics.by_${k}`)}</option>)}
          </select>
        </label>
      )}>
      <div className="scroll"><table className="table aheat">
        <thead><tr>
          <th>{t(`analytics.by_${by}`)}</th>
          {sections.map(s => <th key={s.id} className="center" title={pick(s, 'name', lang)}>S{s.idx}</th>)}
          <th className="center">{t('analytics.col_global')}</th>
          <th className="right">{t('analytics.col_n')}</th>
        </tr></thead>
        <tbody>
          {seg.rows.map(r => row(r, label(by, r.key), false))}
          {row(seg.total, t('analytics.all'), true)}
        </tbody>
      </table></div>
      {showGuided ? (
        <div className="aguided">
          <p className="small"><b>{t('analytics.guided_title')}</b> <span className="muted">{t('analytics.guided_hint')}</span></p>
          <ul>{seg.rows.map(r => (
            <li key={r.key}><span>{label(by, r.key)}</span>
              <span className="bar inline"><span style={{ width: `${(r.guidedShare || 0) * 100}%` }} /></span>
              <b>{fmtPct(r.guidedShare, lang)}</b></li>
          ))}</ul>
        </div>
      ) : null}
    </Block>
  );
}

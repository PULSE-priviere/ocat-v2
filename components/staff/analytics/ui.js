// Petits éléments partagés par les blocs d'Analytics : formats, couleurs de score, carte de bloc avec bouton CSV
import { downloadCsv, datedName } from '../../../lib/csv';
import { csvRows, CFG, bandOf } from '../../../lib/analytics';
import { useI18n } from '../../../lib/i18n';
import Icon from '../../Icon';

export const fmtScore = (v, lang) => (v === null || v === undefined ? '—' : v.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fmtPct = (v, lang, digits = 0) => (v === null || v === undefined ? '—' : `${(v * 100).toLocaleString(lang, { maximumFractionDigits: digits })} %`);
export const fmtDiff = (v, lang) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmtScore(v, lang)}`);

// Échelle rouge → ambre → vert (comme la répartition des réponses ailleurs dans l'application)
export const BAND_COLORS = { b1: '#D64545', b2: '#E2A33B', b3: '#8CC084', b4: '#3F9A63' };
export const CODE_COLORS = { '1': '#D64545', '2': '#E2A33B', '3': '#3F9A63', NA: '#CBD2D9' };
export const bandColor = v => (v === null || v === undefined ? '#CBD2D9' : BAND_COLORS[bandOf(v)]);
// Fond de cellule continu (carte de chaleur) : teintes claires pour que le texte reste lisible
const STOPS = [[1, [246, 201, 196]], [2, [251, 231, 189]], [3, [196, 230, 207]]];
export function heatColor(v) {
  if (v === null || v === undefined) return 'transparent';
  const x = Math.max(1, Math.min(3, v));
  const [a, b] = x <= 2 ? [STOPS[0], STOPS[1]] : [STOPS[1], STOPS[2]];
  const k = (x - a[0]) / (b[0] - a[0]);
  const c = a[1].map((ch, i) => Math.round(ch + (b[1][i] - ch) * k));
  return `rgb(${c.join(',')})`;
}

// Mini-barre empilée 1 / 2 / 3 (et N/A en gris)
export function Distribution({ counts, withNa = true }) {
  const keys = withNa ? ['1', '2', '3', 'NA'] : ['1', '2', '3'];
  const total = keys.reduce((a, k) => a + (counts[k] || 0), 0);
  if (!total) return <span className="muted">—</span>;
  return (
    <span className="distbar" title={keys.map(k => `${k}: ${counts[k] || 0}`).join(' · ')}>
      {keys.map(k => (counts[k] ? <span key={k} style={{ width: `${(counts[k] / total) * 100}%`, background: CODE_COLORS[k] }} /> : null))}
    </span>
  );
}

// Carte d'un bloc : titre, aide, actions (CSV), contenu
export function Block({ id, title, hint, table, csvName, actions, children }) {
  const { t, lang } = useI18n();
  return (
    <section className="card ablock" id={id}>
      <div className="toolbar ablock-head">
        <h2>{title}</h2>
        {actions}
        {table ? (
          <button type="button" className="btn small" onClick={() => downloadCsv(csvName, csvRows(table, lang))} title={t('analytics.csv_hint')}>
            <Icon name="download" size={14} />CSV
          </button>
        ) : null}
      </div>
      {hint ? <p className="muted small ahint">{hint}</p> : null}
      {children}
    </section>
  );
}

export const csvFile = (project, block, type) => datedName([project.name, block, type], 'csv');
export const minGroup = CFG.minGroup;

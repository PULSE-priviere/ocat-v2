// « Exporter tout (Excel) » : un classeur avec une feuille Méthodologie, une feuille par bloc et une feuille Organisations.
// Chargé seulement au clic (comme l'export Word) : exceljs n'alourdit pas l'application. Aucun e-mail ni jeton exporté.
import ExcelJS from 'exceljs';
import { cellType, CFG, PROFILE_KEYS, NONE } from '../../../lib/analytics';
import { downloadBlob } from '../../../lib/csv';
import appConfig from '../../../app.config';

const FMT = { pct: '0.0%', score: '0.00', num: '0.00', int: '0' };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F3F3' } };
// Colonnes de score : échelle de couleur rouge (1) → ambre (2) → vert (3)
const SCALE_RULE = {
  type: 'colorScale',
  cfvo: [{ type: 'num', value: 1 }, { type: 'num', value: 2 }, { type: 'num', value: 3 }],
  color: [{ argb: 'FFF6C9C4' }, { argb: 'FFFBE7BD' }, { argb: 'FFC4E6CF' }],
};
const colLetter = n => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const sheetName = (name, used) => {
  let base = String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Feuille', n = base, i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
};

function addTable(wb, used, table) {
  const ws = wb.addWorksheet(sheetName(table.name, used), { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(table.columns.map(c => c.label));
  table.rows.forEach(r => ws.addRow(r.map(v => (v === null || v === undefined ? '' : v))));
  const head = ws.getRow(1);
  head.font = { bold: true }; head.fill = HEAD_FILL; head.alignment = { vertical: 'middle', wrapText: true };
  table.rows.forEach((r, i) => r.forEach((v, j) => {
    const f = FMT[cellType(table, i, j)];
    if (f && typeof v === 'number') ws.getCell(i + 2, j + 1).numFmt = f;
  }));
  table.columns.forEach((c, j) => {
    const longest = Math.max(String(c.label).length, ...table.rows.map(r => String(r[j] ?? '').length));
    ws.getColumn(j + 1).width = Math.min(60, Math.max(8, longest + 2));
    if (c.type === 'score' && table.rows.length) {
      ws.addConditionalFormatting({ ref: `${colLetter(j + 1)}2:${colLetter(j + 1)}${table.rows.length + 1}`, rules: [{ ...SCALE_RULE, priority: 1 }] });
    }
    if (String(c.label).length > 0 && ['text'].includes(c.type) && longest > 60) ws.getColumn(j + 1).alignment = { wrapText: true, vertical: 'top' };
  });
  if (table.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } };
  return ws;
}

export async function exportWorkbook({ view, tabs, ctx, filters, filename }) {
  const { t, label, project } = ctx;
  const T = k => t(`analytics.${k}`);
  const wb = new ExcelJS.Workbook();
  wb.creator = appConfig.appName; wb.created = new Date();
  const used = new Set();

  // Méthodologie : périmètre, filtres actifs, règles de calcul, date
  const active = PROFILE_KEYS.filter(k => filters[k]).map(k => `${T(`f_${k}`)} : ${filters[k] === NONE ? T('none') : label(k, filters[k])}`);
  const m = addTable(wb, used, {
    name: T('sheet_method'), columns: [{ label: T('col_item') }, { label: T('col_value') }],
    rows: [
      [T('m_project'), project.name],
      [T('m_date'), new Date().toLocaleString(ctx.lang)],
      [T('f_type'), t(`eval.${filters.type}`)],
      [T('m_scope'), filters.inProgress ? T('m_scope_all') : T('m_scope_default')],
      [T('m_filters'), active.length ? active.join(' · ') : T('m_no_filter')],
      [T('k_orgs'), view.records.length],
      [T('m_rules'), ''],
      ...['r_scale', 'r_scored', 'r_section', 'r_global', 'r_stats', 'r_gap', 'r_support', 'r_na', 'r_group', 'r_evolution', 'r_completion']
        .map(k => ['', t(`analytics.${k}`, { pct: Math.round(CFG.naAlert * 100), n: CFG.minGroup })]),
    ],
  });
  m.getColumn(2).width = 110; m.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  m.autoFilter = undefined;

  ['key', 'sections', 'questions', 'topflop', 'segments', 'evolution', 'quality', 'comments', 'orgs']
    .filter(k => tabs[k]).forEach(k => addTable(wb, used, tabs[k]));

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

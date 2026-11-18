// Export Word (.docx) du plan : même contenu que le PDF. Chargé à la demande (bibliothèque docx).
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, BorderStyle, ImageRun, Footer, PageNumber, TableLayoutType, VerticalAlign } from 'docx';
import { fmtDate } from './planData';

const FONT = 'Calibri';
const INK = '27323D', MUTED = '6B7680', CORAL = 'D9694A', CORAL_FG = 'A8452B';
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: 'E6E2DB' };
const CHIP = { 1: ['FBE4E2', 'A02A22'], 2: ['FBF0D8', '85590A'], 3: ['E3F1E8', '23683F'], NA: ['EDEBE6', '454B52'] };

const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, size: o.size ?? 20, bold: o.bold, italics: o.italics, color: o.color ?? INK });
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 60, line: o.line }, border: o.border, keepNext: o.keepNext });
const heading = text => para(run(text, { size: 26, bold: true, color: CORAL_FG }), { before: 360, after: 140, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E6E2DB', space: 4 } } });
const cell = (children, o = {}) => new TableCell({
  children, width: { size: o.width, type: WidthType.DXA }, borders: o.borders ?? { top: THIN, bottom: THIN, left: NONE, right: NONE },
  shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
  margins: o.margins ?? { top: 80, bottom: 80, left: 100, right: 100 }, verticalAlign: o.v ?? VerticalAlign.TOP, columnSpan: o.span });
const img = (im, widthPx) => new ImageRun({ type: 'png', data: im.data, transformation: { width: widthPx, height: Math.round((widthPx * im.h) / im.w) }, altText: { title: 'graphique', description: 'graphique', name: 'graphique' } });

// images : { radar, bars, timeline } = { data (PNG), w, h } ; t : traduction ; lang : 'fr' | 'en'
export function buildPlanDocx({ d, t, lang, images }) {
  const W = 10106;                                           // largeur utile A4 (twips)
  const children = [];

  // Bandeau de titre
  const m = d.meta;
  children.push(new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W], layout: TableLayoutType.FIXED, borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FBE6DF' }, margins: { top: 260, bottom: 260, left: 320, right: 320 },
      borders: { top: NONE, bottom: NONE, right: NONE, left: { style: BorderStyle.SINGLE, size: 36, color: CORAL } },
      children: [
        para(run(`${m.appOrg}  ·  ${t('plan.title')}`.toUpperCase(), { size: 17, bold: true, color: CORAL_FG }), { after: 60 }),
        para(run(m.org, { size: 40, bold: true }), { after: 100 }),
        para([run(`${t('dashboard.project')} : `, { size: 19, color: MUTED }), run(m.project, { size: 19, bold: true }),
          run('   |   ', { size: 19, color: MUTED }), run(m.evalLabel, { size: 19, bold: true, color: CORAL_FG }),
          run('   |   ', { size: 19, color: MUTED }), run(m.statusLabel, { size: 19 })], { after: 40 }),
        para([m.coach ? run(`${t('planx.coach')} : ${m.coach}   |   `, { size: 19, color: MUTED }) : run('', {}), run(m.date, { size: 19, color: MUTED })], { after: 0 }),
      ] })] })],
  }));

  // Vue d'ensemble : radar + scores par section
  children.push(heading(t('planx.overview')));
  if (images.radar && images.bars) {
    const half = Math.floor(W / 2);
    children.push(new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: [half, W - half], layout: TableLayoutType.FIXED, borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
      rows: [new TableRow({ children: [
        cell([para(run(t('planx.radar_title'), { size: 19, bold: true }), { after: 80 }), para(img(images.radar, 300))], { width: half, borders: NO_BORDERS, margins: { top: 0, bottom: 0, left: 0, right: 120 } }),
        cell([para(run(t('planx.scores_title'), { size: 19, bold: true }), { after: 80 }), para(img(images.bars, 320)),
          para([run(`${t('planx.global')} : `, { size: 22, color: MUTED }), run(d.global != null ? `${d.global.toFixed(2)}${d.globalProvisional ? '*' : ''} / 3` : '—', { size: 26, bold: true, color: CORAL_FG })], { before: 120 }),
          ...(d.hasProvisional ? [para(run(t('planx.provisional'), { size: 16, italics: true, color: MUTED }))] : [])],
          { width: W - half, borders: NO_BORDERS, margins: { top: 0, bottom: 0, left: 120, right: 0 } }),
      ] })],
    }));
  } else children.push(para(run(t('planx.no_data'), { italics: true, color: MUTED })));

  // Calendrier
  children.push(heading(t('planx.calendar_title')));
  if (images.timeline) {
    children.push(para(img(images.timeline, 640), { after: 80 }));
    const undated = d.rows.filter(r => !r.due).length;
    if (undated) children.push(para(run(t('planx.undated', { n: undated }), { size: 18, italics: true, color: MUTED })));
  } else children.push(para(run(t('planx.no_dates'), { italics: true, color: MUTED })));

  // Actions
  children.push(heading(t('planx.actions_title')));
  const cw = [420, 3250, 1150, 2900, 1250, 1136];
  const head = (txt, i) => cell([para(run(txt, { size: 17, bold: true, color: '454B52' }), { after: 0 })], { width: cw[i], fill: 'EDEBE6', borders: { top: NONE, bottom: THIN, left: NONE, right: NONE } });
  const rows = [new TableRow({ tableHeader: true, children: ['#', t('plan.priority'), t('answer.label'), t('plan.action'), t('plan.owner'), t('plan.due')].map(head) })];
  d.rows.forEach((r, i) => {
    const fill = i % 2 ? 'FBFAF8' : undefined;
    const [bg, fg] = CHIP[r.answerCode] || CHIP.NA;
    rows.push(new TableRow({ cantSplit: true, children: [
      cell([para(run(String(r.n), { bold: true, color: CORAL_FG }), { after: 0 })], { width: cw[0], fill }),
      cell([para([r.code ? run(`${r.code}  `, { bold: true, color: CORAL_FG, size: 18 }) : run(''), run(r.question, { size: 18 })], { after: 0 })], { width: cw[1], fill }),
      cell([para(run(r.answerCode ? t(`answer.short_${r.answerCode}`) : '—', { size: 17, bold: true, color: fg }), { align: AlignmentType.CENTER, after: 0 })], { width: cw[2], fill: bg, v: VerticalAlign.CENTER }),
      cell([para(run(r.action || '—', { size: 18, color: r.action ? INK : MUTED }), { after: r.notes ? 40 : 0 }),
        ...(r.notes ? [para(run(r.notes, { size: 16, italics: true, color: MUTED }), { after: 0 })] : [])], { width: cw[3], fill }),
      cell([para(run(r.owner || '—', { size: 18, color: r.owner ? INK : MUTED }), { after: 0 })], { width: cw[4], fill }),
      cell([para(run(r.due ? fmtDate(r.due, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '—', { size: 18, bold: !!r.due, color: r.due ? INK : MUTED }), { after: 0 })], { width: cw[5], fill }),
    ] }));
  });
  children.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cw, layout: TableLayoutType.FIXED, borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE }, rows }));

  return new Document({
    creator: m.appOrg, title: `${t('plan.title')} - ${m.org}`,
    styles: { default: { document: { run: { font: FONT, size: 20, color: INK } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: `${t('planx.generated', { date: m.date })}  ·  ${m.appOrg}  ·  `, font: FONT, size: 16, color: MUTED }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }) ] })] }) },
      children,
    }],
  });
}

export const planDocxBlob = args => Packer.toBlob(buildPlanDocx(args));
export const planDocxBuffer = args => Packer.toBuffer(buildPlanDocx(args));
export const planFileName = (d, lang) => `${lang === 'en' ? 'Support-plan' : 'Plan-accompagnement'}-${String(d.meta.org).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}-${d.today}.docx`;

// Graphiques du plan en SVG (page, PDF et Word) : fonctions pures qui renvoient { svg, w, h }
import appConfig from '../app.config';

const C = appConfig.colors;
const FONT = 'Arial, Helvetica, sans-serif';
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const trunc = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };
const wrap = (inner, w, h, responsive) => ({
  w, h,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ${responsive ? 'style="width:100%;height:auto;display:block"' : `width="${w}" height="${h}"`} font-family="${FONT}">${inner}</svg>`,
});
const EMPTY = { svg: '', w: 0, h: 0 };

// Radar : labels = ['S1', …], series = [{ label, color, values: [score|null, …] }]
export function radarSvg({ labels, series, max = 3, size = 340, responsive = false }) {
  const n = labels.length;
  if (!n || !series.length) return EMPTY;
  const cx = size / 2, cy = size / 2 - 6, R = size / 2 - 52;
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; const r = (R * v) / max; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const poly = vals => vals.map((v, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
  let g = '';
  for (let k = max; k >= 1; k--) g += `<polygon points="${poly(labels.map(() => k))}" fill="${k % 2 ? '#FBFAF8' : '#F5F1EB'}" stroke="#E3DED6" stroke-width="1"/>`;
  labels.forEach((l, i) => {
    const [x, y] = pt(i, max), [lx, ly] = pt(i, max * 1.2);
    const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E3DED6" stroke-width="1"/>`;
    g += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-size="11" font-weight="700" fill="${C.ink}" text-anchor="${anchor}">${esc(l)}</text>`;
  });
  for (let k = 1; k <= max; k++) { const [x, y] = pt(0, k); g += `<text x="${(x + 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="8" fill="${C.muted}">${k}</text>`; }
  series.forEach(s => {
    const pts = s.values.map((v, i) => (v == null ? null : pt(i, v).map(x => x.toFixed(1)).join(','))).filter(Boolean);
    if (pts.length >= 3) g += `<polygon points="${pts.join(' ')}" fill="${s.color}" fill-opacity="0.22" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    else if (pts.length === 2) g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    s.values.forEach((v, i) => {
      if (v == null) return;
      const [x, y] = pt(i, v), prov = s.provisional?.[i];   // repère creux = valeur provisoire
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${prov ? '#FFFFFF' : s.color}" stroke="${s.color}" stroke-width="${prov ? 1.6 : 0}"/>`;
    });
  });
  const widths = series.map(s => 30 + Math.min(String(s.label).length, 20) * 6);
  let lx = (size - widths.reduce((a, b) => a + b, 0)) / 2;
  series.forEach((s, i) => {
    g += `<rect x="${lx.toFixed(1)}" y="${size - 2}" width="10" height="10" rx="3" fill="${s.color}"/><text x="${(lx + 15).toFixed(1)}" y="${size + 7}" font-size="10" fill="${C.ink}">${esc(trunc(s.label, 20))}</text>`;
    lx += widths[i];
  });
  return wrap(g, size, size + 20, responsive);
}

// Barres horizontales : items = [{ label, value|null }]
export function barsSvg({ items, max = 3, width = 340, responsive = false }) {
  if (!items.length) return EMPTY;
  const rowH = 28, labelW = 176, valW = 34, bw = width - labelW - valW - 6;
  let g = '';
  items.forEach((it, i) => {
    const y = i * rowH + 4;
    g += `<text x="0" y="${y + 13}" font-size="10.5" fill="${C.ink}">${esc(trunc(it.label, 31))}</text>`;
    g += `<rect x="${labelW}" y="${y + 3}" width="${bw}" height="11" rx="5.5" fill="#EFEBE4"/>`;
    if (it.value != null) {
      g += `<rect x="${labelW}" y="${y + 3}" width="${Math.max(8, (bw * it.value) / max).toFixed(1)}" height="11" rx="5.5" fill="#E79F8B" fill-opacity="${it.provisional ? 0.5 : 1}"/>`;
      g += `<text x="${labelW + bw + 8}" y="${y + 13}" font-size="11" font-weight="700" fill="${C.ink}">${it.value.toFixed(2)}${it.provisional ? '*' : ''}</text>`;
    } else g += `<text x="${labelW + bw + 8}" y="${y + 13}" font-size="11" fill="${C.muted}">—</text>`;
  });
  return wrap(g, width, items.length * rowH + 8, responsive);
}

// Calendrier des échéances : une ligne par action datée, axe en mois, repère « aujourd'hui »
// rows = [{ n, label, due: 'AAAA-MM-JJ' }]
export function timelineSvg({ rows, today = new Date(), width = 680, lang = 'fr', labels = {}, responsive = false }) {
  const dated = rows.filter(r => r.due).map(r => ({ ...r, t: new Date(`${r.due}T12:00:00`) })).filter(r => !isNaN(r.t)).sort((a, b) => a.t - b.t);
  if (!dated.length) return EMPTY;
  const first = new Date(Math.min(new Date(today.getFullYear(), today.getMonth(), 1), dated[0].t));
  const start = new Date(first.getFullYear(), first.getMonth(), 1);
  const last = dated[dated.length - 1].t;
  let end = new Date(last.getFullYear(), last.getMonth() + 1, 1);
  const minEnd = new Date(start.getFullYear(), start.getMonth() + 3, 1);
  if (end < minEnd) end = minEnd;
  const months = [];
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  const labelW = 236, x0 = labelW + 8, cw = width - x0 - 12, headH = 40, rowH = 30;
  const X = d => x0 + ((d - start) / (end - start)) * cw;
  const h = headH + dated.length * rowH + 10;
  const monthName = d => d.toLocaleDateString(lang, { month: 'short' }).replace('.', '');
  let g = '';
  months.forEach((m, i) => {
    const xa = X(m), xb = X(i + 1 < months.length ? months[i + 1] : end);
    g += `<rect x="${xa.toFixed(1)}" y="${headH - 6}" width="${(xb - xa).toFixed(1)}" height="${h - headH + 6}" fill="${i % 2 ? '#F5F1EB' : '#FBFAF8'}"/>`;
    const yy = (i === 0 || m.getMonth() === 0) ? ` ${String(m.getFullYear()).slice(2)}` : '';
    g += `<text x="${((xa + xb) / 2).toFixed(1)}" y="16" font-size="10.5" font-weight="700" fill="${C.ink}" text-anchor="middle">${esc(monthName(m) + yy)}</text>`;
  });
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const tx = X(now);
  g += `<line x1="${tx.toFixed(1)}" y1="${headH - 8}" x2="${tx.toFixed(1)}" y2="${h - 4}" stroke="#2C5A92" stroke-width="1.3" stroke-dasharray="4 3"/>`;
  g += `<rect x="${(tx - 31).toFixed(1)}" y="23" width="62" height="14" rx="4" fill="#E5EEF8"/><text x="${tx.toFixed(1)}" y="33.5" font-size="9" font-weight="700" fill="#2C5A92" text-anchor="middle">${esc(labels.today || 'Today')}</text>`;
  dated.forEach((r, i) => {
    const y = headH + i * rowH + rowH / 2, x = X(r.t);
    const late = r.t < now && r.due !== now.toISOString().slice(0, 10);
    const col = late ? '#A02A22' : '#D9694A';
    g += `<text x="0" y="${(y + 4).toFixed(1)}" font-size="10.5" fill="${C.ink}">${esc(`${r.n}. ${trunc(String(r.label || '').split('\n')[0], 40)}`)}</text>`;
    g += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#DDD6CB" stroke-width="1" stroke-dasharray="2 3"/>`;
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${col}"/>`;
    const dl = r.t.toLocaleDateString(lang, { day: 'numeric', month: 'short' }).replace('.', '');
    const right = x > width - 70;
    g += `<text x="${(right ? x - 10 : x + 10).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" font-size="9.5" fill="${C.muted}" text-anchor="${right ? 'end' : 'start'}">${esc(dl)}</text>`;
  });
  return wrap(g, width, h, responsive);
}

// Répartition des réponses par section (en place, partiel, non en place, N/A) : barres empilées avec les effectifs
// items = [{ label, c3, c2, c1, na, total }] ; labels = { c3, c2, c1, na }
export function distributionSvg({ items, width = 680, labels = {}, responsive = false }) {
  if (!items.length || !items.some(i => i.total)) return EMPTY;
  const rowH = 26, labelW = 236, x0 = labelW + 8, bw = width - x0 - 12;
  const COL = { c3: '#5BAA7A', c2: '#E2B04E', c1: '#E27A6E', na: '#CBD2D9' };
  const INK = { c3: '#FFFFFF', c2: '#5B4310', c1: '#FFFFFF', na: '#4A535C' };
  let g = '';
  items.forEach((it, i) => {
    const y = 4 + i * rowH;
    g += `<text x="0" y="${y + 14}" font-size="10.5" fill="${C.ink}">${esc(trunc(it.label, 42))}</text>`;
    g += `<clipPath id="dcp${i}"><rect x="${x0}" y="${y + 2}" width="${bw}" height="15" rx="7.5"/></clipPath>`;
    g += `<rect x="${x0}" y="${y + 2}" width="${bw}" height="15" rx="7.5" fill="#F0EEEA"/>`;
    if (it.total) {
      let x = x0; g += `<g clip-path="url(#dcp${i})">`;
      ['c3', 'c2', 'c1', 'na'].forEach(k => {
        const w = (bw * it[k]) / it.total;
        if (w > 0) {
          g += `<rect x="${x.toFixed(1)}" y="${y + 2}" width="${w.toFixed(1)}" height="15" fill="${COL[k]}"/>`;
          if (w >= 15) g += `<text x="${(x + w / 2).toFixed(1)}" y="${y + 13}" font-size="9.5" font-weight="700" fill="${INK[k]}" text-anchor="middle">${it[k]}</text>`;
        }
        x += w;
      });
      g += '</g>';
    }
  });
  const ly = items.length * rowH + 16;
  let lx = x0;
  ['c3', 'c2', 'c1', 'na'].forEach(k => {
    const txt = labels[k] || k;
    g += `<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="3" fill="${COL[k]}"/><text x="${lx + 15}" y="${ly}" font-size="10" fill="${C.ink}">${esc(txt)}</text>`;
    lx += 30 + String(txt).length * 5.6;
  });
  return wrap(g, width, ly + 12, responsive);
}

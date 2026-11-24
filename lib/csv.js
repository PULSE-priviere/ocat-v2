// Export CSV côté navigateur : UTF-8 avec BOM, séparateur « ; » (ouverture directe dans Excel en français)
export function downloadCsv(filename, rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map(r => r.map(esc).join(';')).join('\n');
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

export function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Morceau de nom de fichier sûr : sans accents, espaces ni caractères spéciaux
export const fileSlug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
// <partie1>_<partie2>_…_<AAAA-MM-JJ>.<ext> (date du jour, heure locale)
export const datedName = (parts, ext) => `${parts.filter(Boolean).map(fileSlug).join('_')}_${new Date().toLocaleDateString('sv-SE')}.${ext}`;

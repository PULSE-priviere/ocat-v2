// Export CSV côté navigateur
export function downloadCsv(filename, rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '\ufeff' + rows.map(r => r.map(esc).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

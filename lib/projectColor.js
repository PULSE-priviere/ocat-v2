// Couleur d'un projet : une teinte distincte selon son rang dans la liste (pastilles du menu et des cartes)
const PALETTE = ['#E0533D', '#3B4FE0', '#0E9F6E', '#7B3FE4', '#E2A33B', '#0EA5B7', '#D9467A', '#475569'];
export function projectColor(projects, id) {
  const i = (projects || []).findIndex(p => p.id === id);
  if (i >= 0) return PALETTE[i % PALETTE.length];
  return PALETTE[[...String(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
}
export const initials = name => String(name || '?').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

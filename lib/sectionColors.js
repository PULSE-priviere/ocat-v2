// Palette pastel pour marquer visuellement les sections (façon Airtable).
// Une couleur par section, répétée au-delà de la palette.
const PALETTE = [
  { bg: '#FBE8E2', fg: '#8B3A26' },   // coral
  { bg: '#DCEAF6', fg: '#2F5679' },   // sky
  { bg: '#E6E0F6', fg: '#4A3978' },   // lavender
  { bg: '#D9EBDB', fg: '#2F6A3E' },   // mint
  { bg: '#F7ECD3', fg: '#7A5A14' },   // butter
  { bg: '#F3E3E6', fg: '#784853' },   // rose
  { bg: '#D6EBE8', fg: '#2F6560' },   // cyan
  { bg: '#EBE3D3', fg: '#5F4E22' },   // sand
  { bg: '#E6E6F0', fg: '#454668' },   // slate
];
export const sectionHue = idx => PALETTE[((Number(idx) || 1) - 1) % PALETTE.length];

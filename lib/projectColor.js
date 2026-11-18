// Couleur d'un projet : un dégradé stable choisi à partir de son identifiant (touches de couleur des cartes)
const GRADIENTS = [
  ['#E8505B', '#F59E4C'],   // corail → orange (PULSE)
  ['#151B30', '#2C3762'],   // nuit
  ['#3B4FE0', '#7280F2'],   // bleu
  ['#0E7C66', '#3CB48C'],   // vert
  ['#7B3FE4', '#C06BF0'],   // violet
];
const pick = id => GRADIENTS[[...String(id || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
export const projectGradient = id => { const [a, b] = pick(id); return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`; };
export const projectColor = id => pick(id)[0];
export const initials = name => String(name || '?').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

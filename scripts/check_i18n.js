// Vérifie que FR et EN ont exactement les mêmes clés
const fr = require('../locales/fr.json'), en = require('../locales/en.json');
const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
const a = new Set(keys(fr)), b = new Set(keys(en));
const missEn = [...a].filter(k => !b.has(k)), missFr = [...b].filter(k => !a.has(k));
if (missEn.length || missFr.length) { console.error('Manque en EN :', missEn, '\nManque en FR :', missFr); process.exit(1); }
console.log(`OK : ${a.size} clés dans chaque langue`);

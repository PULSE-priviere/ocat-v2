// Construit data/ocat_osc.json depuis l'ancien config.js (FR+EN) et le contrôle avec l'extraction Fillout.
// Usage : node scripts/build_bank.js chemin/config.js data/questions_fr.json data/ocat_osc.json
const fs = require('fs');
const [cfgPath, filloutPath, out] = process.argv.slice(2);
const src = fs.readFileSync(cfgPath, 'utf8');
const grab = name => JSON.parse(src.match(new RegExp(`export const ${name} = (.*?);\\n`, 's'))[1]);
const Q = grab('QUESTIONS'), FR = grab('SEC_NAMES'), EN = grab('SEC_NAMES_EN');
const F = filloutPath ? JSON.parse(fs.readFileSync(filloutPath, 'utf8')) : [];
const fill = Object.fromEntries(F.map(q => [q.code, q]));
const order = {};
const questions = Q.map(q => {
  const f = fill[q.id];
  if (F.length && !f) throw new Error(`Question ${q.id} absente de Fillout`);
  if (f && String(f.section) !== q.sec) throw new Error(`Section différente pour ${q.id}`);
  order[q.sec] = (order[q.sec] || 0) + 1;
  return { concept_id: `OCAT-OSC-${q.id}`, code: q.id, section: Number(q.sec), order: order[q.sec],
           text_fr: q.fr.trim(), text_en: (q.en || '').trim(), guide_fr: null, guide_en: null };
});
const bank = {
  framework: { key: 'ocat_osc', name: 'OCAT OSC', version: '1' },
  sections: Object.keys(FR).map(n => ({ num: Number(n), name_fr: FR[n], name_en: EN[n] })),
  questions,
};
fs.writeFileSync(out, JSON.stringify(bank, null, 1));
console.log(`${questions.length} questions, ${bank.sections.length} sections → ${out}`);

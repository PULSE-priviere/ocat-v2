// Charge la banque de questions depuis un fichier JSON et crée le premier administrateur.
// Usage : node scripts/seed.js [data/ocat_osc.json] [--admin email@exemple.org]
// Relançable : les questions sont mises à jour par concept_id, jamais dupliquées.
const fs = require('fs');
const db = require('./_env')();

async function main() {
  const args = process.argv.slice(2);
  const ai = args.indexOf('--admin');
  const adminEmail = ai >= 0 ? args[ai + 1] : null;
  const file = args.find((a, i) => !a.startsWith('--') && i !== ai + 1) || 'data/ocat_osc.json';
  const bank = JSON.parse(fs.readFileSync(file, 'utf8'));

  const { data: fw, error: e1 } = await db.from('frameworks')
    .upsert(bank.framework, { onConflict: 'key' }).select('id').single();
  if (e1) throw e1;

  const { data: secs, error: e2 } = await db.from('sections')
    .upsert(bank.sections.map(s => ({ ...s, framework_id: fw.id })), { onConflict: 'framework_id,num' }).select('id, num');
  if (e2) throw e2;
  const secId = Object.fromEntries(secs.map(s => [s.num, s.id]));

  const { data: existing } = await db.from('questions').select('id, concept_id').eq('framework_id', fw.id).is('assessment_id', null);
  const byConcept = Object.fromEntries((existing || []).map(q => [q.concept_id, q.id]));
  let created = 0, updated = 0;
  for (const q of bank.questions) {
    const row = { framework_id: fw.id, section_id: secId[q.section], concept_id: q.concept_id, code: q.code, ord: q.order,
      format: 'scale', text_fr: q.text_fr, text_en: q.text_en || '', active: true };
    // Les guides ne sont écrasés que s'ils sont fournis dans le fichier (sinon on garde l'édition faite dans Supabase)
    if (q.guide_fr) row.guide_fr = q.guide_fr;
    if (q.guide_en) row.guide_en = q.guide_en;
    const id = byConcept[q.concept_id];
    const { error } = id ? await db.from('questions').update(row).eq('id', id) : await db.from('questions').insert(row);
    if (error) throw error;
    id ? updated++ : created++;
  }
  console.log(`Banque « ${bank.framework.name} » : ${bank.sections.length} sections, ${created} questions créées, ${updated} mises à jour.`);

  if (adminEmail) {
    const email = adminEmail.toLowerCase();
    let { data: p } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
    if (!p) {
      const { data: u, error } = await db.auth.admin.createUser({ email, email_confirm: true });
      if (error) throw error;
      p = (await db.from('profiles').insert({ id: u.user.id, email, is_admin: true }).select('id').single()).data;
    } else await db.from('profiles').update({ is_admin: true }).eq('id', p.id);
    console.log(`Administrateur : ${email}. Connectez-vous via /login.`);
  }
}
main().catch(e => { console.error(e.message || e); process.exit(1); });

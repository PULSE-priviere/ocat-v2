// Fausses données pour les tests de bout en bout (jamais en production).
// Usage : node scripts/demo.js owner@exemple.org coach@exemple.org
// Crée un projet « Projet démo », un owner, un coach, 2 OSC (dont une à moitié remplie) et quelques besoins.
const crypto = require('crypto');
const db = require('./_env')();

async function user(email) {
  let { data: p } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (p) return p.id;
  const { data: u, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  await db.from('profiles').insert({ id: u.user.id, email, name: email.split('@')[0] });
  return u.user.id;
}

async function main() {
  const [ownerEmail, coachEmail] = process.argv.slice(2);
  if (!ownerEmail || !coachEmail) throw new Error('Usage : node scripts/demo.js owner@… coach@…');
  const { data: fw } = await db.from('frameworks').select('id').eq('key', 'ocat_osc').single();
  const { data: project } = await db.from('projects')
    .insert({ name: 'Projet démo', cohort: 'Test', framework_id: fw.id, offer_coach_choice: true }).select('*').single();
  const ownerId = await user(ownerEmail), coachId = await user(coachEmail);
  await db.from('memberships').insert([
    { user_id: ownerId, project_id: project.id, role: 'owner' },
    { user_id: coachId, project_id: project.id, role: 'coach' },
  ]);
  await db.from('needs').insert(['Gouvernance : rôles du conseil', 'Finances : comptabilité analytique', 'RH : fiches de poste']
    .map(label => ({ project_id: project.id, label })));
  const { data: qs } = await db.from('questions').select('id, section_id, sections(num)').eq('framework_id', fw.id).is('assessment_id', null);
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  for (const [i, name] of ['OSC Démo Alpha', 'OSC Démo Beta'].entries()) {
    const { data: s } = await db.from('subjects').insert({ project_id: project.id, name, email: `demo${i + 1}@example.org`, coach_id: coachId, origin: 'manual' }).select('id').single();
    const token = crypto.randomBytes(32).toString('base64url');
    const { data: a } = await db.from('assessments').insert({ subject_id: s.id, token_hash: crypto.createHash('sha256').update(token).digest('hex'),
      token_expires_at: new Date(Date.now() + 60 * 864e5).toISOString() }).select('id').single();
    // Alpha : sections 1 à 4 remplies ; Beta : tout rempli
    const rows = qs.filter(q => i === 1 || q.sections.num <= 4).map((q, k) => {
      const code = ['1', '2', '3', 'NA', '2', '1', '3'][k % 7];
      return { assessment_id: a.id, question_id: q.id, code, support: ['1', '2'].includes(code) ? k % 2 === 0 : null };
    });
    await db.from('answers').insert(rows);
    console.log(`${name} : ${appUrl}/a/${token}`);
  }
  console.log(`Lien public du projet : ${appUrl}/p/${project.public_slug}`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });

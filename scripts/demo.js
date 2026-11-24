// Fausses données pour les tests de bout en bout (jamais en production).
// Usage : node scripts/demo.js owner@exemple.org coach@exemple.org
// Crée un projet « Projet démo », un owner, un coach, 14 organisations (12 diagnostics soumis, 5 suivis) et quelques besoins.
// Nécessite les migrations jusqu'à 0017 (structure d'accompagnement, mode de passation).
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

  // 14 organisations aux profils variés (taille, structure d'accompagnement, mode de passation) pour l'onglet Analytics :
  // 12 diagnostics soumis (dont 5 avec une évaluation de suivi), Alpha à moitié rempli et Beta complet mais non soumis.
  const SIZES = ['1-5', '6-20', '21-50', '50+'], STRUCTS = ['Luhnyezi', 'Luhnyezi', 'Réseau Sud', null];
  const names = ['OSC Démo Alpha', 'OSC Démo Beta', ...Array.from({ length: 12 }, (_, i) => `OSC Démo ${String(i + 1).padStart(2, '0')}`)];
  const fill = (aid, rows, seed, shift = 0) => rows.map((q, k) => {
    const r = (k * 7 + seed * 13) % 10;
    const code = r === 0 ? 'NA' : String(Math.min(3, Math.max(1, (r < 4 ? 1 : r < 7 ? 2 : 3) + shift)));
    return { assessment_id: aid, question_id: q.id, code, support: ['1', '2'].includes(code) ? (k + seed) % 3 === 0 : null };
  });
  const newAssessment = async (subjectId, extra) => {
    const token = crypto.randomBytes(32).toString('base64url');
    const { data: a, error } = await db.from('assessments').insert({ subject_id: subjectId, token_hash: crypto.createHash('sha256').update(token).digest('hex'),
      token_expires_at: new Date(Date.now() + 60 * 864e5).toISOString(), ...extra }).select('id').single();
    if (error) throw error;
    return { id: a.id, token };
  };
  for (const [i, name] of names.entries()) {
    const { data: s, error } = await db.from('subjects').insert({ project_id: project.id, name, email: `demo${i + 1}@example.org`, coach_id: coachId, origin: 'manual',
      org_size: SIZES[i % 4], org_type: ['association', 'ngo', 'cooperative'][i % 3], support_org: STRUCTS[i % 4] }).select('id').single();
    if (error) throw new Error(`${error.message} (migration 0017 exécutée ?)`);
    const submitted = i >= 2;
    const a = await newAssessment(s.id, submitted
      ? { status: 'submitted', submitted_at: new Date().toISOString(), administration_mode: i % 3 === 0 ? 'guided' : 'self',
        section_comments: i % 4 === 0 ? { 1: 'Le conseil se réunit rarement.', 3: 'Pas encore de procédures écrites.' } : {} }
      : {});
    // Alpha : sections 1 à 4 remplies ; les autres : tout rempli
    await db.from('answers').insert(fill(a.id, qs.filter(q => i !== 0 || q.sections.num <= 4), i));
    if (submitted && i < 7) {                                   // 5 organisations ont aussi une évaluation de suivi, en progrès
      const f = await newAssessment(s.id, { type: 'followup', status: 'submitted', submitted_at: new Date().toISOString() });
      await db.from('answers').insert(fill(f.id, qs, i, 1));
    }
    console.log(`${name} : ${appUrl}/a/${a.token}`);
  }
  console.log(`Lien public du projet : ${appUrl}/p/${project.public_slug}`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });

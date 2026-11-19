// Test de fumée du parcours OSC par les routes API, sur une installation de TEST.
// Usage : node scripts/smoke_osc.js https://app.vercel.app <slug-du-lien-public>
// Crée une OSC fictive, répond à 2 sections, vérifie la reprise, termine, soumet.
// Turnstile doit être désactivé sur l'installation de test (TURNSTILE_SECRET_KEY vide).
const [base, slug] = process.argv.slice(2);
if (!base || !slug) { console.error('Usage : node scripts/smoke_osc.js <url> <slug>'); process.exit(1); }
const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'OK    ' : 'ÉCHEC '} ${label}`); if (!ok) failed++; };

(async () => {
  const email = `smoke-${Date.now()}@example.org`;
  const profile = { country: 'MA', orgType: 'ngo', orgSize: '6-20' };
  const e = await post('/api/public/enter', { slug, name: 'OSC test', firstName: 'Test', lastName: 'Osc', email, consent: true, ...profile });
  check('entrée par le lien public → dossier créé', e.json.status === 'created' && /\/a\//.test(e.json.url));
  const token = e.json.url.split('/a/')[1];

  const noConsent = await post('/api/public/enter', { slug, name: 'X', firstName: 'A', lastName: 'B', email: 'x' + email, ...profile });
  check('consentement obligatoire', noConsent.status === 400);

  const noNames = await post('/api/public/enter', { slug, name: 'X', email: 'y' + email, consent: true, ...profile });
  check('prénom et nom du contact obligatoires', noNames.status === 400);

  let d = (await post('/api/osc/load', { token })).json;
  check('nom et prénom du contact enregistrés', d.subject?.contact_first_name === 'Test' && d.subject?.contact_last_name === 'Osc');
  check('9 sections chargées', d.sections?.length === 9);
  const bank = d.questions.filter(q => !q.assessment_id && q.format === 'scale');
  check('124 questions chargées', bank.length === 124);
  check('aucun score envoyé à l\'OSC', !JSON.stringify(d).match(/"score\w*"\s*:/i));

  const bySec = n => bank.filter(q => q.section_id === d.sections.find(s => s.num === n).id);
  const codes = ['1', '2', '3', 'NA'];
  for (const n of [1, 2]) for (const [i, q] of bySec(n).entries())
    await post('/api/osc/save', { token, op: 'answer', questionId: q.id, code: codes[i % 4], support: i % 4 < 2 });
  await post('/api/osc/save', { token, op: 'comment', section: '1', text: 'Commentaire de test' });

  // « Coupure » : on recharge comme après une reconnexion
  d = (await post('/api/osc/load', { token })).json;
  const answered = d.answers.filter(a => a.code).length;
  check(`reprise : ${answered} réponses retrouvées (sections 1 et 2)`, answered === bySec(1).length + bySec(2).length);
  check('commentaire de section retrouvé', d.assessment.section_comments['1'] === 'Commentaire de test');
  const three = d.answers.find(a => a.code === '3');
  check('appui effacé pour une réponse 3', three && three.support === null);

  const pr = await post('/api/osc/save', { token, op: 'profile', patch: { country: 'MA', org_type: 'ngo', org_size: '6-20' } });
  check('fiche organisation (pays, type, taille) enregistrée', pr.json.ok === true);
  check('valeur hors liste refusée', (await post('/api/osc/save', { token, op: 'profile', patch: { country: 'mars' } })).status === 400);
  check('prénom vide refusé', (await post('/api/osc/save', { token, op: 'profile', patch: { contact_first_name: ' ' } })).status === 400);
  await post('/api/osc/save', { token, op: 'deepen', section: '1', value: true });
  await post('/api/osc/save', { token, op: 'deepen', section: '2', value: false });
  d = (await post('/api/osc/load', { token })).json;
  check('fiche organisation retrouvée au rechargement', d.subject.country === 'MA' && d.subject.org_type === 'ngo' && d.subject.org_size === '6-20');
  check('approfondissement par section retrouvé', d.assessment.section_deepen['1'] === true && d.assessment.section_deepen['2'] === false);
  check('type d\'évaluation transmis (baseline)', d.assessment.type === 'baseline');

  const early = await post('/api/osc/submit', { token });
  check('soumission refusée tant que tout n\'est pas complet', early.status === 400 && early.json.error === 'incomplete');

  for (let n = 3; n <= 9; n++) for (const q of bySec(n)) await post('/api/osc/save', { token, op: 'answer', questionId: q.id, code: '2', support: false });
  const sub = await post('/api/osc/submit', { token });
  check('soumission acceptée', sub.json.ok === true);
  d = (await post('/api/osc/load', { token })).json;
  check('statut « soumise »', d.assessment.status === 'submitted');

  const bad = await post('/api/osc/load', { token: 'x'.repeat(43) });
  check('jeton inconnu refusé', bad.status === 404);

  const again = await post('/api/public/enter', { slug, name: 'Un autre nom', firstName: 'A', lastName: 'B', email, consent: true, ...profile });
  check('même e-mail : aucun lien affiché, renvoi par e-mail', again.json.status === 'exists' && !again.json.url);
  const old = await post('/api/osc/load', { token });
  check('ancien lien remplacé après renvoi', old.status === 404);

  console.log(failed ? `\n${failed} échec(s)` : '\nTout est OK');
  process.exit(failed ? 1 : 0);
})();

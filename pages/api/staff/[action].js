// Actions staff qui exigent la clé service. Les droits sont toujours vérifiés avec le client RLS de l'appelant.
import { admin, fail, isEmail, staffFromReq, newToken, hashToken, tokenExpiry, personalUrl, rotateToken, appUrl } from '../../../lib/server';
import { sendInvitation } from '../../../lib/invite';
import { inBackground } from '../../../lib/background';
import { mailConfig, smtpConfig, sendMail } from '../../../lib/mail';
import { checkDns, FREE_MAIL } from '../../../lib/mailcheck';
import { airtableConfig, airtableReady, testAirtable, airtableCode, cleanToken, cleanBaseId, DEFAULT_TABLES, DEFAULT_SCORES_TABLE } from '../../../lib/scoresExport';
import { loadBank } from '../../../lib/bank';
import { buildData, syncAssessments, syncAssessmentsSafe, ensureTables, fieldNames, legacyRows, TABLE_KEYS, CSV_KEYS } from '../../../lib/airtableSync';

// L'envoi vers Airtable peut durer (5 requêtes par seconde au plus)
export const config = { maxDuration: 60 };

const rpc = async (db, fn, args) => (await db.rpc(fn, args)).data === true;

// Droit d'export : owner du projet, ou administrateur pour tous les projets
const canScores = (db, body) => (body.all ? rpc(db, 'is_admin') : rpc(db, 'is_owner', { p: body.projectId }));

// Une page de 40 évaluations d'un projet, dans un ordre stable
async function assessmentPage(svc, body) {
  const offset = Math.max(0, Number(body.offset) || 0), limit = 5;   // 5 diagnostics par appel : chacun peut produire des dizaines de lignes d'accompagnement
  // body.all : toutes les évaluations de tous les projets (administrateur)
  let q = svc.from('assessments').select('id, subjects!inner(project_id)', { count: 'exact' });
  if (!body.all) q = q.eq('subjects.project_id', body.projectId);
  const { data, count, error } = await q.order('created_at').order('id').range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { ids: (data || []).map(x => x.id), total: count || 0, offset };
}

async function createAssessment(svc, subjectId, type, email, lang) {
  const token = newToken();
  const { data, error } = await svc.from('assessments')
    .insert({ subject_id: subjectId, type, token_hash: hashToken(token), token_expires_at: tokenExpiry() }).select('id').single();
  if (error) throw error;
  const url = personalUrl(token);
  await sendMail({ to: email, kind: 'personal_link', lang, vars: { url, name: '' } }).catch(() => {});
  return { id: data.id, url };
}

// Prépare et envoie l'invitation : nom de l'invitant, projet, rôles. Renvoie { ok, reason?, detail? }.
async function invitationMail(svc, { user, prof, email, projectId, roles, lang }) {
  const { data: me } = await svc.from('profiles').select('first_name, last_name, name').eq('id', user.id).maybeSingle();
  const inviter = [me?.first_name, me?.last_name].filter(Boolean).join(' ') || me?.name || user.email;
  const project = projectId ? (await svc.from('projects').select('name').eq('id', projectId).maybeSingle()).data?.name || '' : '';
  return sendInvitation(svc, { userId: prof.id, email, contact: prof.first_name || '', inviter, inviterId: user.id, project, roles, lang });
}

const actions = {
  // Inviter un compte : un owner invite des coachs et des owners dans son projet ; seul l'administrateur crée un administrateur
  async invite({ db, svc, body, user }) {
    const { projectId, makeAdmin } = body;
    const first = String(body.firstName || '').trim(), last = String(body.lastName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    if (!isEmail(email)) return [400, 'invalid_form'];
    // Rôles demandés dans le projet : owner et/ou coach (jamais administrateur ici)
    const roles = [...new Set((Array.isArray(body.roles) ? body.roles : [body.role]).filter(r => ['owner', 'coach'].includes(r)))];
    if (makeAdmin && !(await rpc(db, 'is_admin'))) return [403, 'forbidden'];
    if (projectId) {
      if (!roles.length) return [400, 'invalid_form'];
      if (!(await rpc(db, 'is_owner', { p: projectId }))) return [403, 'forbidden'];
    } else if (!makeAdmin) return [400, 'invalid_form'];
    let { data: prof } = await svc.from('profiles').select('id, first_name').eq('email', email).maybeSingle();
    if (!prof) {
      const { data: u, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
      if (error) return [500, 'server_error'];
      const { data: p2 } = await svc.from('profiles').insert({ id: u.user.id, email, first_name: first || null, last_name: last || null, name: [first, last].filter(Boolean).join(' ') || null }).select('id, first_name').single();
      prof = p2;
    }
    if (makeAdmin) await svc.from('profiles').update({ is_admin: true }).eq('id', prof.id);
    if (projectId) {
      for (const role of roles) await svc.from('memberships').upsert({ user_id: prof.id, project_id: projectId, role }, { onConflict: 'user_id,project_id,role' });
    }
    const r = await invitationMail(svc, { user, prof, email, projectId, roles, lang: body.lang });
    return { ok: true, mailSent: r.ok, reason: r.reason, detail: r.detail };
  },
  // Renvoyer l'invitation à une personne de l'équipe (l'e-mail part toujours à SON adresse : jamais de lien montré à l'invitant)
  async resend_invite({ db, svc, body, user }) {
    const uid = String(body.userId || ''), projectId = body.projectId || null;
    if (projectId) { if (!(await rpc(db, 'is_owner', { p: projectId }))) return [403, 'forbidden']; }
    else if (!(await rpc(db, 'is_admin'))) return [403, 'forbidden'];
    const { data: prof } = await svc.from('profiles').select('id, email, first_name, is_admin').eq('id', uid).maybeSingle();
    if (!prof) return [404, 'not_found'];
    let roles = [];
    if (projectId) {
      const { data: ms } = await svc.from('memberships').select('role').eq('user_id', uid).eq('project_id', projectId);
      roles = (ms || []).map(m => m.role);
      if (!roles.length) return [404, 'not_found'];
    } else if (!prof.is_admin) return [404, 'not_found'];
    const r = await invitationMail(svc, { user, prof, email: prof.email, projectId, roles, lang: body.lang });
    return { ok: true, mailSent: r.ok, reason: r.reason, detail: r.detail };
  },

  // Envoi des e-mails (administrateur) : fournisseur, expéditeur, enregistrements DNS, et e-mail de test
  async mail_status({ db, svc }) {
    if (!(await rpc(db, 'is_admin'))) return [403, 'forbidden'];
    const c = mailConfig(), sc = smtpConfig();
    const fromAddr = (/<([^>]+)>/.exec(c.from) || [])[1] || c.from;
    const domain = (/@([^>\s]+)/.exec(fromAddr) || [])[1] || '';
    let appHost = '';
    try { appHost = new URL(appUrl()).hostname; } catch { /* APP_URL absent */ }
    const smtp = c.provider === 'smtp' ? {
      host: sc.host, port: sc.port, user: sc.user, configured: !!(sc.user && sc.pass),
      gmail: /(^|\.)(gmail|googlemail)\.com$/i.test(sc.host),
      fromMismatch: !!fromAddr && !!sc.user && fromAddr.toLowerCase() !== sc.user.toLowerCase(),
    } : null;
    // Pas de requête HEAD ici : une table absente y est prise pour un succès. Les invitations s'enregistrent en base (migration 0010) : sans la table, l'e-mail de test passe mais aucune invitation ne part
    const { error: invErr } = await svc.from('staff_invites').select('id').limit(1);
    return { provider: c.provider, from: c.from || (smtp ? sc.user : ''), replyTo: c.replyTo, domain, appHost, smtp, invites: { ok: !invErr, detail: invErr ? invErr.message : '' },
      freeMail: c.provider === 'resend' && !!domain && FREE_MAIL.test(domain),     // avec SMTP, c'est le serveur du compte qui signe : une adresse Gmail est légitime
      dns: c.provider === 'resend' && domain ? await checkDns(domain) : null };
  },
  async mail_test({ db, user, body }) {
    if (!(await rpc(db, 'is_admin'))) return [403, 'forbidden'];
    try { await sendMail({ to: user.email, kind: 'test', lang: body.lang }); return { ok: true, to: user.email }; }
    catch (e) { return [502, String(e.message).startsWith('mail_smtp_') ? e.message : 'mail_failed', e.detail || e.message]; }
  },

  // Nouveau lien personnel (l'ancien est révoqué) ; renvoyé par e-mail si demandé
  async link({ db, svc, body }) {
    const { data: a } = await db.from('assessments').select('id, subjects(email)').eq('id', body.assessmentId).maybeSingle();
    if (!a) return [403, 'forbidden'];
    const url = await rotateToken(svc, a.id);
    if (body.send) await sendMail({ to: a.subjects.email, kind: 'resume_link', lang: body.lang, vars: { url } }).catch(() => {});
    return { url };
  },

  // Révoquer le lien sans en créer de nouveau
  async revoke_link({ db, svc, body }) {
    const { data: a } = await db.from('assessments').select('id').eq('id', body.assessmentId).maybeSingle();
    if (!a) return [403, 'forbidden'];
    await svc.from('assessments').update({ token_hash: null, token_expires_at: null }).eq('id', a.id);
    return { ok: true };
  },

  // Création manuelle d'une OSC (F23)
  async create_subject({ db, svc, body }) {
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    if (!name || !isEmail(email) || !body.firstName || !body.lastName) return [400, 'invalid_form'];
    if (!(await rpc(db, 'is_owner', { p: body.projectId }))) return [403, 'forbidden'];
    const { data: s, error } = await svc.from('subjects')
      .insert({ project_id: body.projectId, name, email, contact_first_name: String(body.firstName).trim(), contact_last_name: String(body.lastName).trim(), coach_id: body.coachId || null, origin: 'manual' }).select('id').single();
    if (error) return [409, 'email_exists'];
    const r = await createAssessment(svc, s.id, 'baseline', email, body.lang);
    await inBackground(syncAssessmentsSafe(svc, [r.id], { timeoutMs: 8000 }));
    return { subjectId: s.id, url: r.url };
  },

  // Évaluation de suivi ou endline créée par le coach
  async create_assessment({ db, svc, body }) {
    if (!['baseline', 'followup', 'endline'].includes(body.type)) return [400, 'invalid_form'];
    const { data: s } = await db.from('subjects').select('id, email').eq('id', body.subjectId).maybeSingle();
    if (!s) return [403, 'forbidden'];
    return await createAssessment(svc, s.id, body.type, s.email, body.lang);
  },

  // Ajoute une section entière (et ses questions) à un projet : owner de ce projet ou administrateur.
  // kind 'scored' : questions notées (N/A, 1, 2, 3) ; kind 'data' : section libre, questions de type texte, nombre, oui/non, choix.
  async add_section({ db, svc, body }) {
    const projectId = body.projectId;
    if (!(await rpc(db, 'is_owner', { p: projectId }))) return [403, 'forbidden'];
    const kind = body.kind === 'data' ? 'data' : 'scored';
    const nameFr = String(body.nameFr || '').trim().slice(0, 200);
    const nameEn = String(body.nameEn || '').trim().slice(0, 200) || nameFr;
    let items;
    if (kind === 'scored') {
      const qFr = (Array.isArray(body.questionsFr) ? body.questionsFr : []).map(s => String(s).trim().slice(0, 1000)).filter(Boolean).slice(0, 100);
      const qEn = (Array.isArray(body.questionsEn) ? body.questionsEn : []).map(s => String(s).trim().slice(0, 1000));
      items = qFr.map((text, i) => ({ format: 'scale', fr: text, en: qEn[i] || text, options: null }));
    } else {
      const FORMATS = ['text', 'short', 'number', 'yesno', 'choice', 'multi'];
      items = [];
      for (const q of (Array.isArray(body.questions) ? body.questions : []).slice(0, 100)) {
        const fr = String(q?.fr || '').trim().slice(0, 1000);
        if (!FORMATS.includes(q?.type) || !fr) continue;
        let options = null;
        if (q.type === 'choice' || q.type === 'multi') {
          const o = (Array.isArray(q.options) ? q.options : []).map(x => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 30);
          const oe = (Array.isArray(q.optionsEn) ? q.optionsEn : []).map(x => String(x).trim().slice(0, 200));
          if (o.length < 2) return [400, 'invalid_section'];
          options = o.map((x, i) => ({ key: `o${i + 1}`, fr: x, en: oe[i] || x }));
        }
        items.push({ format: q.type, fr, en: String(q.en || '').trim().slice(0, 1000) || fr, options });
      }
    }
    if (!nameFr || !items.length) return [400, 'invalid_section'];
    const { data: p } = await svc.from('projects').select('id, framework_id').eq('id', projectId).single();
    const { data: all } = await svc.from('sections').select('num, project_id').eq('framework_id', p.framework_id);
    const num = Math.max(0, ...all.map(s => s.num)) + 1;                      // numéro interne unique dans le cadre
    const idx = all.filter(s => !s.project_id).length + all.filter(s => s.project_id === projectId).length + 1; // rang affiché
    const { data: sec, error } = await svc.from('sections')
      .insert({ framework_id: p.framework_id, num, name_fr: nameFr, name_en: nameEn, project_id: projectId, kind }).select('id').single();
    if (error) return [500, 'server_error'];
    const rows = items.map((it, i) => ({ framework_id: p.framework_id, section_id: sec.id, project_id: projectId,
      concept_id: `proj-${String(projectId).slice(0, 8)}-s${num}-q${i + 1}`, code: `${idx}.${i + 1}`, ord: i + 1,
      format: it.format, text_fr: it.fr, text_en: it.en, options: it.options }));
    const { error: e2 } = await svc.from('questions').insert(rows);
    if (e2) { await svc.from('sections').delete().eq('id', sec.id); return [500, 'server_error']; }
    return { ok: true, sectionId: sec.id };
  },

  // Suivi-évaluation : crée la table Airtable, envoie les scores, ou renvoie les lignes pour un CSV (par lots de 40 évaluations)
  // Crée les trois tables (ou ajoute les colonnes manquantes)
  async scores_setup({ db, svc, body }) {
    if (!(await canScores(db, body))) return [403, 'forbidden'];
    const cfg = await airtableConfig(svc);
    if (!airtableReady(cfg)) return [400, 'airtable_not_configured'];
    try { return await ensureTables(svc, cfg); } catch (e) { return [502, airtableCode(e), e.message]; }
  },
  // Envoie une page de diagnostics (avec leurs organisations et leurs lignes d'accompagnement)
  async scores_sync({ db, svc, body }) {
    if (!(await canScores(db, body))) return [403, 'forbidden'];
    const cfg = await airtableConfig(svc);
    if (!airtableReady(cfg)) return [400, 'airtable_not_configured'];
    const { ids, total, offset } = await assessmentPage(svc, body);
    let sent;
    try { sent = await syncAssessments(svc, cfg, ids); } catch (e) { return [502, airtableCode(e), e.message]; }
    const done = offset + ids.length;
    return { ...sent, mode: cfg.mode, done, total, next: ids.length && done < total ? done : null };
  },
  // CSV : la table « Scores » (mode simple) ou l'une des trois tables (mode complet), mêmes colonnes que dans Airtable
  async scores_csv({ db, svc, body }) {
    if (!(await canScores(db, body))) return [403, 'forbidden'];
    const cfg = await airtableConfig(svc);
    const table = CSV_KEYS.includes(body.table) ? body.table : (cfg.mode === 'complet' ? 'diagnostics' : 'scores');
    const { ids, total, offset } = await assessmentPage(svc, body);
    const data = await buildData(svc, ids);
    const done = offset + ids.length;
    return { fields: fieldNames(table), rows: table === 'scores' ? legacyRows(data) : data[table], done, total, next: ids.length && done < total ? done : null };
  },
  // Mode d'export en vigueur (pour afficher les bons boutons à un owner)
  async scores_mode({ db, svc, body }) {
    if (!(await canScores(db, body))) return [403, 'forbidden'];
    const cfg = await airtableConfig(svc);
    return { mode: cfg.mode, table: cfg.table };
  },
  // Envoi d'un diagnostic précis, déclenché quand un plan est validé ou partagé, ou qu'une session est terminée
  async sync_assessment({ db, svc, body }) {
    const { data: a } = await db.from('assessments').select('id').eq('id', String(body.assessmentId || '')).maybeSingle();   // la RLS limite aux organisations visibles
    if (!a) return [403, 'forbidden'];
    await inBackground(syncAssessmentsSafe(svc, [a.id], { timeoutMs: 20000 }));
    return { ok: true };
  },

  // Connexion Airtable (administrateur) : le jeton est enregistré côté serveur et n'est jamais renvoyé en clair
  async airtable_get({ db, svc }) {
    if (!(await rpc(db, 'is_admin'))) return [403, 'forbidden'];
    const cfg = await airtableConfig(svc);
    // « configured » = champs remplis ; « verified » = Airtable accepte réellement la connexion
    let verified = false, problem = null;
    if (airtableReady(cfg)) {
      try { await testAirtable(cfg); verified = true; } catch (e) { problem = { code: airtableCode(e), detail: e.message }; }
    }
    return { configured: airtableReady(cfg), verified, problem, baseId: cfg.base, mode: cfg.mode, table: cfg.table, tables: cfg.tables, auto: cfg.auto,
      tokenHint: cfg.token ? `••••${cfg.token.slice(-4)}` : '', source: cfg.fromApp ? 'app' : (cfg.token ? 'env' : '') };
  },
  async airtable_save({ db, svc, body }) {
    if (!(await rpc(db, 'is_admin'))) return [403, 'forbidden'];
    const { data: cur } = await svc.from('app_settings').select('value').eq('key', 'airtable').maybeSingle();
    const token = cleanToken(body.token);                      // sans « Bearer », espaces ni guillemets
    if (token && !token.startsWith('pat')) return [400, 'airtable_token_format'];
    const baseId = cleanBaseId(body.baseId);                   // l'adresse de la base collée en entier convient aussi
    if (!baseId) return [400, 'airtable_base_format'];
    const mode = body.mode === 'complet' ? 'complet' : 'simple';
    const table = String(body.table || '').trim().slice(0, 100) || DEFAULT_SCORES_TABLE;
    const tables = Object.fromEntries(TABLE_KEYS.map(k => [k, String(body.tables?.[k] || '').trim().slice(0, 100) || DEFAULT_TABLES[k]]));
    if (mode === 'complet' && new Set(Object.values(tables).map(x => x.toLowerCase())).size < 3) return [400, 'airtable_tables_distinct'];
    const next = { ...(cur?.value || {}), baseId, mode, table, tables, auto: body.auto !== false };
    if (token) next.token = token.slice(0, 300);
    const { error } = await svc.from('app_settings').upsert({ key: 'airtable', value: next, updated_at: new Date().toISOString() });
    if (error) return [500, 'server_error'];
    return { ok: true };
  },
  async airtable_test({ db, svc }) {
    if (!(await rpc(db, 'is_admin'))) return [403, 'forbidden'];
    const cfg = await airtableConfig(svc);
    if (!airtableReady(cfg)) return [400, 'airtable_not_configured'];
    try { return await testAirtable(cfg); } catch (e) { return [502, airtableCode(e), e.message]; }
  },

  // Analytics : toutes les données de l'onglet en un appel (owner du projet ou administrateur).
  // La fonction SQL vérifie elle-même is_owner ; les questions viennent de la banque (lib/bank.js) pour appliquer isScored.
  async analytics({ db, body }) {
    const projectId = String(body.projectId || '');
    if (!(await rpc(db, 'is_owner', { p: projectId }))) return [403, 'forbidden'];
    const { data: p } = await db.from('projects').select('id, framework_id').eq('id', projectId).maybeSingle();
    if (!p) return [404, 'not_found'];
    const [bank, { data, error }] = await Promise.all([
      loadBank(db, p.framework_id, null, p.id),
      db.rpc('analytics_rows', { p_project: p.id, p_type: null, p_include_in_progress: true }),
    ]);
    if (error) return [error.code === 'PGRST202' ? 501 : 500, error.code === 'PGRST202' ? 'analytics_not_installed' : 'server_error'];
    // Textes nécessaires seulement : pas de guides de réponse
    const questions = bank.questions.map(({ guide_fr, guide_en, ...q }) => q);   // eslint-disable-line no-unused-vars
    return { sections: bank.sections, questions, ...data };
  },

  // Fusion de doublons (F31) : les évaluations passent sur le dossier conservé
  async merge({ db, svc, body }) {
    const { data: rows } = await db.from('subjects').select('id, project_id').in('id', [body.keepId, body.dropId]);
    if (!rows || rows.length !== 2 || rows[0].project_id !== rows[1].project_id) return [400, 'invalid_form'];
    if (!(await rpc(db, 'is_owner', { p: rows[0].project_id }))) return [403, 'forbidden'];
    await svc.from('assessments').update({ subject_id: body.keepId }).eq('subject_id', body.dropId);
    await svc.from('subjects').delete().eq('id', body.dropId);
    return { ok: true };
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const fn = actions[req.query.action];
  if (!fn) return fail(res, 404, 'not_found');
  const { user, db } = await staffFromReq(req);
  if (!user) return fail(res, 401, 'not_signed_in');
  try {
    const out = await fn({ db, svc: admin(), body: req.body || {}, user });
    if (Array.isArray(out)) return res.status(out[0]).json({ error: out[1], detail: out[2] });
    res.json(out);
  } catch (e) {
    console.error('staff action failed', req.query.action, e?.message);
    fail(res, 500, 'server_error');
  }
}

// Actions staff qui exigent la clé service. Les droits sont toujours vérifiés avec le client RLS de l'appelant.
import { admin, fail, isEmail, staffFromReq, newToken, hashToken, tokenExpiry, personalUrl, rotateToken } from '../../../lib/server';
import { sendMail } from '../../../lib/mail';
import { sendLoginLink } from '../../../lib/login';

const rpc = async (db, fn, args) => (await db.rpc(fn, args)).data === true;

async function createAssessment(svc, subjectId, type, email, lang) {
  const token = newToken();
  const { data, error } = await svc.from('assessments')
    .insert({ subject_id: subjectId, type, token_hash: hashToken(token), token_expires_at: tokenExpiry() }).select('id').single();
  if (error) throw error;
  const url = personalUrl(token);
  await sendMail({ to: email, kind: 'personal_link', lang, vars: { url, name: '' } }).catch(() => {});
  return { id: data.id, url };
}

const actions = {
  // Inviter un compte ; owner : coachs de son projet ; admin : tout
  async invite({ db, svc, body }) {
    const email = String(body.email || '').trim().toLowerCase();
    const { projectId, role, makeAdmin } = body;
    const first = String(body.firstName || '').trim(), last = String(body.lastName || '').trim();
    if (!isEmail(email)) return [400, 'invalid_form'];
    const isAdm = await rpc(db, 'is_admin');
    if ((makeAdmin || role === 'owner') && !isAdm) return [403, 'forbidden'];
    if (role === 'coach' && !(await rpc(db, 'is_owner', { p: projectId }))) return [403, 'forbidden'];
    let { data: prof } = await svc.from('profiles').select('id').eq('email', email).maybeSingle();
    if (!prof) {
      const { data: u, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
      if (error) return [500, 'server_error'];
      const { data: p2 } = await svc.from('profiles').insert({ id: u.user.id, email, first_name: first || null, last_name: last || null, name: [first, last].filter(Boolean).join(' ') || null }).select('id').single();
      prof = p2;
    }
    if (makeAdmin) await svc.from('profiles').update({ is_admin: true }).eq('id', prof.id);
    if (projectId && ['owner', 'coach'].includes(role)) {
      await svc.from('memberships').upsert({ user_id: prof.id, project_id: projectId, role }, { onConflict: 'user_id,project_id,role' });
    }
    await sendLoginLink(svc, email, body.lang).catch(() => {});
    return { ok: true };
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
    return { subjectId: s.id, url: r.url };
  },

  // Évaluation de suivi ou endline créée par le coach
  async create_assessment({ db, svc, body }) {
    if (!['baseline', 'followup', 'endline'].includes(body.type)) return [400, 'invalid_form'];
    const { data: s } = await db.from('subjects').select('id, email').eq('id', body.subjectId).maybeSingle();
    if (!s) return [403, 'forbidden'];
    return await createAssessment(svc, s.id, body.type, s.email, body.lang);
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
    if (Array.isArray(out)) return fail(res, out[0], out[1]);
    res.json(out);
  } catch (e) {
    console.error('staff action failed', req.query.action, e?.message);
    fail(res, 500, 'server_error');
  }
}

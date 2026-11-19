// GET ?slug= : infos publiques d'un projet (lien public)
import { admin, fail } from '../../../lib/server';

export default async function handler(req, res) {
  const db = admin();
  const { data: p } = await db.from('projects')
    .select('id, name, welcome_fr, welcome_en, offer_coach_choice, public_active, archived, countries')
    .eq('public_slug', String(req.query.slug || '')).maybeSingle();
  if (!p || !p.public_active || p.archived) return fail(res, 404, 'link_inactive');
  let coaches = [];
  if (p.offer_coach_choice) {
    const { data } = await db.from('memberships').select('user_id, profiles(name, email)')
      .eq('project_id', p.id).eq('role', 'coach').eq('offered_to_osc', true);
    coaches = (data || []).map(m => ({ id: m.user_id, name: m.profiles?.name || m.profiles?.email }));
  }
  // Lien d'un coach (?coach=…) : l'OSC lui est rattachée d'office ; le coach doit appartenir à ce projet
  let presetCoach = null;
  const cid = String(req.query.coach || '');
  if (/^[0-9a-f-]{36}$/i.test(cid)) {
    const { data: m } = await db.from('memberships').select('user_id, profiles(name, first_name, last_name, email)').eq('project_id', p.id).eq('user_id', cid).eq('role', 'coach').maybeSingle();
    if (m) presetCoach = { id: m.user_id, name: [m.profiles?.first_name, m.profiles?.last_name].filter(Boolean).join(' ') || m.profiles?.name || m.profiles?.email };
  }
  res.json({ name: p.name, welcome_fr: p.welcome_fr, welcome_en: p.welcome_en, countries: p.countries || [], coaches, presetCoach });
}

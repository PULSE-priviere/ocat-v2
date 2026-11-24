// Session staff : profil, projets et rôles. Redirige vers /login sans session.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { sb } from './supabase';

// Dernier état connu, gardé entre les pages : l'écran s'affiche tout de suite puis se met à jour en arrière-plan
let cached = null;

export function useStaff() {
  const router = useRouter();
  const [state, setState] = useState(() => cached || { loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { data: { session } } = await sb().auth.getSession();
      if (!session) { cached = null; router.replace('/login'); return; }
      const uid = session.user.id;
      const [{ data: profile }, { data: mems }, { data: projects }] = await Promise.all([
        sb().from('profiles').select('id, email, name, first_name, last_name, is_admin').eq('id', uid).maybeSingle(),
        sb().from('memberships').select('project_id, role').eq('user_id', uid),
        sb().from('projects').select('*').order('created_at'),
      ]);
      if (!profile) { await sb().auth.signOut(); router.replace('/login?e=no_account'); return; }
      const roles = {};
      (mems || []).forEach(m => { (roles[m.project_id] = roles[m.project_id] || []).push(m.role); });
      cached = { loading: false, profile, projects: projects || [], roles };
      if (alive) setState(cached);
    };
    run();
    const { data: sub } = sb().auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { cached = null; router.replace('/login'); } });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [router, version]);
  const isOwner = pid => state.profile?.is_admin || (state.roles?.[pid] || []).includes('owner');
  return { ...state, isOwner, refresh: () => setVersion(x => x + 1), signOut: () => sb().auth.signOut() };
}

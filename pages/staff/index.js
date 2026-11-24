// Espace équipe : « Tous les projets », administration, puis un projet (cohorte, besoins, équipe, réglages…) via le menu latéral
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Layout from '../../components/Layout';
import StaffNav from '../../components/staff/StaffNav';
import ProjectsHome from '../../components/staff/ProjectsHome';
import Cohort from '../../components/staff/Cohort';
import Needs from '../../components/staff/Needs';
import Team from '../../components/staff/Team';
import ProjectSettings from '../../components/staff/ProjectSettings';
import Questionnaire from '../../components/staff/Questionnaire';
import Journal from '../../components/staff/Journal';
import Duplicates from '../../components/staff/Duplicates';
import Admin from '../../components/staff/Admin';
import ShareLinks from '../../components/staff/ShareLinks';
import CoachHome from '../../components/staff/CoachHome';
// Analytics : code chargé seulement à l'ouverture de l'onglet (graphiques, tableaux, exports)
const Analytics = dynamic(() => import('../../components/staff/Analytics'), { ssr: false, loading: () => null });
import { useI18n } from '../../lib/i18n';
import { useStaff } from '../../lib/useStaff';
import { sb } from '../../lib/supabase';
import { loadCohort, loadNeeds } from '../../lib/cohort';
import { safeStr } from '../../lib/safe';
import { fullName } from '../../lib/names';
import appConfig from '../../app.config';

// Dernières données de chaque projet ouvert, gardées en mémoire le temps de la visite (jamais sur le disque)
const cache = new Map();

export default function Staff() {
  const { t } = useI18n();
  const router = useRouter();
  const staff = useStaff();
  const pid = typeof router.query.p === 'string' ? router.query.p : '';
  const tab = typeof router.query.tab === 'string' ? router.query.tab : '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(x => x + 1), []);

  const projects = (staff.projects || []).filter(p => !p.archived || staff.profile?.is_admin);
  const project = pid ? projects.find(p => p.id === pid) : null;
  const owner = project ? staff.isOwner(project.id) : false;
  const allowed = ['cohort', ...(owner ? ['analytics'] : []), 'needs', 'sections', 'team', ...(owner ? ['project', 'journal', 'duplicates'] : [])];
  const coachHome = !staff.profile?.is_admin && Object.values(staff.roles || {}).some(r => r.includes('coach'));
  const cur = project ? (allowed.includes(tab) ? tab : 'cohort') : (tab === 'admin' && staff.profile?.is_admin ? 'admin' : tab === 'projects' ? 'projects' : 'home');

  useEffect(() => {
    if (!project) { setData(null); return; }
    let alive = true;
    // Clé par personne ET projet : après une déconnexion, un autre compte ne voit jamais les données du précédent
    const cacheKey = `${staff.profile?.id}:${project.id}`;
    // Changement de projet : on vide l'écran pour ne jamais afficher les OSC du projet précédent.
    // Retour sur un projet déjà ouvert (depuis une fiche, par exemple) : la dernière version s'affiche tout de suite,
    // puis elle est remplacée par les données fraîches.
    setData(d => (d && d.pid === project.id ? d : cache.get(cacheKey) || null)); setError('');
    (async () => {
      try {
        const memsQ = sb().from('memberships').select('user_id, role, offered_to_osc, profile:profiles(name, first_name, last_name, email)').eq('project_id', project.id);
        const [cohort, { data: mems }] = await Promise.all([loadCohort(project), memsQ]);
        const next = { pid: project.id, cohort, needs: loadNeeds(project, cohort), members: mems || [] };
        cache.set(cacheKey, next);
        if (alive) { setData(next); setError(''); }
      } catch (e) { console.error(e); if (alive) setError('server_error'); }
    })();
    return () => { alive = false; };
  }, [project?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (staff.loading) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;

  const signOut = async () => { await staff.signOut(); router.replace('/login'); };
  const coaches = (data?.members || []).filter(m => m.role === 'coach').map(m => ({ id: m.user_id, ...m.profile }));
  const rows = data?.cohort.rows || [];
  const identity = { org: appConfig.orgName, person: fullName(staff.profile), href: '/staff/profile' };
  const nav = <StaffNav staff={staff} project={project} active={cur} onSignOut={signOut} />;

  let body;
  if (cur === 'admin') {
    body = (
      <>
        <section className="hero2 compact"><div><p className="eyebrow">{appConfig.orgName}</p><h1 className="display sm">{t('staff.tab_admin')}<br /><span className="accent">{t('staff.admin_accent')}</span></h1></div></section>
        <Admin projects={staff.projects} reload={staff.refresh} />
      </>
    );
  } else if (!project) {
    body = cur === 'home' && coachHome ? <CoachHome staff={staff} /> : <ProjectsHome staff={staff} projects={projects} />;
  } else {
    body = (
      <>
        <section className="hero2 compact">
          <div>
            <p className="eyebrow">{safeStr(project.cohort) || t('staff.project')}</p>
            <h1 className="display sm">{safeStr(project.name)}<br /><span className="accent">{t(`staff.tab_${cur}`)}</span></h1>
          </div>
          {data ? (
            <div className="kpis mini">
              <div className="kpi"><span className="v">{rows.length}</span><span className="l">{t('staff.kpi_osc')}</span></div>
              <div className="kpi"><span className="v">{rows.filter(r => r.current && r.current.status !== 'in_progress').length}</span><span className="l">{t('staff.kpi_submitted')}</span></div>
              <div className="kpi"><span className="v">{rows.length ? Math.round(rows.reduce((a, r) => a + r.completion, 0) / rows.length) : 0} %</span><span className="l">{t('staff.kpi_completion')}</span></div>
            </div>
          ) : null}
        </section>
        {error && cur !== 'analytics' ? <p className="error">{t(`errors.${error}`)}</p> : null}
        {/* Analytics a son propre chargement (un appel) : il n'attend pas celui de la cohorte */}
        {cur === 'analytics' ? <Analytics project={project} /> : !data ? <p className="muted">{t('common.loading')}</p> : (
          <>
            {cur === 'cohort' && <><ShareLinks project={project} staff={staff} /><Cohort project={project} cohort={data.cohort} coaches={coaches} owner={owner} reload={reload} /></>}
            {cur === 'needs' && <Needs project={project} cohort={data.cohort} needs={data.needs} />}
            {cur === 'team' && <Team project={project} members={data.members} owner={owner} isAdmin={staff.profile.is_admin} reload={reload} />}
            {cur === 'project' && <ProjectSettings project={project} needs={data.needs.needs} reload={() => { staff.refresh(); reload(); }} />}
            {cur === 'sections' && <Questionnaire project={project} owner={owner} reload={reload} />}
            {cur === 'journal' && <Journal project={project} cohort={data.cohort} />}
            {cur === 'duplicates' && <Duplicates cohort={data.cohort} reload={reload} />}
          </>
        )}
      </>
    );
  }
  return (
    <Layout wide title={project ? safeStr(project.name) : t('staff.title')} home="/staff" identity={identity} sidebar={nav}>
      {!staff.profile.first_name || !staff.profile.last_name ? <p className="banner"><a href="/staff/profile">{t('staff.complete_name')}</a></p> : null}
      {body}
    </Layout>
  );
}

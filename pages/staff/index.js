// Espace staff : projet, cohorte, besoins, équipe, réglages, journal, doublons, administration
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useI18n } from '../../lib/i18n';
import { useStaff } from '../../lib/useStaff';
import { sb } from '../../lib/supabase';
import { loadCohort, loadNeeds } from '../../lib/cohort';
import { safeStr } from '../../lib/safe';
import { fullName } from '../../lib/names';
import appConfig from '../../app.config';
import Cohort from '../../components/staff/Cohort';
import Needs from '../../components/staff/Needs';
import Team from '../../components/staff/Team';
import ProjectSettings from '../../components/staff/ProjectSettings';
import Journal from '../../components/staff/Journal';
import Duplicates from '../../components/staff/Duplicates';
import Admin from '../../components/staff/Admin';
import ProjectSections from '../../components/staff/ProjectSections';

export default function Staff() {
  const { t } = useI18n();
  const router = useRouter();
  const staff = useStaff();
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState('cohort');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(x => x + 1), []);

  const projects = (staff.projects || []).filter(p => !p.archived || staff.profile?.is_admin);
  const project = projects.find(p => p.id === projectId);
  const owner = project ? staff.isOwner(project.id) : false;

  useEffect(() => {
    if (staff.loading || projectId) return;
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ocat:project') : '';
    const first = projects.find(p => p.id === saved) || projects[0];
    if (first) setProjectId(first.id); else if (staff.profile?.is_admin) setTab('admin');
  }, [staff.loading, projectId, projects, staff.profile]);

  useEffect(() => {
    if (!project) return;
    let alive = true;
    (async () => {
      try {
        const cohort = await loadCohort(project);
        const needs = await loadNeeds(project, cohort);
        const { data: mems } = await sb().from('memberships').select('user_id, role, offered_to_osc, profile:profiles(name, first_name, last_name, email)').eq('project_id', project.id);
        if (alive) { setData({ cohort, needs, members: mems || [] }); setError(''); }
      } catch { if (alive) setError('server_error'); }
    })();
    return () => { alive = false; };
  }, [project, tick]);

  if (staff.loading) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;

  const coaches = (data?.members || []).filter(m => m.role === 'coach').map(m => ({ id: m.user_id, ...m.profile }));
  const tabs = ['cohort', 'needs', ...(owner ? ['team', 'project', 'sections', 'journal', 'duplicates'] : []), ...(staff.profile.is_admin ? ['admin'] : [])];
  const signOut = async () => { await staff.signOut(); router.replace('/login'); };

  return (
    <Layout wide title={t('staff.title')} home="/staff" identity={{ org: appConfig.orgName, person: fullName(staff.profile), href: '/staff/profile' }}
      right={<button className="btn ghost" onClick={signOut}>{t('staff.sign_out')}</button>}>
      {!staff.profile.first_name || !staff.profile.last_name ? <p className="banner"><a href="/staff/profile">{t('staff.complete_name')}</a></p> : null}
      <div className="toolbar">
        <h1 className="h1-small">{project ? safeStr(project.name) : t('staff.title')}</h1>
        {projects.length > 1 ? (
          <select aria-label={t('staff.project')} value={projectId} onChange={e => { setProjectId(e.target.value); setData(null); localStorage.setItem('ocat:project', e.target.value); }}>
            {projects.map(p => <option key={p.id} value={p.id}>{safeStr(p.name)}</option>)}
          </select>
        ) : null}
      </div>
      <nav className="tabs" role="tablist">
        {tabs.map(k => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`staff.tab_${k}`)}</button>)}
      </nav>
      {error ? <p className="error">{t(`errors.${error}`)}</p> : null}
      {tab === 'admin' ? <Admin projects={staff.projects} reload={staff.refresh} /> :
        !project ? <p className="empty-inline">{t('staff.no_project')}</p> :
        !data ? <p className="muted">{t('common.loading')}</p> : (
          <>
            {tab === 'cohort' && <Cohort project={project} cohort={data.cohort} coaches={coaches} owner={owner} reload={reload} />}
            {tab === 'needs' && <Needs project={project} cohort={data.cohort} needs={data.needs} />}
            {tab === 'team' && <Team project={project} members={data.members} isAdmin={staff.profile.is_admin} reload={reload} />}
            {tab === 'project' && <ProjectSettings project={project} needs={data.needs.needs} reload={() => { staff.refresh(); reload(); }} />}
            {tab === 'sections' && <ProjectSections project={project} reload={reload} />}
            {tab === 'journal' && <Journal project={project} cohort={data.cohort} />}
            {tab === 'duplicates' && <Duplicates cohort={data.cohort} reload={reload} />}
          </>
        )}
    </Layout>
  );
}

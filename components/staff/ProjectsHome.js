// Tableau de bord « Tous les projets » : chiffres clés et une carte par projet
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon';
import { useI18n } from '../../lib/i18n';
import { sb, fetchAll, fetchIn } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import { projectGradient, initials } from '../../lib/projectColor';

export default function ProjectsHome({ staff, projects }) {
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const key = projects.map(p => p.id).join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = projects.map(p => p.id);
      const st = Object.fromEntries(ids.map(id => [id, { osc: 0, submitted: 0, nocoach: 0, coaches: 0 }]));
      if (ids.length) {
        const subs = await fetchAll(() => sb().from('subjects').select('id, project_id, coach_id').in('project_id', ids));
        const ass = subs.length ? await fetchIn(c => sb().from('assessments').select('subject_id, status').in('subject_id', c), subs.map(s => s.id)) : [];
        const { data: mems } = await sb().from('memberships').select('project_id, role').in('project_id', ids);
        const proj = Object.fromEntries(subs.map(s => [s.id, s.project_id]));
        subs.forEach(s => { st[s.project_id].osc++; if (!s.coach_id) st[s.project_id].nocoach++; });
        ass.forEach(a => { if (a.status !== 'in_progress' && st[proj[a.subject_id]]) st[proj[a.subject_id]].submitted++; });
        (mems || []).forEach(m => { if (m.role === 'coach' && st[m.project_id]) st[m.project_id].coaches++; });
      }
      if (alive) setStats(st);
    })().catch(() => alive && setStats({}));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const sum = k => Object.values(stats || {}).reduce((a, s) => a + (s[k] || 0), 0);
  const role = p => (staff.profile.is_admin ? t('role.admin') : (staff.roles[p.id] || []).includes('owner') ? t('role.owner') : t('role.coach'));
  return (
    <>
      <section className="hero2">
        <div>
          <p className="eyebrow">{t('staff.hero_eyebrow')}</p>
          <h1 className="display">{t('staff.hero_title')}<br /><span className="accent">{t('staff.hero_accent')}</span></h1>
        </div>
        <div className="hero2-side">
          <p className="lead">{t('staff.hero_text')}</p>
          {staff.profile.is_admin ? <Link className="btn primary" href="/staff?tab=admin"><Icon name="plus" />{t('staff.new_project')}</Link> : null}
        </div>
      </section>
      <div className="kpis">
        <div className="kpi grad"><span className="v">{projects.length}</span><span className="l">{t('staff.kpi_projects')}</span></div>
        <div className="kpi"><span className="v">{stats ? sum('osc') : '…'}</span><span className="l">{t('staff.kpi_osc')}</span></div>
        <div className="kpi"><span className="v">{stats ? sum('submitted') : '…'}</span><span className="l">{t('staff.kpi_submitted')}</span></div>
        <div className="kpi"><span className="v">{stats ? sum('nocoach') : '…'}</span><span className="l">{t('staff.kpi_nocoach')}</span></div>
      </div>
      {projects.length === 0 ? <p className="empty-inline">{t('staff.no_project')}</p> : (
        <div className="projgrid">
          {projects.map(p => {
            const s = stats?.[p.id] || { osc: 0, submitted: 0, coaches: 0 };
            return (
              <Link key={p.id} href={`/staff?p=${p.id}&tab=cohort`} className="projcard">
                <div className="projcard-top" style={{ background: projectGradient(p.id) }}>
                  <span className="projcard-initials">{initials(p.name)}</span>
                  {p.archived ? <span className="pill glass">{t('admin.archived')}</span> : null}
                </div>
                <div className="projcard-body">
                  <h3>{safeStr(p.name)}</h3>
                  <p className="muted small">{safeStr(p.cohort) || '—'}</p>
                  <div className="projcard-stats">
                    <span><b>{s.osc}</b> {t('staff.kpi_osc')}</span>
                    <span><b>{s.submitted}</b> {t('staff.kpi_submitted_short')}</span>
                    <span><b>{s.coaches}</b> {t('staff.kpi_coaches')}</span>
                  </div>
                  <div className="projcard-foot"><span className="pill">{role(p)}</span><span className="projcard-open">{t('staff.open')} <Icon name="arrow" size={15} /></span></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

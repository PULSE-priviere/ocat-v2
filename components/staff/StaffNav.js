// Menu latéral de l'espace équipe : tous les projets (chacun avec sa pastille), rubriques du projet ouvert, administration, profil
import Link from 'next/link';
import Icon from '../Icon';
import { useI18n } from '../../lib/i18n';
import { safeStr } from '../../lib/safe';
import { projectColor } from '../../lib/projectColor';

const ICONS = { cohort: 'users', needs: 'target', team: 'user', project: 'link', sections: 'layers', journal: 'clock', duplicates: 'copy' };

export default function StaffNav({ staff, project, active, onSignOut }) {
  const { t } = useI18n();
  const projects = (staff.projects || []).filter(p => !p.archived || staff.profile?.is_admin);
  const owner = project ? staff.isOwner(project.id) : false;
  const items = ['cohort', 'needs', 'team', ...(owner ? ['project', 'sections', 'journal', 'duplicates'] : [])];
  return (
    <nav className="sidenav" aria-label={t('staff.menu')}>
      <Link className={`sideitem ${active === 'home' ? 'on' : ''}`} href="/staff"><Icon name="grid" />{t('staff.all_projects')}</Link>
      <div className="sideprojects">
        {projects.map(p => {
          const open = project && project.id === p.id;
          return (
            <div key={p.id}>
              <Link className={`sideitem sideproj ${open ? 'cur' : ''}`} href={`/staff?p=${p.id}&tab=cohort`}>
                <span className="sq" style={{ background: projectColor(staff.projects, p.id) }} />
                <span className="sidename">{safeStr(p.name)}</span>
              </Link>
              {open ? (
                <div className="sidesub">
                  {items.map(k => (
                    <Link key={k} className={`sideitem ${active === k ? 'on' : ''}`} href={`/staff?p=${p.id}&tab=${k}`}><Icon name={ICONS[k]} size={16} />{t(`staff.tab_${k}`)}</Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="sidefoot">
        {staff.profile?.is_admin ? <Link className={`sideitem ${active === 'admin' ? 'on' : ''}`} href="/staff?tab=admin"><Icon name="shield" />{t('staff.tab_admin')}</Link> : null}
        <Link className={`sideitem ${active === 'profile' ? 'on' : ''}`} href="/staff/profile"><Icon name="user" />{t('staff.profile')}</Link>
        {onSignOut ? <button type="button" className="sideitem" onClick={onSignOut}><Icon name="logout" />{t('staff.sign_out')}</button> : null}
      </div>
    </nav>
  );
}

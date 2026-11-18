// Menu latéral de l'espace équipe : tous les projets, administration, puis les rubriques du projet ouvert
import Link from 'next/link';
import Icon from '../Icon';
import { useI18n } from '../../lib/i18n';
import { safeStr } from '../../lib/safe';
import { projectColor } from '../../lib/projectColor';

const ICONS = { cohort: 'users', needs: 'target', team: 'user', project: 'link', sections: 'layers', journal: 'clock', duplicates: 'copy' };

export default function StaffNav({ staff, project, active, onSignOut }) {
  const { t } = useI18n();
  const owner = project ? staff.isOwner(project.id) : false;
  const items = project ? ['cohort', 'needs', ...(owner ? ['team', 'project', 'sections', 'journal', 'duplicates'] : [])] : [];
  return (
    <nav className="sidenav" aria-label={t('staff.menu')}>
      <Link className={`sideitem ${active === 'home' ? 'on' : ''}`} href="/staff"><Icon name="grid" />{t('staff.all_projects')}</Link>
      {staff.profile?.is_admin ? <Link className={`sideitem ${active === 'admin' ? 'on' : ''}`} href="/staff?tab=admin"><Icon name="shield" />{t('staff.tab_admin')}</Link> : null}
      {project ? (
        <>
          <p className="sidehead"><span className="sidedot" style={{ background: projectColor(project.id) }} />{safeStr(project.name)}</p>
          {items.map(k => (
            <Link key={k} className={`sideitem ${active === k ? 'on' : ''}`} href={`/staff?p=${project.id}&tab=${k}`}><Icon name={ICONS[k]} />{t(`staff.tab_${k}`)}</Link>
          ))}
        </>
      ) : null}
      <div className="sidefoot">
        <Link className={`sideitem ${active === 'profile' ? 'on' : ''}`} href="/staff/profile"><Icon name="user" />{t('staff.profile')}</Link>
        {onSignOut ? <button type="button" className="sideitem" onClick={onSignOut}><Icon name="logout" />{t('staff.sign_out')}</button> : null}
      </div>
    </nav>
  );
}

// « Mes droits » : administrateur, et rôle dans chaque projet (owner, coach, ou les deux)
import { useI18n } from '../../lib/i18n';
import { safeStr } from '../../lib/safe';
import { projectColor } from '../../lib/projectColor';

export default function RightsCard({ staff }) {
  const { t } = useI18n();
  const admin = !!staff.profile?.is_admin;
  const rows = (staff.projects || []).map(p => ({ p, roles: (staff.roles?.[p.id] || []).slice().sort().reverse() })).filter(r => r.roles.length);
  return (
    <section className="card rights">
      <h2>{t('myprofile.rights_title')}</h2>
      {admin ? (
        <div className="rightrow">
          <span className="pill coral">{t('role.admin')}</span>
          <p>{t('myprofile.rights_admin')}</p>
        </div>
      ) : null}
      {rows.map(({ p, roles }) => (
        <div key={p.id} className="rightrow">
          <span className="sq" style={{ background: projectColor(staff.projects, p.id) }} />
          <div>
            <b>{safeStr(p.name)}</b>
            <div className="chips">{roles.map(r => <span key={r} className="pill">{t(`role.${r}`)}</span>)}</div>
            {roles.map(r => <p key={r} className="muted small">{t(`myprofile.rights_${r}`)}</p>)}
          </div>
        </div>
      ))}
      {!admin && rows.length === 0 ? <p className="empty-inline">{t('myprofile.rights_none')}</p> : null}
    </section>
  );
}

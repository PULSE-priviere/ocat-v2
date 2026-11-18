// Mon profil : prénom et nom affichés en haut à droite
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useI18n } from '../../lib/i18n';
import { useStaff } from '../../lib/useStaff';
import { sb } from '../../lib/supabase';
import { fullName } from '../../lib/names';
import { safeStr } from '../../lib/safe';
import appConfig from '../../app.config';

export default function MyProfile() {
  const { t } = useI18n();
  const staff = useStaff();
  const [f, setF] = useState({ first_name: '', last_name: '' });
  const [state, setState] = useState('');
  useEffect(() => { if (staff.profile) setF({ first_name: safeStr(staff.profile.first_name), last_name: safeStr(staff.profile.last_name) }); }, [staff.profile]);
  if (staff.loading) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;
  const submit = async e => {
    e.preventDefault(); setState('');
    const first = f.first_name.trim(), last = f.last_name.trim();
    const { error } = await sb().from('profiles').update({ first_name: first, last_name: last, name: `${first} ${last}` }).eq('id', staff.profile.id);
    if (error) return setState('error');
    setState('saved'); staff.refresh();
  };
  return (
    <Layout home="/staff" title={t('myprofile.title')} identity={{ org: appConfig.orgName, person: fullName(staff.profile), href: '/staff/profile' }}>
      <div className="narrow">
        <a className="link" href="/staff">← {t('myprofile.back')}</a>
        <h1>{t('myprofile.title')}</h1>
        <p className="lead">{t('myprofile.intro')}</p>
        <form className="card form" onSubmit={submit}>
          <label>{t('profile.label.email')}<input value={safeStr(staff.profile.email)} disabled /></label>
          <label>{t('profile.label.first_name')}<input required value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></label>
          <label>{t('profile.label.last_name')}<input required value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} /></label>
          {state === 'saved' ? <p className="ok">{t('myprofile.saved')}</p> : null}
          {state === 'error' ? <p className="error">{t('errors.server_error')}</p> : null}
          <button className="btn primary">{t('profile.save')}</button>
        </form>
      </div>
    </Layout>
  );
}

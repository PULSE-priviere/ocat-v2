// F24 projets, F25 comptes et rôles, F27 administrateurs
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import { fullName } from '../../lib/names';

export default function Admin({ projects, reload }) {
  const { t, lang } = useI18n();
  const [proj, setProj] = useState({ name: '', cohort: '' });
  const [inv, setInv] = useState({ email: '', firstName: '', lastName: '', projectId: '', role: 'owner', makeAdmin: false });
  const [profiles, setProfiles] = useState([]);
  const [msg, setMsg] = useState('');
  const loadProfiles = () => sb().from('profiles').select('id, email, name, first_name, last_name, is_admin').order('email').then(({ data }) => setProfiles(data || []));
  useEffect(() => { loadProfiles(); }, []);

  const createProject = async e => {
    e.preventDefault(); setMsg('');
    const { data: fw } = await sb().from('frameworks').select('id').limit(1).maybeSingle();
    if (!fw) return setMsg('errors.no_framework');
    const { error } = await sb().from('projects').insert({ name: proj.name.trim(), cohort: proj.cohort.trim() || null, framework_id: fw.id });
    if (error) setMsg('errors.server_error'); else { setProj({ name: '', cohort: '' }); reload(); }
  };
  const archive = async p => { await sb().from('projects').update({ archived: !p.archived }).eq('id', p.id); reload(); };
  const invite = async e => {
    e.preventDefault(); setMsg('');
    try { await staffApi('invite', { ...inv, projectId: inv.projectId || null, lang }); setMsg('team.invited'); loadProfiles(); reload(); }
    catch (err) { setMsg(`errors.${err.message}`); }
  };
  const toggleAdmin = async p => {
    const { error } = await sb().from('profiles').update({ is_admin: !p.is_admin }).eq('id', p.id);
    if (error) setMsg(error.message.includes('last_admin') ? 'errors.last_admin' : 'errors.server_error'); else loadProfiles();
  };

  return (
    <>
      <h2>{t('admin.projects')}</h2>
      <table className="table"><tbody>{projects.map(p => (
        <tr key={p.id}><td>{safeStr(p.name)}{p.cohort ? <small className="muted"> · {safeStr(p.cohort)}</small> : null}</td>
          <td>{p.archived ? t('admin.archived') : t('admin.active')}</td>
          <td className="right"><button className="btn" onClick={() => archive(p)}>{p.archived ? t('admin.unarchive') : t('admin.archive')}</button></td></tr>
      ))}</tbody></table>
      <form className="card form row" onSubmit={createProject}>
        <label>{t('admin.project_name')}<input required value={proj.name} onChange={e => setProj({ ...proj, name: e.target.value })} /></label>
        <label>{t('admin.cohort')}<input value={proj.cohort} onChange={e => setProj({ ...proj, cohort: e.target.value })} /></label>
        <button className="btn primary">{t('admin.create_project')}</button>
      </form>

      <h2>{t('admin.accounts')}</h2>
      <form className="card form row" onSubmit={invite}>
        <label>{t('entry.email')}<input type="email" required value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} /></label>
        <label>{t('profile.label.first_name')}<input required value={inv.firstName} onChange={e => setInv({ ...inv, firstName: e.target.value })} /></label>
        <label>{t('profile.label.last_name')}<input required value={inv.lastName} onChange={e => setInv({ ...inv, lastName: e.target.value })} /></label>
        <label>{t('admin.project')}<select value={inv.projectId} onChange={e => setInv({ ...inv, projectId: e.target.value })}>
          <option value="">—</option>{projects.map(p => <option key={p.id} value={p.id}>{safeStr(p.name)}</option>)}
        </select></label>
        <label>{t('admin.role')}<select value={inv.role} onChange={e => setInv({ ...inv, role: e.target.value })}>
          <option value="owner">{t('role.owner')}</option><option value="coach">{t('role.coach')}</option>
        </select></label>
        <label className="check"><input type="checkbox" checked={inv.makeAdmin} onChange={e => setInv({ ...inv, makeAdmin: e.target.checked })} /><span>{t('role.admin')}</span></label>
        <button className="btn primary">{t('admin.invite')}</button>
      </form>
      {msg ? <p className={msg.startsWith('errors') ? 'error' : 'ok'}>{t(msg)}</p> : null}
      <table className="table"><tbody>{profiles.map(p => (
        <tr key={p.id}><td>{fullName(p)}<br /><small className="muted">{safeStr(p.email)}</small></td>
          <td><label className="check"><input type="checkbox" checked={p.is_admin} onChange={() => toggleAdmin(p)} /><span>{t('role.admin')}</span></label></td></tr>
      ))}</tbody></table>
    </>
  );
}

// F25 inviter / révoquer les coachs ; F30 coachs proposés à l'OSC
import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import { fullName } from '../../lib/names';
import Check from '../Check';

export default function Team({ project, members, isAdmin, reload }) {
  const { t, lang } = useI18n();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const invite = async e => {
    e.preventDefault(); setMsg(''); setBusy(true);
    try { await staffApi('invite', { ...form, projectId: project.id, role: 'coach', lang }); setMsg('team.invited'); setForm({ email: '', firstName: '', lastName: '' }); reload(); }
    catch (err) { setMsg(`errors.${err.message}`); }
    setBusy(false);
  };
  const revoke = async (m, role = 'coach') => {
    if (!window.confirm(t('team.revoke_confirm', { name: m.profile?.name || m.profile?.email }))) return;
    await sb().from('memberships').delete().match({ user_id: m.user_id, project_id: project.id, role });
    reload();
  };
  const toggleOffered = async (m, v) => {
    const { error } = await sb().from('memberships').update({ offered_to_osc: v }).match({ user_id: m.user_id, project_id: project.id, role: 'coach' });
    if (error) throw error;
    reload();
  };
  const list = role => members.filter(m => m.role === role);
  return (
    <>
      <h2>{t('team.coaches')}</h2>
      {list('coach').length === 0 ? <p className="empty-inline">{t('team.no_coach')}</p> : (
        <table className="table"><tbody>{list('coach').map(m => (
          <tr key={m.user_id}>
            <td>{fullName(m.profile)}<br /><small className="muted">{safeStr(m.profile?.email)}</small></td>
            <td><Check checked={m.offered_to_osc} onChange={v => toggleOffered(m, v)} label={t('team.offered')} /></td>
            <td className="right"><button className="btn danger small" onClick={() => revoke(m)}>{t('team.revoke')}</button></td>
          </tr>
        ))}</tbody></table>
      )}
      <form className="card form row" onSubmit={invite}>
        <label>{t('entry.email')}<input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>{t('profile.label.first_name')}<input required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></label>
        <label>{t('profile.label.last_name')}<input required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></label>
        <button className="btn primary" aria-busy={busy} disabled={busy}>{t('team.invite_coach')}</button>
      </form>
      {msg ? <p className={msg.startsWith('errors') ? 'error' : 'ok'}>{t(msg)}</p> : null}
      <h2>{t('team.owners')}</h2>
      <ul className="plain">{list('owner').map(m => (
        <li key={m.user_id}>{safeStr(m.profile?.name || m.profile?.email)}{' '}
          {isAdmin ? <button className="btn danger" onClick={() => revoke(m, 'owner')}>{t('team.revoke')}</button> : null}</li>
      ))}</ul>
    </>
  );
}

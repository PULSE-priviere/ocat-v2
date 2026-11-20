// Équipe d'un projet. Un owner invite, attribue les rôles (owner et/ou coach, jamais administrateur) et révoque ;
// un coach consulte seulement. Une personne peut cumuler les deux rôles (chef de projet qui accompagne aussi).
import { useState } from 'react';
import Check from '../Check';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import { fullName } from '../../lib/names';

function group(members) {
  const by = {};
  members.forEach(m => {
    const x = by[m.user_id] || (by[m.user_id] = { id: m.user_id, profile: m.profile, roles: new Set(), offered: true });
    x.roles.add(m.role);
    if (m.role === 'coach') x.offered = m.offered_to_osc !== false;
  });
  return Object.values(by).sort((a, b) => (b.roles.has('owner') - a.roles.has('owner')) || fullName(a.profile).localeCompare(fullName(b.profile)));
}

export default function Team({ project, members, owner, isAdmin, reload, embedded = false }) {
  const { t, lang } = useI18n();
  const people = group(members);
  const ownersCount = people.filter(p => p.roles.has('owner')).length;
  const [inv, setInv] = useState({ email: '', firstName: '', lastName: '', owner: false, coach: true });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState('');
  const fail = e => setMsg(String(e?.message || '').includes('last_owner') ? 'errors.last_owner_project' : 'errors.server_error');

  // Les cases se cochent tout de suite ; en cas de refus de la base, elles reviennent en arrière (voir Check)
  const setRole = async (p, role, on) => {
    setMsg('');
    const q = sb().from('memberships');
    const r = on ? await q.insert({ user_id: p.id, project_id: project.id, role, offered_to_osc: true }) : await q.delete().match({ user_id: p.id, project_id: project.id, role });
    if (r.error) { fail(r.error); throw r.error; }
    reload();
  };
  const setOffered = async (p, v) => {
    const { error } = await sb().from('memberships').update({ offered_to_osc: v }).match({ user_id: p.id, project_id: project.id, role: 'coach' });
    if (error) { fail(error); throw error; }
    reload();
  };
  const revoke = async p => {
    if (!window.confirm(t('team.revoke_confirm', { name: fullName(p.profile) }))) return;
    setMsg('');
    const { error } = await sb().from('memberships').delete().match({ user_id: p.id, project_id: project.id });
    if (error) return fail(error);
    reload();
  };
  const resend = async p => {
    setMsg(''); setResending(p.id);
    try { const r = await staffApi('resend_invite', { userId: p.id, projectId: project.id, lang }); setMsg(r.mailSent ? 'team.resent' : r.reason === 'invite' ? 'team.invite_failed' : 'team.mail_failed'); }
    catch (err) { setMsg(`errors.${err.message}`); }
    setResending('');
  };
  const invite = async e => {
    e.preventDefault(); setMsg('');
    const roles = [inv.owner && 'owner', inv.coach && 'coach'].filter(Boolean);
    if (!roles.length) return setMsg('team.need_role');
    setBusy(true);
    try { const r = await staffApi('invite', { email: inv.email, firstName: inv.firstName, lastName: inv.lastName, roles, projectId: project.id, lang }); setMsg(r.mailSent === false ? (r.reason === 'invite' ? 'team.invite_failed' : 'team.mail_failed') : 'team.invited'); setInv({ email: '', firstName: '', lastName: '', owner: false, coach: true }); reload(); }
    catch (err) { setMsg(`errors.${err.message}`); }
    setBusy(false);
  };

  const Box = embedded ? 'div' : 'section';
  return (
    <>
      {!owner ? <p className="callout slim"><span>{t('team.read_only')}</span></p> : null}
      <Box className={embedded ? '' : 'card'}>
        {people.length === 0 ? <p className="empty-inline">{t('admin.no_members')}</p> : (
          <table className="table">
            <thead><tr><th>{t('admin.person')}</th><th>{t('admin.role')}</th>{owner ? <th>{t('team.offered_col')}</th> : null}{owner ? <th /> : null}</tr></thead>
            <tbody>{people.map(p => {
              const onlyOwner = p.roles.has('owner') && ownersCount === 1 && !isAdmin;
              return (
                <tr key={p.id}>
                  <td>{fullName(p.profile)}<br /><small className="muted">{safeStr(p.profile?.email)}</small></td>
                  <td>
                    {owner ? (
                      <div className="rolechecks">
                        <Check checked={p.roles.has('owner')} label={t('role.owner')} disabled={(p.roles.has('owner') && p.roles.size === 1) || onlyOwner} onChange={v => setRole(p, 'owner', v)} />
                        <Check checked={p.roles.has('coach')} label={t('role.coach')} disabled={p.roles.has('coach') && p.roles.size === 1} onChange={v => setRole(p, 'coach', v)} />
                      </div>
                    ) : <div className="chips">{[...p.roles].sort().reverse().map(r => <span key={r} className="pill">{t(`role.${r}`)}</span>)}</div>}
                  </td>
                  {owner ? <td>{p.roles.has('coach') ? <Check checked={p.offered} onChange={v => setOffered(p, v)} label={t('team.offered')} /> : <span className="muted small">—</span>}</td> : null}
                  {owner ? <td className="right"><button className="btn small" aria-busy={resending === p.id} disabled={!!resending} onClick={() => resend(p)}>{t('team.resend')}</button> <button className="btn danger small" onClick={() => revoke(p)}>{t('team.revoke')}</button></td> : null}
                </tr>
              );
            })}</tbody>
          </table>
        )}
        {owner ? <p className="muted small">{t('team.role_hint')}</p> : null}
      </Box>

      {owner ? (
        <>
          <h3 className="subh">{t('team.invite_title')}</h3>
          <form className={embedded ? 'form' : 'card form'} onSubmit={invite}>
            <div className="form row">
              <label>{t('entry.email')}<input type="email" required value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} /></label>
              <label>{t('profile.label.first_name')}<input required value={inv.firstName} onChange={e => setInv({ ...inv, firstName: e.target.value })} /></label>
              <label>{t('profile.label.last_name')}<input required value={inv.lastName} onChange={e => setInv({ ...inv, lastName: e.target.value })} /></label>
            </div>
            <div className="toolbar" style={{ margin: 0 }}>
              <span className="small muted">{t('admin.role')}</span>
              <label className="check"><input type="checkbox" checked={inv.coach} onChange={e => setInv({ ...inv, coach: e.target.checked })} /><span>{t('role.coach')}</span></label>
              <label className="check"><input type="checkbox" checked={inv.owner} onChange={e => setInv({ ...inv, owner: e.target.checked })} /><span>{t('role.owner')}</span></label>
              <span className="grow" />
              <button className="btn primary" aria-busy={busy} disabled={busy}>{t('team.invite')}</button>
            </div>
          </form>
        </>
      ) : null}
      {msg ? <p className={msg.startsWith('errors') || msg === 'team.need_role' || msg === 'team.mail_failed' || msg === 'team.invite_failed' ? 'error' : 'ok'}>{t(msg)}</p> : null}
    </>
  );
}

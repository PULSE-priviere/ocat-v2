// Administration : projets (membres, rôles, accès), comptes (administrateurs), connexion Airtable pour tous les projets
import { useCallback, useEffect, useState } from 'react';
import Icon from '../Icon';
import Check from '../Check';
import Team from './Team';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import { fullName } from '../../lib/names';
import { projectColor } from '../../lib/projectColor';
import { downloadCsv } from '../../lib/csv';

export default function Admin({ projects, reload }) {
  const { t } = useI18n();
  const [view, setView] = useState('projects');
  const [sel, setSel] = useState('');
  const [mems, setMems] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const load = useCallback(async () => {
    const [{ data: m }, { data: p }] = await Promise.all([
      sb().from('memberships').select('user_id, project_id, role, offered_to_osc, profile:profiles(id, email, name, first_name, last_name)'),
      sb().from('profiles').select('id, email, name, first_name, last_name, is_admin').order('email'),
    ]);
    setMems(m || []); setProfiles(p || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const project = projects.find(p => p.id === sel);
  return (
    <>
      <div className="seg big" role="tablist">
        {['projects', 'accounts', 'airtable'].map(k => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => { setView(k); setSel(''); }}>{t(`admin.v_${k}`)}</button>
        ))}
      </div>
      {view === 'projects' && (project
        ? <ProjectAdmin project={project} projects={projects} mems={mems.filter(m => m.project_id === project.id)} setMems={setMems} onBack={() => setSel('')} onChanged={() => { load(); reload(); }} />
        : <ProjectList projects={projects} mems={mems} onOpen={setSel} onCreated={reload} />)}
      {view === 'accounts' && <Accounts profiles={profiles} setProfiles={setProfiles} mems={mems} projects={projects} onChanged={load} />}
      {view === 'airtable' && <AirtableSettings />}
    </>
  );
}

// Liste des projets : un clic ouvre son administration
function ProjectList({ projects, mems, onOpen, onCreated }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name: '', cohort: '', zone: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const names = (id, role) => mems.filter(m => m.project_id === id && m.role === role).map(m => fullName(m.profile));
  const create = async e => {
    e.preventDefault(); setBusy(true); setMsg('');
    const { data: fw } = await sb().from('frameworks').select('id').limit(1).maybeSingle();
    if (!fw) { setBusy(false); return setMsg('errors.no_framework'); }
    const { error } = await sb().from('projects').insert({ name: f.name.trim(), cohort: f.cohort.trim() || null, zone: f.zone.trim() || null, framework_id: fw.id });
    setBusy(false);
    if (error) return setMsg('errors.server_error');
    setF({ name: '', cohort: '', zone: '' }); onCreated();
  };
  return (
    <>
      <div className="adminlist">
        {projects.map(p => {
          const ow = names(p.id, 'owner'), co = names(p.id, 'coach');
          return (
            <button key={p.id} type="button" className="adminrow" onClick={() => onOpen(p.id)}>
              <span className="sq lg" style={{ background: projectColor(projects, p.id) }} />
              <span className="ar-main"><b>{safeStr(p.name)}</b><span className="muted small">{[p.zone, p.cohort].filter(Boolean).join(' · ') || '—'}</span></span>
              <span className="ar-col"><span className="muted small">{t('staff.owners')}</span>{ow.join(', ') || '—'}</span>
              <span className="ar-col"><span className="muted small">{t('staff.coaches')}</span>{co.length ? `${co.length} · ${co.slice(0, 2).join(', ')}${co.length > 2 ? '…' : ''}` : '—'}</span>
              <span className={`pill ${p.archived ? 'amber' : 'green'}`}>{t(p.archived ? 'admin.archived' : 'admin.active')}</span>
              <Icon name="arrow" size={16} />
            </button>
          );
        })}
      </div>
      <h2>{t('admin.create_project')}</h2>
      <form className="card form row" onSubmit={create}>
        <label>{t('admin.project_name')}<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>{t('staff.zone')}<input value={f.zone} onChange={e => setF({ ...f, zone: e.target.value })} /></label>
        <label>{t('admin.cohort')}<input value={f.cohort} onChange={e => setF({ ...f, cohort: e.target.value })} /></label>
        <button className="btn primary" aria-busy={busy} disabled={busy}><Icon name="plus" />{t('admin.create_project')}</button>
      </form>
      {msg ? <p className="error">{t(msg)}</p> : null}
    </>
  );
}

// Administration d'un projet : informations, archivage, équipe (mêmes règles que l'onglet Équipe, sans la restriction du dernier owner)
function ProjectAdmin({ project, projects, mems, onBack, onChanged }) {
  const { t } = useI18n();
  const [info, setInfo] = useState({ name: project.name || '', cohort: project.cohort || '', zone: project.zone || '' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { setInfo({ name: project.name || '', cohort: project.cohort || '', zone: project.zone || '' }); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveInfo = async e => {
    e.preventDefault(); setBusy('info'); setMsg('');
    const { error } = await sb().from('projects').update({ name: info.name.trim(), cohort: info.cohort.trim() || null, zone: info.zone.trim() || null }).eq('id', project.id);
    setBusy(''); setMsg(error ? 'errors.server_error' : 'admin.saved'); if (!error) onChanged();
  };
  const archive = async () => { setBusy('archive'); await sb().from('projects').update({ archived: !project.archived }).eq('id', project.id); setBusy(''); onChanged(); };
  return (
    <>
      <button className="link" onClick={onBack}>← {t('admin.back')}</button>
      <div className="pc-head admin-head">
        <span className="sq lg" style={{ background: projectColor(projects, project.id) }} />
        <div><h2 style={{ margin: 0 }}>{safeStr(project.name)}</h2><p className="muted small" style={{ margin: 0 }}>{[project.zone, project.cohort].filter(Boolean).join(' · ') || '—'}</p></div>
        <span className="grow" />
        <button className={`btn ${project.archived ? '' : 'warn'}`} aria-busy={busy === 'archive'} onClick={archive}>{t(project.archived ? 'admin.unarchive' : 'admin.archive')}</button>
      </div>
      <section className="card">
        <h2>{t('admin.members')}</h2>
        <Team project={project} members={mems} owner isAdmin embedded reload={onChanged} />
      </section>
      <section className="card">
        <h2>{t('admin.edit_project')}</h2>
        <form className="form row" onSubmit={saveInfo}>
          <label>{t('admin.project_name')}<input required value={info.name} onChange={e => setInfo({ ...info, name: e.target.value })} /></label>
          <label>{t('staff.zone')}<input value={info.zone} onChange={e => setInfo({ ...info, zone: e.target.value })} /></label>
          <label>{t('admin.cohort')}<input value={info.cohort} onChange={e => setInfo({ ...info, cohort: e.target.value })} /></label>
          <button className="btn" aria-busy={busy === 'info'} disabled={busy === 'info'}>{t('common.save')}</button>
        </form>
      </section>
      {msg ? <p className={msg.startsWith('errors') ? 'error' : 'ok'}>{t(msg)}</p> : null}
    </>
  );
}

// Comptes : rôles par projet, droit d'administrateur, invitation d'un administrateur
function Accounts({ profiles, setProfiles, mems, projects, onChanged }) {
  const { t, lang } = useI18n();
  const [inv, setInv] = useState({ email: '', firstName: '', lastName: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pname = id => projects.find(p => p.id === id)?.name || '';
  const toggleAdmin = async (p, v) => {
    const { error } = await sb().from('profiles').update({ is_admin: v }).eq('id', p.id);
    if (error) { setMsg(error.message.includes('last_admin') ? 'errors.last_admin' : 'errors.server_error'); throw error; }
    setProfiles(list => list.map(x => (x.id === p.id ? { ...x, is_admin: v } : x)));
  };
  const invite = async e => {
    e.preventDefault(); setBusy(true); setMsg('');
    try { await staffApi('invite', { ...inv, makeAdmin: true, lang }); setInv({ email: '', firstName: '', lastName: '' }); setMsg('team.invited'); onChanged(); }
    catch (x) { setMsg(`errors.${x.message}`); }
    setBusy(false);
  };
  return (
    <>
      <section className="card">
        <table className="table">
          <thead><tr><th>{t('admin.person')}</th><th>{t('admin.projects_roles')}</th><th>{t('role.admin')}</th></tr></thead>
          <tbody>{profiles.map(p => (
            <tr key={p.id}>
              <td>{fullName(p)}<br /><small className="muted">{safeStr(p.email)}</small></td>
              <td><div className="chips">{mems.filter(m => m.user_id === p.id).map(m => (
                <span key={`${m.project_id}-${m.role}`} className="pill"><span className="sq" style={{ background: projectColor(projects, m.project_id) }} />{pname(m.project_id)} · {t(`role.${m.role}`)}</span>
              ))}</div></td>
              <td><Check checked={p.is_admin} onChange={v => toggleAdmin(p, v)} label={t('role.admin')} /></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <h2>{t('admin.invite_admin')}</h2>
      <form className="card form row" onSubmit={invite}>
        <label>{t('entry.email')}<input type="email" required value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} /></label>
        <label>{t('profile.label.first_name')}<input required value={inv.firstName} onChange={e => setInv({ ...inv, firstName: e.target.value })} /></label>
        <label>{t('profile.label.last_name')}<input required value={inv.lastName} onChange={e => setInv({ ...inv, lastName: e.target.value })} /></label>
        <button className="btn primary" aria-busy={busy} disabled={busy}>{t('admin.invite')}</button>
      </form>
      {msg ? <p className={msg.startsWith('errors') ? 'error' : 'ok'}>{t(msg)}</p> : null}
    </>
  );
}

// Connexion Airtable unique pour tous les projets (colonne « Projet » dans chaque ligne)
function AirtableSettings() {
  const { t } = useI18n();
  const [st, setSt] = useState(null);
  const [f, setF] = useState({ token: '', baseId: '', table: 'Scores', auto: true });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [prog, setProg] = useState(null);
  const load = useCallback(async () => {
    try { const r = await staffApi('airtable_get'); setSt(r); setF(x => ({ ...x, token: '', baseId: r.baseId || '', table: r.table || 'Scores', auto: r.auto !== false })); }
    catch { setSt({ configured: false }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (name, fn) => {
    setBusy(name); setMsg(null); setProg(null);
    try { await fn(); } catch (e) { setMsg({ kind: 'error', text: e.message === 'airtable_not_configured' ? t('mex.not_configured') : t('mex.error', { msg: e.detail || t(`errors.${e.message}`) }) }); }
    setBusy('');
  };
  const save = e => { e.preventDefault(); run('save', async () => { await staffApi('airtable_save', f); setMsg({ kind: 'ok', text: t('admin.at_saved') }); await load(); }); };
  const test = () => run('test', async () => { await staffApi('airtable_test'); setMsg({ kind: 'ok', text: t('admin.at_test_ok') }); });
  const setup = () => run('setup', async () => { const r = await staffApi('scores_setup', { all: true }); setMsg({ kind: 'ok', text: t(r.exists ? 'mex.exists' : 'mex.done_setup') }); });
  const sync = () => run('sync', async () => {
    let offset = 0, sent = 0;
    for (;;) { const r = await staffApi('scores_sync', { all: true, offset }); sent += r.sent; setProg({ done: r.done, total: r.total }); if (r.next == null) break; offset = r.next; }
    setMsg({ kind: 'ok', text: t('mex.done_sync', { n: sent }) });
  });
  const csv = () => run('csv', async () => {
    let offset = 0, all = [], fields = [];
    for (;;) { const r = await staffApi('scores_csv', { all: true, offset }); fields = r.fields; all = all.concat(r.rows); setProg({ done: r.done, total: r.total }); if (r.next == null) break; offset = r.next; }
    downloadCsv('suivi-evaluation-tous-projets.csv', [fields, ...all.map(row => fields.map(k => row[k] ?? ''))]);
  });
  return (
    <>
      <section className={`feature ${st?.configured ? 'grad-blue' : 'grad-off'}`}>
        <div className="feature-head">
          <span className="feature-icon"><Icon name="db" size={19} /></span>
          <div>
            <h2>{t('admin.at_title')}</h2>
            <p>{!st ? t('common.loading') : st.configured ? t('admin.at_status_ok', { base: st.baseId, table: st.table }) : t('admin.at_status_none')}{st?.source === 'env' ? ` ${t('admin.at_from_env')}` : ''}</p>
          </div>
        </div>
        {st?.configured ? (
          <div className="feature-actions" style={{ marginTop: '1rem' }}>
            <button className="btn white" aria-busy={busy === 'sync'} disabled={!!busy} onClick={sync}>{t('admin.at_sync_all')}</button>
            <button className="btn glass" aria-busy={busy === 'test'} disabled={!!busy} onClick={test}>{t('admin.at_test')}</button>
            <button className="btn glass" aria-busy={busy === 'setup'} disabled={!!busy} onClick={setup}>{t('mex.setup')}</button>
            <button className="btn glass" aria-busy={busy === 'csv'} disabled={!!busy} onClick={csv}>{t('admin.at_csv_all')}</button>
            {prog ? <span className="small">{t('mex.progress', prog)}</span> : null}
          </div>
        ) : null}
      </section>
      {msg ? <p className={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</p> : null}
      <section className="card">
        <h2>{t('admin.at_settings')}</h2>
        <p className="muted small">{t('admin.at_lead')}</p>
        <form className="form" onSubmit={save}>
          <div className="form row">
            <label>{t('admin.at_token')}<input type="password" autoComplete="off" placeholder={st?.tokenHint || 'pat…'} value={f.token} onChange={e => setF({ ...f, token: e.target.value })} /></label>
            <label>{t('admin.at_base')}<input required placeholder="app…" value={f.baseId} onChange={e => setF({ ...f, baseId: e.target.value })} /></label>
            <label>{t('admin.at_table')}<input value={f.table} onChange={e => setF({ ...f, table: e.target.value })} /></label>
          </div>
          <p className="muted small">{t('admin.at_token_hint')}</p>
          <label className="check"><input type="checkbox" checked={f.auto} onChange={e => setF({ ...f, auto: e.target.checked })} /><span>{t('admin.at_auto')}</span></label>
          <button className="btn primary" aria-busy={busy === 'save'} disabled={!!busy}>{t('common.save')}</button>
        </form>
      </section>
    </>
  );
}

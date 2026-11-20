// Administration : projets (membres, rôles, accès), comptes (administrateurs), connexion Airtable pour tous les projets
import { useCallback, useEffect, useState } from 'react';
import Icon from '../Icon';
import Check from '../Check';
import Team from './Team';
import MailSettings from './MailSettings';
import CountryPicker from '../CountryPicker';
import { countryName } from '../../lib/countries';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import { fullName } from '../../lib/names';
import { projectColor } from '../../lib/projectColor';
import { useAirtableActions } from '../../lib/airtableActions';
import { airtableMsg } from '../../lib/airtableMsg';

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
        {['projects', 'accounts', 'airtable', 'email'].map(k => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => { setView(k); setSel(''); }}>{t(`admin.v_${k}`)}</button>
        ))}
      </div>
      {view === 'projects' && (project
        ? <ProjectAdmin project={project} projects={projects} mems={mems.filter(m => m.project_id === project.id)} setMems={setMems} onBack={() => setSel('')} onChanged={() => { load(); reload(); }} />
        : <ProjectList projects={projects} mems={mems} onOpen={setSel} onCreated={reload} />)}
      {view === 'accounts' && <Accounts profiles={profiles} setProfiles={setProfiles} mems={mems} projects={projects} onChanged={load} />}
      {view === 'airtable' && <AirtableSettings />}
      {view === 'email' && <MailSettings />}
    </>
  );
}

// Liste des projets : un clic ouvre son administration
function ProjectList({ projects, mems, onOpen, onCreated }) {
  const { t } = useI18n();
  const { lang } = useI18n();
  const [f, setF] = useState({ name: '', cohort: '', zone: '', countries: [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const names = (id, role) => mems.filter(m => m.project_id === id && m.role === role).map(m => fullName(m.profile));
  const create = async e => {
    e.preventDefault(); setBusy(true); setMsg('');
    const { data: fw } = await sb().from('frameworks').select('id').limit(1).maybeSingle();
    if (!fw) { setBusy(false); return setMsg('errors.no_framework'); }
    const { error } = await sb().from('projects').insert({ name: f.name.trim(), cohort: f.cohort.trim() || null, zone: f.zone.trim() || null, countries: f.countries, framework_id: fw.id });
    setBusy(false);
    if (error) return setMsg('errors.server_error');
    setF({ name: '', cohort: '', zone: '', countries: [] }); onCreated();
  };
  return (
    <>
      <div className="adminlist">
        {projects.map(p => {
          const ow = names(p.id, 'owner'), co = names(p.id, 'coach');
          return (
            <button key={p.id} type="button" className="adminrow" onClick={() => onOpen(p.id)}>
              <span className="sq lg" style={{ background: projectColor(projects, p.id) }} />
              <span className="ar-main"><b>{safeStr(p.name)}</b><span className="muted small">{[p.zone, p.cohort, (p.countries || []).map(c => countryName(c, lang)).join(', ')].filter(Boolean).join(' · ') || '—'}</span></span>
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
        <div className="span-all"><span className="fieldlabel">{t('countries.title')}</span><CountryPicker value={f.countries} onChange={countries => setF({ ...f, countries })} /><p className="muted small">{t('countries.hint')}</p></div>
        <button className="btn primary" aria-busy={busy} disabled={busy}><Icon name="plus" />{t('admin.create_project')}</button>
      </form>
      {msg ? <p className="error">{t(msg)}</p> : null}
    </>
  );
}

// Administration d'un projet : informations, archivage, équipe (mêmes règles que l'onglet Équipe, sans la restriction du dernier owner)
function ProjectAdmin({ project, projects, mems, onBack, onChanged }) {
  const { t } = useI18n();
  const [info, setInfo] = useState({ name: project.name || '', cohort: project.cohort || '', zone: project.zone || '', countries: project.countries || [] });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { setInfo({ name: project.name || '', cohort: project.cohort || '', zone: project.zone || '', countries: project.countries || [] }); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveInfo = async e => {
    e.preventDefault(); setBusy('info'); setMsg('');
    const { error } = await sb().from('projects').update({ name: info.name.trim(), cohort: info.cohort.trim() || null, zone: info.zone.trim() || null, countries: info.countries }).eq('id', project.id);
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
          <div className="span-all"><span className="fieldlabel">{t('countries.title')}</span><CountryPicker value={info.countries} onChange={countries => setInfo({ ...info, countries })} /><p className="muted small">{t('countries.hint')}</p></div>
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
  const [resending, setResending] = useState('');
  const [msg, setMsg] = useState('');
  const resend = async p => {
    setMsg(''); setResending(p.id);
    const first = mems.find(m => m.user_id === p.id);
    try { const r = await staffApi('resend_invite', { userId: p.id, projectId: p.is_admin ? null : first?.project_id, lang }); setMsg(r.mailSent ? 'team.resent' : r.reason === 'invite' ? 'team.invite_failed' : 'team.mail_failed'); }
    catch (x) { setMsg(`errors.${x.message}`); }
    setResending('');
  };
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
          <thead><tr><th>{t('admin.person')}</th><th>{t('admin.projects_roles')}</th><th>{t('role.admin')}</th><th /></tr></thead>
          <tbody>{profiles.map(p => (
            <tr key={p.id}>
              <td>{fullName(p)}<br /><small className="muted">{safeStr(p.email)}</small></td>
              <td><div className="chips">{mems.filter(m => m.user_id === p.id).map(m => (
                <span key={`${m.project_id}-${m.role}`} className="pill"><span className="sq" style={{ background: projectColor(projects, m.project_id) }} />{pname(m.project_id)} · {t(`role.${m.role}`)}</span>
              ))}</div></td>
              <td><Check checked={p.is_admin} onChange={v => toggleAdmin(p, v)} label={t('role.admin')} /></td>
              <td className="right">{p.is_admin || mems.some(m => m.user_id === p.id) ? <button className="btn small" aria-busy={resending === p.id} disabled={!!resending} onClick={() => resend(p)}>{t('team.resend')}</button> : null}</td>
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
      {msg ? <p className={msg.startsWith('errors') || msg === 'team.mail_failed' || msg === 'team.invite_failed' ? 'error' : 'ok'}>{t(msg)}</p> : null}
    </>
  );
}

// Connexion Airtable unique pour tous les projets : trois tables reliées, chaque ligne porte son projet
function AirtableSettings() {
  const { t } = useI18n();
  const [st, setSt] = useState(null);
  const [f, setF] = useState({ token: '', baseId: '', mode: 'simple', table: 'Scores', tables: { organisations: 'Organisations', diagnostics: 'Diagnostics', accompagnement: 'Accompagnement' }, auto: true });
  const { busy, msg, prog, setMsg, run, setup, sync, csv } = useAirtableActions({ all: true }, 'suivi-evaluation-tous-projets');
  const load = useCallback(async () => {
    try { const r = await staffApi('airtable_get'); setSt(r); setF(x => ({ ...x, token: '', baseId: r.baseId || '', mode: r.mode || 'simple', table: r.table || 'Scores', tables: r.tables || x.tables, auto: r.auto !== false })); }
    catch { setSt({ configured: false }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Après l'enregistrement, on vérifie tout de suite auprès d'Airtable
  const save = e => {
    e.preventDefault();
    run('save', async () => {
      await staffApi('airtable_save', f); await load();
      try { await staffApi('airtable_test'); setMsg({ kind: 'ok', text: t('admin.at_saved_ok') }); }
      catch (x) { setMsg({ kind: 'error', text: `${t('admin.at_saved_but')} ${airtableMsg(t, x)}` }); }
    });
  };
  const test = () => run('test', async () => { await staffApi('airtable_test'); setMsg({ kind: 'ok', text: t('admin.at_test_ok') }); await load(); });
  const setTable = (k, v) => setF({ ...f, tables: { ...f.tables, [k]: v } });
  return (
    <>
      <section className={`feature ${st?.verified ? 'grad-blue' : st?.configured ? 'grad-warn' : 'grad-off'}`}>
        <div className="feature-head">
          <span className="feature-icon"><Icon name="db" size={19} /></span>
          <div>
            <h2>{t('admin.at_title')}</h2>
            <p>{!st ? t('common.loading') : st.verified ? t(st.mode === 'complet' ? 'admin.at_status_ok' : 'admin.at_status_ok_simple', { base: st.baseId, table: st.table }) : st.configured ? `${t('admin.at_status_fail')} ${airtableMsg(t, { message: st.problem?.code, detail: st.problem?.detail })}` : t('admin.at_status_none')}{st?.source === 'env' ? ` ${t('admin.at_from_env')}` : ''}</p>
          </div>
        </div>
        {st?.configured ? (
          <div className="feature-actions" style={{ marginTop: '1rem' }}>
            {st.verified ? <button className="btn white" aria-busy={busy === 'sync'} disabled={!!busy} onClick={sync}>{t('admin.at_sync_all')}</button> : null}
            <button className="btn glass" aria-busy={busy === 'test'} disabled={!!busy} onClick={test}>{t('admin.at_test')}</button>
            <button className="btn glass" aria-busy={busy === 'setup'} disabled={!!busy} onClick={setup}>{t(st.mode === 'complet' ? 'mex.setup' : 'mex.setup_simple')}</button>
            {prog ? <span className="small">{t('mex.progress', prog)}</span> : null}
          </div>
        ) : null}
        {st?.configured ? (
          <div className="feature-actions" style={{ marginTop: '0.6rem' }}>
            {(st.mode === 'complet' ? ['organisations', 'diagnostics', 'accompagnement'] : ['scores']).map(k => (
              <button key={k} className="btn glass small" aria-busy={busy === `csv_${k}`} disabled={!!busy} onClick={() => csv(k)}>{t(`mex.csv_${k}`)}</button>
            ))}
          </div>
        ) : null}
      </section>
      {msg ? <p className={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</p> : null}
      <section className="card">
        <h2>{t('admin.at_settings')}</h2>
        <p className="muted small">{t('admin.at_lead')}</p>
        <form className="form" onSubmit={save}>
          <div className="form row">
            <label>{t('admin.at_token')}<input type="password" name="airtable-access-token" autoComplete="new-password" spellCheck={false} placeholder={st?.tokenHint || 'pat…'} value={f.token} onChange={e => setF({ ...f, token: e.target.value })} /></label>
            <label>{t('admin.at_base')}<input required placeholder="app…" value={f.baseId} onChange={e => setF({ ...f, baseId: e.target.value })} /></label>
          </div>
          <p className="muted small">{t('admin.at_token_hint')}</p>
          {st?.tokenHint ? <p className="muted small">{t('admin.at_token_used', { hint: st.tokenHint, source: t(`admin.at_src_${st.source || 'app'}`) })}</p> : null}
          <label>{t('admin.at_mode')}
            <select value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}>
              <option value="simple">{t('admin.at_mode_simple')}</option>
              <option value="complet">{t('admin.at_mode_complet')}</option>
            </select>
          </label>
          <p className="muted small">{t(`admin.at_mode_${f.mode}_hint`)}</p>
          {f.mode === 'complet' ? (
            <>
              <span className="fieldlabel">{t('admin.at_tables_title')}</span>
              <div className="form row">
                {['organisations', 'diagnostics', 'accompagnement'].map(k => (
                  <label key={k}>{t(`admin.at_table_${k}`)}<input value={f.tables[k]} onChange={e => setTable(k, e.target.value)} /></label>
                ))}
              </div>
            </>
          ) : (
            <label>{t('admin.at_table_scores')}<input value={f.table} onChange={e => setF({ ...f, table: e.target.value })} /></label>
          )}
          <label className="check"><input type="checkbox" checked={f.auto} onChange={e => setF({ ...f, auto: e.target.checked })} /><span>{t('admin.at_auto')}</span></label>
          <button className="btn primary" aria-busy={busy === 'save'} disabled={!!busy}>{t('common.save')}</button>
        </form>
      </section>
    </>
  );
}

// F19 tableau de cohorte, F23 OSC sans coach et création manuelle
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr, safeNum } from '../../lib/safe';
import { fullName, contactName } from '../../lib/names';
import LinkBox from '../LinkBox';

export default function Cohort({ project, cohort, coaches, owner, reload }) {
  const { t, lang } = useI18n();
  const [coachFilter, setCoachFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', firstName: '', lastName: '', email: '', coachId: '' });
  const [created, setCreated] = useState('');
  const [error, setError] = useState('');

  const rows = cohort.rows.filter(r => !coachFilter || (coachFilter === 'none' ? !r.subject.coach_id : r.subject.coach_id === coachFilter));
  const assign = async (subjectId, coachId) => {
    const { error: e } = await sb().from('subjects').update({ coach_id: coachId || null }).eq('id', subjectId);
    if (e) setError('forbidden'); else reload();
  };
  const create = async e => {
    e.preventDefault(); setError('');
    try { const r = await staffApi('create_subject', { ...form, projectId: project.id, lang }); setCreated(r.url); setForm({ name: '', firstName: '', lastName: '', email: '', coachId: '' }); reload(); }
    catch (err) { setError(err.message); }
  };
  const unassigned = cohort.rows.filter(r => !r.subject.coach_id).length;

  return (
    <>
      <div className="toolbar">
        <label className="inline">{t('cohort.filter_coach')}
          <select value={coachFilter} onChange={e => setCoachFilter(e.target.value)}>
            <option value="">{t('cohort.all_coaches')}</option>
            <option value="none">{t('cohort.no_coach')} ({unassigned})</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </select>
        </label>
        {owner ? <button className="btn" onClick={() => setAdding(!adding)}>{t('cohort.add_osc')}</button> : null}
      </div>
      {error ? <p className="error">{t(`errors.${error}`)}</p> : null}
      {adding ? (
        <form className="card form row" onSubmit={create}>
          <label>{t('entry.name')}<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label>{t('entry.first_name')}<input required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></label>
          <label>{t('entry.last_name')}<input required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></label>
          <label>{t('entry.email')}<input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label>{t('cohort.coach')}<select value={form.coachId} onChange={e => setForm({ ...form, coachId: e.target.value })}>
            <option value="">{t('cohort.no_coach')}</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </select></label>
          <button className="btn primary">{t('cohort.create')}</button>
        </form>
      ) : null}
      {created ? <LinkBox url={created} /> : null}
      {rows.length === 0 ? <p className="empty-inline">{t(owner ? 'cohort.empty' : 'cohort.empty_coach')}</p> : (
        <div className="scroll"><table className="table">
          <thead><tr>
            <th>{t('cohort.osc')}</th><th>{t('cohort.coach')}</th><th>{t('cohort.evaluation')}</th>
            <th>{t('cohort.completion')}</th><th>{t('cohort.global')}</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.subject.id}>
              <td><Link href={`/staff/subject/${r.subject.id}`}>{safeStr(r.subject.name)}</Link><br /><small className="muted">{contactName(r.subject) ? `${contactName(r.subject)} · ` : ''}{safeStr(r.subject.email)}</small></td>
              <td>{owner ? (
                <select aria-label={t('cohort.coach')} value={r.subject.coach_id || ''} onChange={e => assign(r.subject.id, e.target.value)}>
                  <option value="">{t('cohort.no_coach')}</option>
                  {coaches.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                </select>
              ) : fullName(r.subject.coach) || '—'}</td>
              <td>{r.current ? `${t(`eval.${r.current.type}`)} · ${t(`astatus.${r.current.status}`)}` : '—'}</td>
              <td><span className="bar inline"><span style={{ width: `${r.completion}%` }} /></span> {r.completion} %</td>
              <td>{safeNum(r.global) !== null ? r.global.toFixed(2) : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

// Cohorte d'un projet. Un coach ne voit que ses organisations (règle en base) ; owner et administrateur voient tout et filtrent par coach.
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr, safeNum } from '../../lib/safe';
import { fullName, contactName } from '../../lib/names';
import { STAGES, STAGE_TAB } from '../../lib/stage';
import { StageBadge } from './StageBadge';
import LinkBox from '../LinkBox';

export default function Cohort({ project, cohort, coaches, owner, reload }) {
  const { t, lang } = useI18n();
  const [coachFilter, setCoachFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', firstName: '', lastName: '', email: '', coachId: '' });
  const [created, setCreated] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Le filtre par coach n'existe que pour les owners et l'administrateur
  const base = cohort.rows.filter(r => !owner || !coachFilter || (coachFilter === 'none' ? !r.subject.coach_id : r.subject.coach_id === coachFilter));
  const rows = base.filter(r => !stageFilter || r.stage === stageFilter);
  const count = s => base.filter(r => r.stage === s).length;
  const assign = async (subjectId, coachId) => {
    const { error: e } = await sb().from('subjects').update({ coach_id: coachId || null }).eq('id', subjectId);
    if (e) setError('forbidden'); else reload();
  };
  const create = async e => {
    e.preventDefault(); setError(''); setBusy(true);
    try { const r = await staffApi('create_subject', { ...form, projectId: project.id, lang }); setCreated(r.url); setForm({ name: '', firstName: '', lastName: '', email: '', coachId: '' }); reload(); }
    catch (err) { setError(err.message); }
    setBusy(false);
  };
  const unassigned = cohort.rows.filter(r => !r.subject.coach_id).length;

  return (
    <>
      <div className="toolbar">
        {owner ? (
          <label className="inline">{t('cohort.filter_coach')}
            <select value={coachFilter} onChange={e => setCoachFilter(e.target.value)}>
              <option value="">{t('cohort.all_coaches')}</option>
              <option value="none">{t('cohort.no_coach')} ({unassigned})</option>
              {coaches.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
            </select>
          </label>
        ) : <span className="muted small">{t('cohort.only_yours')}</span>}
        <span className="grow" />
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
          <button className="btn primary" aria-busy={busy} disabled={busy}>{t('cohort.create')}</button>
        </form>
      ) : null}
      {created ? <LinkBox url={created} /> : null}

      {cohort.rows.length > 0 ? (
        <div className="stagefilters" role="group" aria-label={t('cohort.col_stage')}>
          <button type="button" className={`sf ${stageFilter === '' ? 'on' : ''}`} onClick={() => setStageFilter('')}>{t('coach.pipeline_all')} <b>{base.length}</b></button>
          {STAGES.filter(s => count(s) > 0 || stageFilter === s).map(s => (
            <button type="button" key={s} className={`sf ${stageFilter === s ? 'on' : ''}`} data-stage={s} onClick={() => setStageFilter(stageFilter === s ? '' : s)}>{t(`stage.${s}`)} <b>{count(s)}</b></button>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? <p className="empty-inline">{t(cohort.rows.length === 0 ? (owner ? 'cohort.empty' : 'cohort.empty_coach') : 'cohort.none_in_filter')}</p> : (
        <div className="card flush"><div className="scroll"><table className="table">
          <thead><tr>
            <th>{t('cohort.osc')}</th>{owner ? <th>{t('cohort.coach')}</th> : null}<th>{t('coach.col_questionnaire')}</th><th>{t('cohort.col_stage')}</th><th>{t('cohort.global')}</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.subject.id}>
              <td><Link href={`/staff/subject/${r.subject.id}?tab=${STAGE_TAB[r.stage]}`}><b>{safeStr(r.subject.name)}</b></Link><br /><small className="muted">{contactName(r.subject) ? `${contactName(r.subject)} · ` : ''}{safeStr(r.subject.email)}</small></td>
              {owner ? (
                <td>
                  <select aria-label={t('cohort.coach')} value={r.subject.coach_id || ''} onChange={e => assign(r.subject.id, e.target.value)}>
                    <option value="">{t('cohort.no_coach')}</option>
                    {coaches.map(c => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                  </select>
                </td>
              ) : null}
              <td><span className="bar inline"><span style={{ width: `${r.completion}%` }} /></span> {r.completion} %</td>
              <td><StageBadge stage={r.stage} date={r.current?.session_date} /></td>
              <td>{safeNum(r.global) !== null ? `${r.global.toFixed(2)}${r.globalProvisional ? '*' : ''}` : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
      {rows.some(r => r.globalProvisional) ? <p className="muted small">{t('sheet.provisional_note')}</p> : null}
    </>
  );
}

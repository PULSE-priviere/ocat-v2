// Paramètres de l'OSC : lien personnel, clôture, partage, nouvelle évaluation
import { useEffect, useState } from 'react';
import { sb } from '../../lib/supabase';
import LinkBox from '../LinkBox';
import Check from '../Check';
import { useI18n } from '../../lib/i18n';
import { EVAL_ORDER } from '../../lib/scoring';

export default function SettingsTab({ assessment, link, onAction, onUpdate, onCreateAssessment, subject, owner, onSubjectUpdate }) {
  const { t } = useI18n();
  const [type, setType] = useState('followup');
  const st = assessment?.status;
  return (
    <div className="settings">
      {assessment ? (
        <>
          <section className="card">
            <h2>{t('settings.link_title')}</h2>
            <p className="muted small">{t('settings.link_desc')}</p>
            <div className="toolbar wrap">
              <button className="btn info" onClick={() => onAction('link', { assessmentId: assessment.id })}>{t('subject.new_link')}</button>
              <button className="btn info" onClick={() => onAction('link', { assessmentId: assessment.id, send: true })}>{t('subject.send_link')}</button>
              <button className="btn danger" onClick={() => window.confirm(t('subject.revoke_confirm')) && onAction('revoke_link', { assessmentId: assessment.id })}>{t('subject.revoke_link')}</button>
            </div>
            {link ? <LinkBox url={link} /> : null}
          </section>
          <section className="card">
            <h2>{t('settings.session_title')}</h2>
            <p className="muted small">{t('settings.session_desc')}</p>
            {st === 'locked'
              ? <button className="btn ok" onClick={() => onUpdate({ status: assessment.submitted_at ? 'submitted' : 'in_progress', locked_at: null })}>{t('subject.unlock')}</button>
              : <button className="btn warn" onClick={() => window.confirm(t('subject.lock_confirm')) && onUpdate({ status: 'locked', locked_at: new Date().toISOString() })}>{t('subject.lock')}</button>}
          </section>
          <section className="card">
            <h2>{t('settings.share_title')}</h2>
            <p className="muted small">{t('settings.share_desc')}</p>
            <Check checked={assessment.notes_shared} onChange={v => onUpdate({ notes_shared: v })} label={t('subject.share_notes')} />
          </section>
        </>
      ) : <p className="empty-inline">{t('subject.no_assessment')}</p>}
      {subject && 'support_org' in subject ? <SupportOrg subject={subject} owner={owner} onSave={onSubjectUpdate} /> : null}
      <section className="card">
        <h2>{t('settings.eval_title')}</h2>
        <p className="muted small">{t('settings.eval_desc')}</p>
        <div className="toolbar">
          <select aria-label={t('subject.new_assessment')} value={type} onChange={e => setType(e.target.value)} style={{ width: 'auto' }}>
            {EVAL_ORDER.map(k => <option key={k} value={k}>{t(`eval.${k}`)}</option>)}
          </select>
          <button className="btn primary" onClick={() => window.confirm(t('subject.new_assessment_confirm')) && onCreateAssessment(type)}>{t('subject.new_assessment')}</button>
        </div>
      </section>
    </div>
  );
}

// Structure d'accompagnement (par exemple « Luhnyezi ») : modifiable par un owner, suggestions tirées des valeurs du projet.
// Ce n'est pas un compte. Utilisée par l'onglet Analytics (filtre et comparaison).
function SupportOrg({ subject, owner, onSave }) {
  const { t } = useI18n();
  const [value, setValue] = useState(subject.support_org || '');
  const [known, setKnown] = useState([]);
  const [state, setState] = useState('');
  useEffect(() => { setValue(subject.support_org || ''); }, [subject.id, subject.support_org]);
  useEffect(() => {
    if (!owner) return;
    sb().from('subjects').select('support_org').eq('project_id', subject.project_id).not('support_org', 'is', null)
      .then(({ data }) => setKnown([...new Set((data || []).map(x => String(x.support_org).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))));
  }, [owner, subject.project_id]);
  const clean = value.trim().replace(/\s+/g, ' ').slice(0, 120);
  const save = async e => {
    e.preventDefault(); setState('busy');
    try { await onSave({ support_org: clean || null }); setState('saved'); } catch { setState('error'); }
  };
  return (
    <section className="card">
      <h2>{t('settings.support_org_title')}</h2>
      <p className="muted small">{t('settings.support_org_desc')}</p>
      {owner ? (
        <form className="toolbar" onSubmit={save}>
          <input list="support-org-list" value={value} maxLength={120} onChange={e => { setValue(e.target.value); setState(''); }} placeholder={t('settings.support_org_placeholder')} aria-label={t('settings.support_org_title')} />
          <datalist id="support-org-list">{known.map(k => <option key={k} value={k} />)}</datalist>
          <button className="btn" disabled={state === 'busy' || clean === (subject.support_org || '')} aria-busy={state === 'busy'}>{t('common.save')}</button>
          {state === 'saved' ? <span className="ok small">{t('settings.support_org_saved')}</span> : null}
          {state === 'error' ? <span className="error small">{t('errors.server_error')}</span> : null}
        </form>
      ) : <p><b>{subject.support_org || t('analytics.none')}</b> <span className="muted small">{t('settings.support_org_owner_only')}</span></p>}
    </section>
  );
}

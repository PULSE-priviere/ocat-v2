// Paramètres de l'OSC : lien personnel, clôture, partage, nouvelle évaluation
import { useState } from 'react';
import LinkBox from '../LinkBox';
import { useI18n } from '../../lib/i18n';
import { EVAL_ORDER } from '../../lib/scoring';

export default function SettingsTab({ assessment, link, onAction, onUpdate, onCreateAssessment }) {
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
            <label className="check"><input type="checkbox" checked={assessment.notes_shared} onChange={e => onUpdate({ notes_shared: e.target.checked })} /><span>{t('subject.share_notes')}</span></label>
          </section>
        </>
      ) : <p className="empty-inline">{t('subject.no_assessment')}</p>}
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

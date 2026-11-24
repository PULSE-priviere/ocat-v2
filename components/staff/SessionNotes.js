// Colonne centrale : une question à la fois. Quatre champs structurés avec libellés H2 « façon Notion ».
// Les champs texte s'enregistrent 700 ms après la dernière frappe ;
// l'échéance est stockée dans action_plans.items[i].due, les autres dans answers.coach_*.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n, pick } from '../../lib/i18n';

const BLANK = { coach_notes: '', coach_action: '', coach_owner: '', due: '' };

export default function SessionNotes({ question, answer, section, due, onSaveAnswer, onSaveDue, onPrev, onNext, hasPrev, hasNext, position, total }) {
  const { t, lang } = useI18n();
  const timers = useRef({});
  const latest = useRef(BLANK);

  const initial = useMemo(() => ({
    coach_notes: String(answer?.coach_notes || ''),
    coach_action: String(answer?.coach_action || ''),
    coach_owner: String(answer?.coach_owner || ''),
    due: String(due || ''),
  }), [answer, due]);

  const [f, setF] = useState(initial);
  const [state, setState] = useState('saved');

  useEffect(() => { setF(initial); latest.current = initial; setState('saved'); return () => Object.values(timers.current).forEach(clearTimeout); }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = (key, value) => {
    setF(prev => ({ ...prev, [key]: value }));
    setState('saving');
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      if (key === 'due') await onSaveDue(value || '');
      else await onSaveAnswer({ [key]: value.trim() || null });
      latest.current = { ...latest.current, [key]: value };
      setState('saved');
    }, 700);
  };

  // Flush à la fermeture
  useEffect(() => {
    const flush = () => {
      ['coach_notes', 'coach_action', 'coach_owner'].forEach(k => { if (f[k] !== (latest.current[k] || '')) onSaveAnswer({ [k]: f[k].trim() || null }); });
      if (f.due !== (latest.current.due || '')) onSaveDue(f.due || '');
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush); };
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = e => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); if (hasNext) onNext(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hasPrev) onPrev(); }
  };

  if (!question) {
    return (
      <section className="sess-stage sess-stage-empty">
        <div className="sess-stage-hero">
          <h2>{t('session.v1.welcome_title')}</h2>
          <p className="muted">{t('session.v1.welcome_hint')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="sess-stage">
      <div className="sess-stage-paper" onKeyDown={onKey}>
        <div className="sess-stage-crumb">
          {section ? <span>{section.idx}. {pick(section, 'name', lang)}</span> : null}
          {question.code ? <><span className="sep">·</span><span className="q-code">{question.code}</span></> : null}
          <span className="grow" />
          <span className="muted small">{t('session.v1.question_position', { n: position, total })}</span>
        </div>
        <h1 className="sess-stage-title">{pick(question, 'text', lang)}</h1>

        <h2 className="sess-h2">{t('session.v1.h_notes')}</h2>
        <textarea className="sess-field" rows={5} placeholder={t('session.v1.ph_notes')}
          value={f.coach_notes} onChange={e => schedule('coach_notes', e.target.value)} />

        <h2 className="sess-h2">{t('session.v1.h_action')}</h2>
        <textarea className="sess-field" rows={4} placeholder={t('session.v1.ph_action')}
          value={f.coach_action} onChange={e => schedule('coach_action', e.target.value)} />

        <div className="sess-row">
          <div className="sess-col">
            <h2 className="sess-h2">{t('session.v1.h_owner')}</h2>
            <input className="sess-field" placeholder={t('session.v1.ph_owner')}
              value={f.coach_owner} onChange={e => schedule('coach_owner', e.target.value)} />
          </div>
          <div className="sess-col sess-col-due">
            <h2 className="sess-h2">{t('session.v1.h_due')}</h2>
            <input className="sess-field" type="date" value={f.due} onChange={e => schedule('due', e.target.value)} />
          </div>
        </div>
      </div>

      <footer className="sess-stage-foot">
        <span className={`sess-save ${state}`}>{state === 'saving' ? t('session.v1.saving') : t('session.v1.saved')}</span>
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={onPrev} disabled={!hasPrev}>← {t('session.v1.prev')}</button>
        <button type="button" className="btn primary" onClick={onNext} disabled={!hasNext}>{t('session.v1.next')} →</button>
      </footer>
    </section>
  );
}

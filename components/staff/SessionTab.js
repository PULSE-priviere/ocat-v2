// Session d'accompagnement : par question avec besoin d'accompagnement → Notes, Action, Responsable
import { useState } from 'react';
import Field from './Field';
import { useI18n, pick } from '../../lib/i18n';
import { sb } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';

const SCALE = ['NA', '1', '2', '3'];

export default function SessionTab({ bank, answers, comments, needs, assessment, saveAnswer, toggleNeed, addNeed, onQuestionAdded }) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('support');
  const flagged = q => !!answers[q.id]?.support;
  const keep = q => (filter === 'support' ? flagged(q) : filter === 'low' ? ['1', '2'].includes(answers[q.id]?.code) : true);
  const nFlag = bank.questions.filter(flagged).length;
  const nAction = bank.questions.filter(q => String(answers[q.id]?.coach_action || '').trim()).length;
  const started = bank.questions.some(q => answers[q.id]?.coach_notes || answers[q.id]?.coach_action);
  const groups = bank.sections.map(s => ({ s, qs: bank.questions.filter(q => q.section_id === s.id && keep(q)) }));
  const total = groups.reduce((a, g) => a + g.qs.length, 0);

  return (
    <>
      <details className="guide-card" open={!started}>
        <summary>{t('session.guide_title')}</summary>
        <ol>{[1, 2, 3, 4, 5].map(n => <li key={n}>{t(`session.guide_${n}`)}</li>)}</ol>
      </details>
      <div className="toolbar wrap">
        <div className="seg" role="group" aria-label={t('session.filter')}>
          {['support', 'low', 'all'].map(f => <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`session.f_${f}`)}</button>)}
        </div>
        <span className="muted small">{t('session.stats', { n: nFlag, m: nAction })}</span>
      </div>
      {total === 0 ? <p className="empty-inline">{t(`session.empty_${filter}`)}</p> : null}
      {groups.filter(g => g.qs.length || filter === 'all').map(({ s, qs }) => (
        <section key={s.id} className="ssec">
          <h2>{s.idx}. {pick(s, 'name', lang)}{assessment.section_deepen?.[s.num] ? <span className="tag">{t('session.deepen_badge')}</span> : null}</h2>
          {comments[s.num] ? <p className="osccomment"><strong>{t('session.osc_comment')}</strong> {safeStr(comments[s.num])}</p> : null}
          {qs.map(q => <SessionQuestion key={q.id} q={q} a={answers[q.id] || {}} needs={needs} saveAnswer={saveAnswer} toggleNeed={toggleNeed} addNeed={addNeed} />)}
          {filter === 'all' ? <AddQuestion section={s} assessment={assessment} onAdded={onQuestionAdded} /> : null}
        </section>
      ))}
    </>
  );
}

function SessionQuestion({ q, a, needs, saveAnswer, toggleNeed, addNeed }) {
  const { t, lang } = useI18n();
  const [newNeed, setNewNeed] = useState('');
  const codes = q.format === 'yesno' ? ['yes', 'no'] : SCALE;
  const picked = needs.filter(n => (a.needIds || []).includes(n.id));
  return (
    <article className="sq2">
      <header className="sq2-head">
        <p className="q-text">{q.code ? <span className="q-code">{q.code}</span> : <span className="tag">{t('session.added')}</span>}{pick(q, 'text', lang)}</p>
        <div className="sq2-meta">
          {a.code ? <span className={`chip c${a.code}`}>{t(`answer.short_${a.code}`)}</span> : <span className="chip cnone">{t('report.no_answer')}</span>}
          {['1', '2'].includes(a.code) ? (
            <label className="check flag"><input type="checkbox" checked={!!a.support} onChange={e => saveAnswer(q, { support: e.target.checked })} /><span>{t('session.needs_flag')}</span></label>
          ) : null}
          {a.edited_by_coach ? <span className="pill grey">{t('session.edited')}</span> : null}
          {picked.map(n => <span key={n.id} className="pill blue">{n.label}</span>)}
        </div>
      </header>
      <div className="props">
        <Field label={t('session.notes')} value={a.coach_notes} placeholder={t('session.ph_notes')} onSave={v => saveAnswer(q, { coach_notes: v })} />
        <Field label={t('session.action')} value={a.coach_action} placeholder={t('session.ph_action')} onSave={v => saveAnswer(q, { coach_action: v })} />
        <Field label={t('session.owner')} value={a.coach_owner} placeholder={t('session.ph_owner')} multiline={false} onSave={v => saveAnswer(q, { coach_owner: v })} />
      </div>
      <details className="more">
        <summary>{t('session.more')}</summary>
        {q.format === 'text' ? (
          <Field label={t('session.answer_label')} value={a.value_text} onSave={v => saveAnswer(q, { value_text: v })} />
        ) : (
          <div className="prop">
            <span className="prop-label">{t('session.answer_label')}</span>
            <div className="opts compact">
              {codes.map(c => (
                <button key={c} type="button" className={`opt ${a.code === c ? 'on' : ''}`} aria-pressed={a.code === c}
                  onClick={() => a.code !== c && saveAnswer(q, { code: c })}>{t(`answer.short_${c}`)}</button>
              ))}
            </div>
          </div>
        )}
        <div className="prop">
          <span className="prop-label">{t('session.needs_label')}</span>
          <div className="needchips">
            {needs.map(n => {
              const on = (a.needIds || []).includes(n.id);
              return <button key={n.id} type="button" className={`chipbtn ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleNeed(q, n.id)}>{n.label}</button>;
            })}
            <form className="inline-form" onSubmit={e => { e.preventDefault(); if (newNeed.trim()) { addNeed(q, newNeed); setNewNeed(''); } }}>
              <input aria-label={t('session.new_need')} placeholder={t('session.new_need')} value={newNeed} onChange={e => setNewNeed(e.target.value)} />
              <button className="btn small">{t('common.add')}</button>
            </form>
          </div>
        </div>
        {q.format === 'scale' ? <div className="guide">{pick(q, 'guide', lang) || t('osc.guide_generic')}</div> : null}
      </details>
    </article>
  );
}

// Question ajoutée à cette évaluation seulement (hors score)
function AddQuestion({ section, assessment, onAdded }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ text: '', format: 'text' });
  const save = async e => {
    e.preventDefault();
    const { data: s } = await sb().from('sections').select('framework_id').eq('id', section.id).single();
    const { data: u } = await sb().auth.getUser();
    const { error } = await sb().from('questions').insert({
      framework_id: s.framework_id, section_id: section.id, assessment_id: assessment.id, format: f.format,
      concept_id: `custom-${assessment.id.slice(0, 8)}-${Date.now()}`, text_fr: f.text, text_en: f.text, created_by: u.user?.id });
    if (!error) { setF({ text: '', format: 'text' }); setOpen(false); onAdded(); }
  };
  if (!open) return <button className="link small" onClick={() => setOpen(true)}>+ {t('session.add_question')}</button>;
  return (
    <form className="card slim form row" onSubmit={save}>
      <label className="grow">{t('session.question_text')}<input required value={f.text} onChange={e => setF({ ...f, text: e.target.value })} /></label>
      <label>{t('session.format')}<select value={f.format} onChange={e => setF({ ...f, format: e.target.value })}>
        {['text', 'yesno', 'scale'].map(k => <option key={k} value={k}>{t(`session.format_${k}`)}</option>)}
      </select></label>
      <button className="btn primary">{t('common.add')}</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
    </form>
  );
}

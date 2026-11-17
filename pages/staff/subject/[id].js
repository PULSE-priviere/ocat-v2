// F18 fiche OSC, F8–F13 session coach, F14–F17 plan
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../../components/Layout';
import LinkBox from '../../../components/LinkBox';
import ScoreRadar from '../../../components/Radar';
import PlanEditor from '../../../components/staff/PlanEditor';
import { useI18n, pick } from '../../../lib/i18n';
import { useStaff } from '../../../lib/useStaff';
import { sb, staffApi, fetchIn } from '../../../lib/supabase';
import { loadBank } from '../../../lib/bank';
import { safeStr, safeNum } from '../../../lib/safe';
import { sectionProgress, sectionScore, globalScore, completion, byAnswer, EVAL_KEY, EVAL_ORDER } from '../../../lib/scoring';

const SCALE = ['NA', '1', '2', '3'];

export default function SubjectPage() {
  const { query } = useRouter();
  const { t, lang } = useI18n();
  const staff = useStaff();
  const [subject, setSubject] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [current, setCurrent] = useState(null);
  const [bank, setBank] = useState(null);
  const [answers, setAnswers] = useState({});
  const [allAnswers, setAllAnswers] = useState({});   // assessment_id → { question_id → réponse } (radar)
  const [needs, setNeeds] = useState([]);
  const [tab, setTab] = useState('session');
  const [filter, setFilter] = useState('all');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(x => x + 1), []);

  // Chargement : OSC, évaluations, questions, réponses, besoins
  useEffect(() => {
    if (!query.id || staff.loading) return;
    (async () => {
      const { data: s } = await sb().from('subjects')
        .select('*, project:projects(id, name, framework_id), coach:profiles(name, email)').eq('id', query.id).maybeSingle();
      if (!s) return setMsg('forbidden');
      const { data: list } = await sb().from('assessments').select('*').eq('subject_id', s.id);
      const sorted = (list || []).sort((a, b) => EVAL_ORDER.indexOf(a.type) - EVAL_ORDER.indexOf(b.type) || a.created_at.localeCompare(b.created_at));
      const cur = sorted.find(a => a.id === current?.id) || sorted[sorted.length - 1] || null;
      const b = await loadBank(sb(), s.project.framework_id, cur?.id);
      const ans = sorted.length ? await fetchIn(ids => sb().from('answers').select('*').in('assessment_id', ids), sorted.map(a => a.id)) : [];
      const all = {};
      ans.forEach(a => { (all[a.assessment_id] = all[a.assessment_id] || {})[a.question_id] = a; });
      const curAns = all[cur?.id] || {};
      const ids = Object.values(curAns).map(a => a.id);
      const links = ids.length ? await fetchIn(chunk => sb().from('answer_needs').select('answer_id, need_id').in('answer_id', chunk), ids) : [];
      Object.values(curAns).forEach(a => { a.needIds = links.filter(l => l.answer_id === a.id).map(l => l.need_id); });
      const { data: nd } = await sb().from('needs').select('id, label').eq('project_id', s.project.id).order('label');
      setSubject(s); setAssessments(sorted); setCurrent(cur); setBank(b); setAllAnswers(all); setAnswers({ ...curAns }); setNeeds(nd || []);
    })();
  }, [query.id, staff.loading, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useMemo(() => bank ? sectionProgress(bank.sections, bank.questions, answers) : [], [bank, answers]);

  // Écriture d'une réponse par le coach (journalisée par la base)
  const saveAnswer = async (q, patch) => {
    const prev = answers[q.id] || {};
    const row = { assessment_id: current.id, question_id: q.id, code: prev.code ?? null, support: prev.support ?? null,
      value_text: prev.value_text ?? null, coach_notes: prev.coach_notes ?? null, ...patch };
    if (!['1', '2'].includes(row.code)) row.support = null;
    setAnswers(a => ({ ...a, [q.id]: { ...prev, ...row } }));
    const { data, error } = await sb().from('answers').upsert(row, { onConflict: 'assessment_id,question_id' }).select('id, edited_by_coach').single();
    if (error) return setMsg('server_error');
    setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], id: data.id, edited_by_coach: data.edited_by_coach, needIds: a[q.id]?.needIds || [] } }));
    return data.id;
  };

  const toggleNeed = async (q, needId) => {
    const answerId = answers[q.id]?.id || await saveAnswer(q, {});
    if (!answerId) return;
    const has = (answers[q.id]?.needIds || []).includes(needId);
    const r = has
      ? await sb().from('answer_needs').delete().match({ answer_id: answerId, need_id: needId })
      : await sb().from('answer_needs').insert({ answer_id: answerId, need_id: needId });
    if (r.error) return setMsg('server_error');
    setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], needIds: has ? a[q.id].needIds.filter(x => x !== needId) : [...(a[q.id].needIds || []), needId] } }));
  };

  const addNeed = async (q, label) => {
    const { data, error } = await sb().from('needs').insert({ project_id: subject.project.id, label: label.trim() }).select('id, label').single();
    if (error) return setMsg('need_exists');
    setNeeds(n => [...n, data].sort((a, b) => a.label.localeCompare(b.label)));
    await toggleNeed(q, data.id);
  };

  const updateAssessment = async patch => {
    const { error } = await sb().from('assessments').update(patch).eq('id', current.id);
    if (error) setMsg('server_error'); else reload();
  };

  const action = async (name, body) => {
    setMsg('');
    try { const r = await staffApi(name, { ...body, lang }); if (r.url) setLink(r.url); reload(); return r; }
    catch (e) { setMsg(e.message); }
  };

  if (msg === 'forbidden') return <Layout><p className="error">{t('errors.forbidden')}</p></Layout>;
  if (!subject || !bank) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;

  // Radar : une série par type d'évaluation (clés normalisées)
  const series = assessments.map(a => EVAL_KEY[a.type]).filter((k, i, arr) => arr.indexOf(k) === i);
  const radarData = bank.sections.map((s, i) => {
    const row = { section: `S${s.num}` };
    assessments.forEach(a => {
      const p = sectionProgress(bank.sections, bank.questions, allAnswers[a.id] || {})[i];
      row[EVAL_KEY[a.type]] = sectionScore(p);
    });
    return row;
  });

  const st = current?.status;
  return (
    <Layout wide title={safeStr(subject.name)}>
      <Link className="link" href="/staff">{t('subject.back')}</Link>
      <div className="toolbar">
        <h1 className="h1-small">{safeStr(subject.name)}</h1>
        {assessments.length > 1 ? (
          <select aria-label={t('cohort.evaluation')} value={current?.id || ''} onChange={e => { setCurrent(assessments.find(a => a.id === e.target.value)); reload(); }}>
            {assessments.map(a => <option key={a.id} value={a.id}>{t(`eval.${a.type}`)} · {new Date(a.created_at).toLocaleDateString(lang)}</option>)}
          </select>
        ) : null}
      </div>
      <p className="muted">{safeStr(subject.email)} · {t('cohort.coach')} : {safeStr(subject.coach?.name || subject.coach?.email) || '—'}
        {current ? ` · ${t(`eval.${current.type}`)} · ${t(`astatus.${st}`)}` : ''}</p>

      {current ? (
        <div className="toolbar wrap">
          <button className="btn" onClick={() => action('link', { assessmentId: current.id })}>{t('subject.new_link')}</button>
          <button className="btn" onClick={() => action('link', { assessmentId: current.id, send: true })}>{t('subject.send_link')}</button>
          <button className="btn" onClick={() => window.confirm(t('subject.revoke_confirm')) && action('revoke_link', { assessmentId: current.id })}>{t('subject.revoke_link')}</button>
          {st === 'locked'
            ? <button className="btn" onClick={() => updateAssessment({ status: current.submitted_at ? 'submitted' : 'in_progress', locked_at: null })}>{t('subject.unlock')}</button>
            : <button className="btn" onClick={() => window.confirm(t('subject.lock_confirm')) && updateAssessment({ status: 'locked', locked_at: new Date().toISOString() })}>{t('subject.lock')}</button>}
          <label className="check"><input type="checkbox" checked={current.notes_shared} onChange={e => updateAssessment({ notes_shared: e.target.checked })} /><span>{t('subject.share_notes')}</span></label>
          <NewAssessment onCreate={type => action('create_assessment', { subjectId: subject.id, type })} />
        </div>
      ) : <NewAssessment onCreate={type => action('create_assessment', { subjectId: subject.id, type })} />}
      {link ? <LinkBox url={link} /> : null}
      {msg ? <p className="error">{t(`errors.${msg}`)}</p> : null}

      {current ? (
        <>
          <nav className="tabs" role="tablist">
            {['session', 'sheet', 'plan'].map(k => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`subject.tab_${k}`)}</button>)}
          </nav>
          {tab === 'sheet' && <Sheet bank={bank} progress={progress} answers={answers} radarData={radarData} series={series} />}
          {tab === 'session' && (
            <Session bank={bank} answers={answers} comments={current.section_comments || {}} needs={needs} filter={filter} setFilter={setFilter}
              saveAnswer={saveAnswer} toggleNeed={toggleNeed} addNeed={addNeed} assessment={current} onQuestionAdded={reload} />
          )}
          {tab === 'plan' && <PlanEditor assessment={current} bank={bank} answers={answers} needs={needs} />}
        </>
      ) : null}
    </Layout>
  );
}

function NewAssessment({ onCreate }) {
  const { t } = useI18n();
  const [type, setType] = useState('followup');
  return (
    <span className="inline-form">
      <select aria-label={t('subject.new_assessment')} value={type} onChange={e => setType(e.target.value)}>
        {EVAL_ORDER.map(k => <option key={k} value={k}>{t(`eval.${k}`)}</option>)}
      </select>
      <button className="btn" onClick={() => window.confirm(t('subject.new_assessment_confirm')) && onCreate(type)}>{t('subject.new_assessment')}</button>
    </span>
  );
}

// F18 : fiche avec scores (staff uniquement)
function Sheet({ bank, progress, answers, radarData, series }) {
  const { t, lang } = useI18n();
  const g = globalScore(progress);
  return (
    <>
      <div className="two">
        <ScoreRadar data={radarData} series={series} />
        <table className="table">
          <thead><tr><th>{t('report.section')}</th><th>{t('sheet.progress')}</th><th>{t('sheet.score')}</th></tr></thead>
          <tbody>
            {progress.map(p => { const s = sectionScore(p); return (
              <tr key={p.section.id}><td>{pick(p.section, 'name', lang)}</td><td>{p.done}/{p.total}</td><td>{safeNum(s) !== null ? s.toFixed(2) : '—'}</td></tr>
            ); })}
            <tr className="total"><td>{t('sheet.global')}</td><td>{completion(progress)} %</td><td>{safeNum(g) !== null ? g.toFixed(2) : '—'}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">{t('sheet.score_rule')}</p>
      {bank.sections.map(s => (
        <details key={s.id} className="acc">
          <summary>{pick(s, 'name', lang)}</summary>
          <ul className="rlist">{bank.questions.filter(q => q.section_id === s.id).sort(byAnswer(answers)).map(q => (
            <li key={q.id}>
              <span className={`chip c${answers[q.id]?.code || 'none'}`}>{answers[q.id]?.code ? t(`answer.short_${answers[q.id].code}`) : t('report.no_answer')}</span>
              <span>{pick(q, 'text', lang)}{answers[q.id]?.support ? <em className="tag">{t('report.support_requested')}</em> : null}</span>
              {answers[q.id]?.coach_notes ? <p className="coachnote">{safeStr(answers[q.id].coach_notes)}</p> : null}
            </li>
          ))}</ul>
        </details>
      ))}
    </>
  );
}

// F8–F12 : revue question par question
function Session({ bank, answers, comments, needs, filter, setFilter, saveAnswer, toggleNeed, addNeed, assessment, onQuestionAdded }) {
  const { t, lang } = useI18n();
  const keep = q => {
    const a = answers[q.id];
    if (filter === 'low') return ['1', '2'].includes(a?.code);
    if (filter === 'support') return !!a?.support;
    if (filter === 'empty') return !a?.code && !a?.value_text;
    return true;
  };
  const discussed = bank.questions.filter(q => answers[q.id]?.coach_notes || answers[q.id]?.needIds?.length).length;
  return (
    <>
      <div className="toolbar wrap">
        <div className="seg" role="group" aria-label={t('session.filter')}>
          {['all', 'low', 'support', 'empty'].map(f => <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`session.f_${f}`)}</button>)}
        </div>
        <span className="muted small">{t('session.discussed', { n: discussed })}</span>
      </div>
      {bank.sections.map(s => {
        const qs = bank.questions.filter(q => q.section_id === s.id && keep(q));
        return (
          <section key={s.id} className="ssec">
            <h2>{pick(s, 'name', lang)}</h2>
            {comments[s.num] ? <p className="osccomment"><strong>{t('session.osc_comment')}</strong> {safeStr(comments[s.num])}</p> : null}
            {qs.map(q => <SessionQuestion key={q.id} q={q} a={answers[q.id] || {}} needs={needs} saveAnswer={saveAnswer} toggleNeed={toggleNeed} addNeed={addNeed} />)}
            <AddQuestion section={s} assessment={assessment} onAdded={onQuestionAdded} />
          </section>
        );
      })}
    </>
  );
}

function SessionQuestion({ q, a, needs, saveAnswer, toggleNeed, addNeed }) {
  const { t, lang } = useI18n();
  const [notes, setNotes] = useState(a.coach_notes || '');
  const [newNeed, setNewNeed] = useState('');
  const [state, setState] = useState('');
  const timer = useRef(null);
  useEffect(() => { setNotes(a.coach_notes || ''); }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onNotes = v => {
    setNotes(v); setState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { await saveAnswer(q, { coach_notes: v }); setState('saved'); }, 900);
  };
  const codes = q.format === 'yesno' ? ['yes', 'no'] : SCALE;
  return (
    <div className="sq">
      <div className="sq-main">
        <p className="q-text">{q.code ? <span className="q-code">{q.code}</span> : <span className="tag">{t('session.added')}</span>}{pick(q, 'text', lang)}</p>
        {q.format === 'text' ? (
          <textarea rows={2} defaultValue={a.value_text || ''} onBlur={e => e.target.value !== (a.value_text || '') && saveAnswer(q, { value_text: e.target.value })} />
        ) : (
          <div className="opts compact">
            {codes.map(c => (
              <button key={c} type="button" className={`opt ${a.code === c ? 'on' : ''}`} aria-pressed={a.code === c}
                onClick={() => a.code !== c && saveAnswer(q, { code: c })}>{t(`answer.short_${c}`)}</button>
            ))}
            {['1', '2'].includes(a.code) ? (
              <label className="check"><input type="checkbox" checked={!!a.support} onChange={e => saveAnswer(q, { support: e.target.checked })} /><span>{t('report.support_requested')}</span></label>
            ) : null}
            {a.edited_by_coach ? <span className="tag">{t('session.edited')}</span> : null}
          </div>
        )}
        {q.format === 'scale' ? <details className="guide-d"><summary>{t('osc.guide')}</summary><div className="guide">{pick(q, 'guide', lang) || t('osc.guide_generic')}</div></details> : null}
      </div>
      <div className="sq-notes">
        <label className="small">{t('session.notes')} {state ? <span className="muted">· {t(`save.${state}`)}</span> : null}
          <textarea rows={3} value={notes} onChange={e => onNotes(e.target.value)} />
        </label>
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
    </div>
  );
}

// F12 : question ajoutée à cette évaluation (hors score)
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
  if (!open) return <button className="link small" onClick={() => setOpen(true)}>{t('session.add_question')}</button>;
  return (
    <form className="card form row" onSubmit={save}>
      <label className="grow">{t('session.question_text')}<input required value={f.text} onChange={e => setF({ ...f, text: e.target.value })} /></label>
      <label>{t('session.format')}<select value={f.format} onChange={e => setF({ ...f, format: e.target.value })}>
        {['text', 'yesno', 'scale'].map(k => <option key={k} value={k}>{t(`session.format_${k}`)}</option>)}
      </select></label>
      <button className="btn primary">{t('common.add')}</button>
      <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
    </form>
  );
}

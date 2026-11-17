// Parcours OSC (F1 à F7) : accueil par sections, questionnaire, enregistrement automatique, rapport
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import LinkBox from '../../components/LinkBox';
import { useI18n, pick } from '../../lib/i18n';
import { safeStr } from '../../lib/safe';
import { sectionProgress, isBankScale, byAnswer } from '../../lib/scoring';

const SCALE = ['NA', '1', '2', '3'];

// ── File d'attente locale : brouillon gardé dans le navigateur et renvoyé au retour du réseau (F3) ──
const qKey = token => `ocat:pending:${String(token).slice(0, 16)}`;
const readQueue = token => { try { return JSON.parse(localStorage.getItem(qKey(token)) || '{}'); } catch { return {}; } };
const writeQueue = (token, q) => { try { localStorage.setItem(qKey(token), JSON.stringify(q)); } catch {} };

export default function OscPage() {
  const { query } = useRouter();
  const token = query.token;
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [fatal, setFatal] = useState('');
  const [answers, setAnswers] = useState({});      // question_id → réponse
  const [comments, setComments] = useState({});    // n° section → texte
  const [view, setView] = useState('home');        // 'home' | section id | 'report'
  const [save, setSave] = useState('saved');       // saved | saving | offline | error
  const [saveError, setSaveError] = useState('');
  const [resent, setResent] = useState(false);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/osc/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await r.json();
      if (j.error) return setFatal(j.error);
      const byQ = Object.fromEntries(j.answers.map(a => [a.question_id, a]));
      const sc = { ...(j.assessment.section_comments || {}) };
      // Les modifications locales non envoyées l'emportent
      Object.values(readQueue(token)).forEach(p => {
        if (p.op === 'answer') byQ[p.questionId] = { ...(byQ[p.questionId] || {}), question_id: p.questionId, code: p.code, support: p.support, value_text: p.valueText };
        if (p.op === 'comment') sc[p.section] = p.text;
      });
      setAnswers(byQ); setComments(sc); setData(j);
      return { j, byQ };
    } catch { setFatal('offline'); }
  }, [token]);

  const flush = useCallback(async () => {
    if (flushing.current || !token) return;
    const queue = readQueue(token);
    const keys = Object.keys(queue);
    if (!keys.length) return setSave('saved');
    flushing.current = true; setSave('saving');
    for (const k of keys) {
      try {
        const r = await fetch('/api/osc/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...queue[k] }) });
        const j = await r.json().catch(() => ({}));
        const q = readQueue(token);
        if (r.ok || r.status < 500) {
          // Succès, ou refus définitif (verrouillé, lien expiré) : on retire de la file
          if (JSON.stringify(q[k]) === JSON.stringify(queue[k])) { delete q[k]; writeQueue(token, q); }
          if (!r.ok) { setSaveError(j.error || 'server_error'); setSave('error'); flushing.current = false; return; }
        } else { setSave('error'); flushing.current = false; return; }
      } catch { setSave('offline'); flushing.current = false; return; }
    }
    flushing.current = false;
    setSave(Object.keys(readQueue(token)).length ? 'saving' : 'saved');
    if (Object.keys(readQueue(token)).length) flush();
  }, [token]);

  // Chargement + reprise à la première question sans réponse (F4)
  useEffect(() => {
    if (!token) return;
    load().then(res => {
      if (!res) return;
      const { j, byQ } = res;
      if (j.assessment.status !== 'in_progress') return setView('report');
      if (!Object.keys(byQ).length) return;
      for (const s of j.sections) {
        const q = j.questions.find(x => x.section_id === s.id && isBankScale(x) && !byQ[x.id]?.code);
        if (q) { setView(s.id); setTimeout(() => document.getElementById(`q-${q.id}`)?.scrollIntoView({ block: 'center' }), 150); return; }
      }
    });
    flush();
    const on = () => flush();
    window.addEventListener('online', on);
    const timer = setInterval(flush, 15000);
    return () => { window.removeEventListener('online', on); clearInterval(timer); };
  }, [token, load, flush]);

  const queue = (key, payload) => {
    const q = readQueue(token); q[key] = payload; writeQueue(token, q);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setSave('offline'); else flush();
  };

  const locked = data?.assessment.status === 'locked';

  const setAnswer = (q, patch) => {
    if (locked) return;
    const prev = answers[q.id] || {};
    const next = { ...prev, ...patch, question_id: q.id };
    if (!['1', '2'].includes(next.code)) next.support = null;   // appui seulement pour 1 ou 2
    setAnswers({ ...answers, [q.id]: next });
    queue(`a:${q.id}`, { op: 'answer', questionId: q.id, code: next.code ?? null, support: next.support ?? null, valueText: next.value_text ?? null });
  };
  const commentTimer = useRef(null);
  const setComment = (num, text) => {
    setComments(c => ({ ...c, [num]: text }));
    clearTimeout(commentTimer.current);
    commentTimer.current = setTimeout(() => queue(`c:${num}`, { op: 'comment', section: String(num), text }), 800);
  };

  const progress = useMemo(() => data ? sectionProgress(data.sections, data.questions, answers) : [], [data, answers]);
  const allComplete = progress.length > 0 && progress.every(p => p.status === 'complete');

  const submit = async () => {
    if (!window.confirm(t('osc.submit_confirm'))) return;
    await flush();
    const r = await fetch('/api/osc/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    const j = await r.json().catch(() => ({}));
    if (j.error) { setSaveError(j.error); setSave('error'); return; }
    await load(); setView('report'); window.scrollTo(0, 0);
  };

  const resend = async () => {
    await fetch('/api/osc/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, lang }) }).catch(() => {});
    setResent(true);
  };

  if (fatal) return (
    <Layout>
      <div className="narrow empty">
        <h1>{t(`errors.title_${['invalid_link', 'expired_link', 'offline'].includes(fatal) ? fatal : 'generic'}`)}</h1>
        <p className="lead">{t(`errors.${fatal}`)}</p>
        {fatal === 'expired_link' ? (resent ? <p className="ok">{t('osc.resent')}</p> : <button className="btn primary" onClick={resend}>{t('osc.resend')}</button>) : null}
        {fatal === 'offline' ? <button className="btn" onClick={() => location.reload()}>{t('common.retry')}</button> : null}
      </div>
    </Layout>
  );
  if (!data) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;

  const status = <SaveStatus state={save} error={saveError} />;
  const section = data.sections.find(s => s.id === view);

  return (
    <Layout title={safeStr(data.subject.name)} right={status}>
      {locked ? <p className="banner">{t('osc.locked_banner')}</p> : null}
      {view === 'report' ? (
        <Report data={data} answers={answers} comments={comments} progress={progress} onBack={() => setView('home')} />
      ) : section ? (
        <SectionView data={data} section={section} answers={answers} comment={comments[section.num] || ''}
          locked={locked} setAnswer={setAnswer} setComment={setComment}
          progress={progress.find(p => p.section.id === section.id)}
          onHome={() => { setView('home'); window.scrollTo(0, 0); }}
          next={data.sections[data.sections.findIndex(s => s.id === section.id) + 1]}
          onNext={s => { setView(s.id); window.scrollTo(0, 0); }} />
      ) : (
        <Home data={data} progress={progress} allComplete={allComplete} onOpen={s => { setView(s.id); window.scrollTo(0, 0); }}
          onSubmit={submit} onReport={() => setView('report')} />
      )}
    </Layout>
  );
}

function SaveStatus({ state, error }) {
  const { t } = useI18n();
  const label = state === 'error' && error ? t(`errors.${error}`) : t(`save.${state}`);
  return <span className={`save save-${state}`} role="status" aria-live="polite">{label}</span>;
}

// F1 : écran d'accueil
function Home({ data, progress, allComplete, onOpen, onSubmit, onReport }) {
  const { t, lang } = useI18n();
  const st = data.assessment.status;
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(window.location.href.split('#')[0]), []);
  return (
    <>
      <h1>{t('osc.home_title', { name: safeStr(data.subject.name) })}</h1>
      <p className="lead">{t('osc.home_intro')}</p>
      <div className="grid">
        {progress.map(p => (
          <button key={p.section.id} type="button" className={`tile ${p.status}`} onClick={() => onOpen(p.section)}>
            <span className="tile-num">{p.section.num}</span>
            <span className="tile-title">{pick(p.section, 'name', lang)}</span>
            <span className="tile-meta">
              <span className="bar"><span style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} /></span>
              <span>{p.done}/{p.total} · {t(`status.${p.status}`)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="submitbar">
        {st === 'in_progress' ? (
          allComplete
            ? <button className="btn primary big" onClick={onSubmit}>{t('osc.submit')}</button>
            : <p className="muted">{t('osc.submit_hint')}</p>
        ) : <button className="btn primary" onClick={onReport}>{t('osc.see_report')}</button>}
      </div>
      {url ? <LinkBox url={url} /> : null}
    </>
  );
}

// F2 : questions d'une section
function SectionView({ data, section, answers, comment, locked, setAnswer, setComment, progress, onHome, next, onNext }) {
  const { t, lang } = useI18n();
  const qs = data.questions.filter(q => q.section_id === section.id);
  return (
    <>
      <button className="link" onClick={onHome}>{t('osc.back_home')}</button>
      <h1>{pick(section, 'name', lang)}</h1>
      <p className="muted">{progress.done}/{progress.total} · {t(`status.${progress.status}`)}</p>
      <ol className="questions">
        {qs.map(q => <Question key={q.id} q={q} a={answers[q.id]} locked={locked} onChange={p => setAnswer(q, p)} />)}
      </ol>
      <label className="card comment">
        <span className="h3">{t('osc.section_comment')}</span>
        <textarea rows={4} value={comment} disabled={locked} onChange={e => setComment(section.num, e.target.value)} />
      </label>
      <div className="navrow">
        <button className="btn" onClick={onHome}>{t('osc.back_home')}</button>
        {next ? <button className="btn primary" onClick={() => onNext(next)}>{t('osc.next_section', { name: pick(next, 'name', lang) })}</button> : null}
      </div>
    </>
  );
}

function Question({ q, a, locked, onChange }) {
  const { t, lang } = useI18n();
  const [guide, setGuide] = useState(false);
  const name = `q-${q.id}`;
  const code = a?.code || null;
  return (
    <li id={name} className={`q ${code ? 'answered' : ''}`}>
      <p className="q-text">{q.code ? <span className="q-code">{q.code}</span> : null}{pick(q, 'text', lang)}</p>
      {a?.edited_by_coach ? <p className="tag">{t('osc.edited_by_coach')}</p> : null}
      {q.format === 'text' ? (
        <textarea rows={3} disabled={locked} value={a?.value_text || ''} onChange={e => onChange({ value_text: e.target.value })} />
      ) : (
        <fieldset className="opts" disabled={locked}>
          <legend className="sr">{pick(q, 'text', lang)}</legend>
          {(q.format === 'yesno' ? ['yes', 'no'] : SCALE).map(c => (
            <label key={c} className={`opt ${code === c ? 'on' : ''}`}>
              <input type="radio" name={name} checked={code === c} onChange={() => onChange({ code: c })} />
              <span>{t(`answer.${c}`)}</span>
            </label>
          ))}
        </fieldset>
      )}
      {q.format === 'scale' ? (
        <>
          <button type="button" className="link small" aria-expanded={guide} onClick={() => setGuide(!guide)}>{t('osc.guide')}</button>
          {guide ? <div className="guide">{pick(q, 'guide', lang) || t('osc.guide_generic')}</div> : null}
        </>
      ) : null}
      {['1', '2'].includes(code) ? (
        <fieldset className="support" disabled={locked}>
          <legend>{t('osc.support_question')}</legend>
          {[true, false].map(v => (
            <label key={String(v)} className={`opt small ${a?.support === v ? 'on' : ''}`}>
              <input type="radio" name={`${name}-s`} checked={a?.support === v} onChange={() => onChange({ support: v })} />
              <span>{t(v ? 'common.yes' : 'common.no')}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {a?.coach_notes ? <p className="coachnote"><strong>{t('osc.coach_note')}</strong> {safeStr(a.coach_notes)}</p> : null}
    </li>
  );
}

// F6 : rapport OSC (sans score)
function Report({ data, answers, comments, progress, onBack }) {
  const { t, lang } = useI18n();
  return (
    <div className="report">
      <div className="no-print navrow">
        <button className="btn" onClick={onBack}>{t('osc.see_sections')}</button>
        <button className="btn" onClick={() => window.print()}>{t('common.print')}</button>
      </div>
      <h1>{t('report.title', { name: safeStr(data.subject.name) })}</h1>
      <p className="lead">{t('report.intro')}</p>
      <table className="table">
        <thead><tr><th>{t('report.section')}</th><th>{t('answer.short_3')}</th><th>{t('answer.short_2')}</th><th>{t('answer.short_1')}</th><th>{t('answer.short_NA')}</th></tr></thead>
        <tbody>{progress.map(p => (
          <tr key={p.section.id}><td>{pick(p.section, 'name', lang)}</td><td>{p.counts['3']}</td><td>{p.counts['2']}</td><td>{p.counts['1']}</td><td>{p.counts.NA}</td></tr>
        ))}</tbody>
      </table>
      {data.sections.map(s => {
        const qs = data.questions.filter(q => q.section_id === s.id).sort(byAnswer(answers));
        return (
          <section key={s.id} className="rsec">
            <h2>{pick(s, 'name', lang)}</h2>
            <ul className="rlist">
              {qs.map(q => {
                const a = answers[q.id];
                return (
                  <li key={q.id}>
                    <span className={`chip c${a?.code || 'none'}`}>{a?.code ? t(`answer.short_${a.code}`) : (a?.value_text ? t('report.text_answer') : t('report.no_answer'))}</span>
                    <span>{pick(q, 'text', lang)}{a?.support ? <em className="tag">{t('report.support_requested')}</em> : null}</span>
                    {a?.coach_notes ? <p className="coachnote"><strong>{t('osc.coach_note')}</strong> {safeStr(a.coach_notes)}</p> : null}
                  </li>
                );
              })}
            </ul>
            {comments[s.num] ? <p className="muted">{t('osc.section_comment')} : {safeStr(comments[s.num])}</p> : null}
          </section>
        );
      })}
      {data.plan ? <PlanView items={data.plan} questions={data.questions} /> : null}
    </div>
  );
}

function PlanView({ items, questions }) {
  const { t, lang } = useI18n();
  const kept = (items || []).filter(i => i.kept !== false);
  return (
    <section className="rsec">
      <h2>{t('plan.title')}</h2>
      <table className="table">
        <thead><tr><th>{t('plan.priority')}</th><th>{t('plan.action')}</th><th>{t('plan.owner')}</th><th>{t('plan.due')}</th></tr></thead>
        <tbody>{kept.map(i => (
          <tr key={i.id}>
            <td>{safeStr(i.title) || pick(questions.find(q => q.id === i.questionId), 'text', lang)}</td>
            <td>{safeStr(i.action)}</td><td>{safeStr(i.owner)}</td><td>{safeStr(i.due)}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

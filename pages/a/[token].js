// Parcours OSC : Dashboard (point d'entrée), diagnostic par sections, enregistrement automatique, rapport
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import LinkBox from '../../components/LinkBox';
import Intro from '../../components/Intro';
import OscDashboard from '../../components/OscDashboard';
import Icon from '../../components/Icon';
import MailSent from '../../components/MailSent';
import { timelineSvg } from '../../lib/planCharts';
import { fmtDate } from '../../lib/planData';
import { useI18n, pick } from '../../lib/i18n';
import { safeStr } from '../../lib/safe';
import { contactName } from '../../lib/names';
import { sectionProgress, isScored, isProjectExtra, byAnswer } from '../../lib/scoring';

const SCALE = ['NA', '1', '2', '3'];

// ── File d'attente locale : brouillon gardé dans le navigateur et renvoyé au retour du réseau (F3) ──
const qKey = token => `ocat:pending:${String(token).slice(0, 16)}`;
const readQueue = token => { try { return JSON.parse(localStorage.getItem(qKey(token)) || '{}'); } catch { return {}; } };
const writeQueue = (token, q) => { try { localStorage.setItem(qKey(token), JSON.stringify(q)); } catch {} };

export default function OscPage() {
  const router = useRouter();
  const { query } = router;
  const token = query.token;
  const startedRef = useRef(false);
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [fatal, setFatal] = useState('');
  const [answers, setAnswers] = useState({});      // question_id → réponse
  const [comments, setComments] = useState({});    // n° section → texte
  const [deepen, setDeepen] = useState({});        // n° section → true/false
  const [view, setView] = useState('dashboard');  // 'dashboard' | 'home' | id de section | 'report'
  const [save, setSave] = useState('saved');       // saved | saving | offline | error
  const [saveError, setSaveError] = useState('');
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/osc/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await r.json();
      if (j.error) return setFatal(j.error);
      const byQ = Object.fromEntries(j.answers.map(a => [a.question_id, a]));
      const sc = { ...(j.assessment.section_comments || {}) };
      const dp = { ...(j.assessment.section_deepen || {}) };
      // Les modifications locales non envoyées l'emportent
      Object.values(readQueue(token)).forEach(p => {
        if (p.op === 'answer') byQ[p.questionId] = { ...(byQ[p.questionId] || {}), question_id: p.questionId, code: p.code, support: p.support, value_text: p.valueText };
        if (p.op === 'comment') sc[p.section] = p.text;
        if (p.op === 'deepen') dp[p.section] = p.value;
      });
      setAnswers(byQ); setComments(sc); setDeepen(dp); setData(j);
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

  useEffect(() => {
    if (!token) return;
    load();
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
  const setDeepenFor = (num, value) => {
    if (locked) return;
    setDeepen(d => ({ ...d, [num]: value }));
    queue(`d:${num}`, { op: 'deepen', section: String(num), value });
  };

  const saveProfile = async patch => {
    const r = await fetch('/api/osc/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, op: 'profile', patch }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'server_error');
    setData(d => ({ ...d, subject: { ...d.subject, ...patch } }));
  };

  const progress = useMemo(() => data ? sectionProgress(data.sections, data.questions, answers) : [], [data, answers]);
  const scoredProgress = progress.filter(p => p.section.kind !== 'data');   // les sections libres sont facultatives
  const allComplete = scoredProgress.length > 0 && scoredProgress.every(p => p.status === 'complete');
  const toTop = () => window.scrollTo(0, 0);

  // Reprise : première question sans réponse (F4) ; sans aucune réponse, page d'introduction
  const startOrResume = () => {
    const first = data.sections.map(s => ({ s, q: data.questions.find(x => x.section_id === s.id && isScored(x, s) && !answers[x.id]?.code) })).find(x => x.q);
    if (!first || !Object.keys(answers).length) { setView('home'); toTop(); return; }
    setView(first.s.id);
    setTimeout(() => document.getElementById(`q-${first.q.id}`)?.scrollIntoView({ block: 'center' }), 150);
  };

  // Arrivée depuis « Commencer le diagnostic » (?start=1) : on ouvre directement le questionnaire, pas le tableau de bord
  useEffect(() => {
    if (!data || startedRef.current || query.start !== '1') return;
    startedRef.current = true;
    startOrResume();
    router.replace({ pathname: router.pathname, query: { token } }, undefined, { shallow: true });   // le lien affiché ne garde pas ?start=1
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!window.confirm(t('osc.submit_confirm'))) return;
    await flush();
    const r = await fetch('/api/osc/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    const j = await r.json().catch(() => ({}));
    if (j.error) { setSaveError(j.error); setSave('error'); return; }
    await load(); setView('report'); toTop();
  };

  const resend = async () => {
    setResending(true);
    await fetch('/api/osc/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, lang }) }).catch(() => {});
    setResent(true); setResending(false);
  };

  if (fatal) return (
    <Layout>
      <div className="narrow hero empty">
        <h1>{t(`errors.title_${['invalid_link', 'expired_link', 'offline'].includes(fatal) ? fatal : 'generic'}`)}</h1>
        <p className="lead">{t(`errors.${fatal}`)}</p>
        {fatal === 'expired_link' ? (resent ? <MailSent title={t('osc.resent_title')}>{t('osc.resent')}</MailSent> : <button className="btn primary" aria-busy={resending} disabled={resending} onClick={resend}>{t('osc.resend')}</button>) : null}
        {fatal === 'offline' ? <button className="btn" onClick={() => location.reload()}>{t('common.retry')}</button> : null}
      </div>
    </Layout>
  );
  if (!data) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;

  const section = data.sections.find(s => s.id === view);
  const identity = { org: safeStr(data.subject.name), person: contactName(data.subject) };
  const status = <SaveStatus state={save} error={saveError} />;

  return (
    <Layout title={safeStr(data.subject.name)} right={status} identity={identity} onHome={() => { setView('dashboard'); toTop(); }}
      sidebar={<OscNav data={data} progress={progress} view={view} go={v => { setView(v); toTop(); }} />}>
      {locked ? <p className="banner">{t('osc.locked_banner')}</p> : null}
      {view === 'dashboard' ? (
        <>
          <OscDashboard data={data} progress={progress} locked={locked} saveProfile={saveProfile}
            onStart={startOrResume} onReport={() => { setView('report'); toTop(); }} />
          <PersonalLink />
        </>
      ) : view === 'plan' ? (
        <PlanPublic data={data} />
      ) : view === 'report' ? (
        <Report data={data} answers={answers} comments={comments} deepen={deepen} progress={progress} onBack={() => { setView('dashboard'); toTop(); }} />
      ) : section ? (
        <SectionView data={data} section={section} answers={answers} comment={comments[section.num] || ''}
          deepen={deepen[section.num]} setDeepen={v => setDeepenFor(section.num, v)}
          locked={locked} setAnswer={setAnswer} setComment={setComment}
          progress={progress.find(p => p.section.id === section.id)}
          onHome={() => { setView('home'); toTop(); }}
          next={data.sections[data.sections.findIndex(s => s.id === section.id) + 1]}
          onNext={s => { setView(s.id); toTop(); }} />
      ) : (
        <DiagnosticHome data={data} progress={progress} allComplete={allComplete} hasAnswers={Object.keys(answers).length > 0}
          onOpen={s => { setView(s.id); toTop(); }} onSubmit={submit} onReport={() => { setView('report'); toTop(); }}
          onBack={() => { setView('dashboard'); toTop(); }} />
      )}
    </Layout>
  );
}

function PersonalLink() {
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(window.location.href.split('#')[0]), []);
  return url ? <LinkBox url={url} /> : null;
}

function SaveStatus({ state, error }) {
  const { t } = useI18n();
  const label = state === 'error' && error ? t(`errors.${error}`) : t(`save.${state}`);
  return <span className={`save save-${state}`} role="status" aria-live="polite">{label}</span>;
}

// Page du diagnostic : introduction et sections
function DiagnosticHome({ data, progress, allComplete, hasAnswers, onOpen, onSubmit, onReport, onBack }) {
  const { t, lang } = useI18n();
  const st = data.assessment.status;
  return (
    <>
      <button className="link" onClick={onBack}>← {t('osc.back_dashboard')}</button>
      <div className="toolbar"><h1>{t('tools.ocat.title')}</h1><span className="pill">{t(`eval.${data.assessment.type}`)}</span></div>
      <Intro open={!hasAnswers} n={progress.filter(p => p.section.kind !== 'data').length} />
      {!hasAnswers && st === 'in_progress' && progress[0] ? <button className="btn primary big" onClick={() => onOpen(progress[0].section)}>{t('osc.start_first')}</button> : null}
      <div className="grid">
        {progress.map(p => (
          <button key={p.section.id} type="button" className={`tile ${p.status}`} onClick={() => onOpen(p.section)}>
            <span className="tile-num">{p.section.idx}{p.section.kind === 'data' ? <span className="pill grey">{t('osc.optional')}</span> : null}</span>
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
            ? <button className="btn ok big" onClick={onSubmit}>{t('osc.submit')}</button>
            : <p className="muted">{t('osc.submit_hint')}</p>
        ) : <button className="btn primary" onClick={onReport}>{t('osc.see_report')}</button>}
      </div>
    </>
  );
}

// Questions d'une section
function SectionView({ data, section, answers, comment, deepen, setDeepen, locked, setAnswer, setComment, progress, onHome, next, onNext }) {
  const { t, lang } = useI18n();
  const qs = data.questions.filter(q => q.section_id === section.id);
  const isData = section.kind === 'data';
  return (
    <>
      <button className="link" onClick={onHome}>← {t('osc.back_home')}</button>
      <h1>{pick(section, 'name', lang)}</h1>
      <p className="muted">{progress.done}/{progress.total} · {t(`status.${progress.status}`)}</p>
      <ol className="questions">
        {qs.map(q => <Question key={q.id} q={q} a={answers[q.id]} locked={locked} extra={isProjectExtra(q, section)} onChange={p => setAnswer(q, p)} />)}
      </ol>
      {isData ? <p className="muted small">{t('osc.data_hint')}</p> : (
        <div className="card deepen" role="group" aria-labelledby={`dp-${section.id}`}>
          <p className="h3" id={`dp-${section.id}`}>{t('osc.deepen_question')}</p>
          <p className="muted small">{t('osc.deepen_hint')}</p>
          <div className="deepen-opts">
            {[true, false].map(v => (
              <label key={String(v)} className={`opt small ${deepen === v ? 'on' : ''}`}>
                <input type="radio" name={`deepen-${section.id}`} checked={deepen === v} disabled={locked} onChange={() => setDeepen(v)} />
                <span>{t(v ? 'common.yes' : 'common.no')}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {isData ? null : (
        <div className="card comment">
          <label className="h3" htmlFor={`cm-${section.id}`}>{t('osc.section_comment')}</label>
          <textarea id={`cm-${section.id}`} rows={4} value={comment} disabled={locked} onChange={e => setComment(section.num, e.target.value)} />
        </div>
      )}
      <div className="navrow">
        <button className="btn" onClick={onHome}>{t('osc.back_home')}</button>
        {next ? <button className="btn primary" onClick={() => onNext(next)}>{t('osc.next_section', { name: pick(next, 'name', lang) })}</button> : null}
      </div>
    </>
  );
}

function Question({ q, a, locked, extra, onChange }) {
  const { t, lang } = useI18n();
  const [guide, setGuide] = useState(false);
  const name = `q-${q.id}`;
  const code = a?.code || null;
  return (
    <li id={name} className={`q ${code ? 'answered' : ''}`}>
      <p className="q-text">{q.code ? <span className="q-code">{q.code}</span> : null}{pick(q, 'text', lang)}{extra ? <span className="tag">{t('osc.extra')}</span> : null}</p>
      {a?.edited_by_coach ? <p className="tag">{t('osc.edited_by_coach')}</p> : null}
      {['text', 'short', 'number', 'choice'].includes(q.format) ? (
        <DataInput q={q} a={a} locked={locked} onChange={onChange} lang={lang} />
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

// Rapport OSC (sans score)
function Report({ data, answers, comments, deepen, progress, onBack }) {
  const { t, lang } = useI18n();
  return (
    <div className="report">
      <div className="no-print navrow">
        <button className="btn" onClick={onBack}>← {t('osc.back_dashboard')}</button>
        <button className="btn" onClick={() => window.print()}>{t('common.print')}</button>
      </div>
      <div className="toolbar"><h1>{t('report.title', { name: safeStr(data.subject.name) })}</h1><span className="pill">{t(`eval.${data.assessment.type}`)}</span></div>
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
            <h2>{pick(s, 'name', lang)}{deepen[s.num] ? <span className="tag">{t('osc.deepen_asked')}</span> : null}</h2>
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

// Réponses des questions de section libre : texte long, texte court, nombre, choix dans une liste
function DataInput({ q, a, locked, onChange, lang }) {
  const label = pick(q, 'text', lang);
  if (q.format === 'text') return <textarea aria-label={label} rows={3} disabled={locked} value={a?.value_text || ''} onChange={e => onChange({ value_text: e.target.value })} />;
  if (q.format === 'short') return <input aria-label={label} maxLength={300} disabled={locked} value={a?.value_text || ''} onChange={e => onChange({ value_text: e.target.value })} />;
  if (q.format === 'number') return <input aria-label={label} type="number" inputMode="decimal" step="any" disabled={locked} value={a?.value_text ?? ''} onChange={e => onChange({ value_text: e.target.value })} />;
  const opts = Array.isArray(q.options) ? q.options : [];
  return (
    <fieldset className="opts" disabled={locked}>
      <legend className="sr">{label}</legend>
      {opts.map(o => (
        <label key={o.key} className={`opt ${a?.value_text === o.key ? 'on' : ''}`}>
          <input type="radio" name={`q-${q.id}`} checked={a?.value_text === o.key} onChange={() => onChange({ value_text: o.key })} />
          <span>{(lang === 'en' && o.en) || o.fr}</span>
        </label>
      ))}
    </fieldset>
  );
}

// Menu latéral du parcours OSC : accès direct à chaque section, avec son avancement
function OscNav({ data, progress, view, go }) {
  const { t, lang } = useI18n();
  const submitted = data.assessment.status !== 'in_progress';
  return (
    <nav className="sidenav" aria-label={t('staff.menu')}>
      <button type="button" className={`sideitem ${view === 'dashboard' ? 'on' : ''}`} onClick={() => go('dashboard')}><Icon name="home" />{t('osc.nav_dashboard')}</button>
      <button type="button" className={`sideitem ${view === 'home' ? 'on' : ''}`} onClick={() => go('home')}><Icon name="list" />{t('osc.nav_diagnostic')}</button>
      <button type="button" className={`sideitem ${view === 'plan' ? 'on' : ''}`} onClick={() => go('plan')}><Icon name="clipboard" />{t('osc.nav_plan')}</button>
      {submitted ? <button type="button" className={`sideitem ${view === 'report' ? 'on' : ''}`} onClick={() => go('report')}><Icon name="file" />{t('osc.nav_report')}</button> : null}
      <p className="sidehead">{t('osc.nav_sections')}</p>
      {progress.map(p => (
        <button type="button" key={p.section.id} className={`sideitem sec ${view === p.section.id ? 'on' : ''}`} onClick={() => go(p.section.id)}>
          <span className={`sidestat ${p.status}`} />
          <span className="sidename">{p.section.idx}. {pick(p.section, 'name', lang)}</span>
          <span className="sidecount">{p.done}/{p.total}</span>
        </button>
      ))}
    </nav>
  );
}

// Plan d'accompagnement individuel : préparé par le coach, en lecture seule pour l'OSC (visible quand le coach l'a partagé)
function PlanPublic({ data }) {
  const { t, lang } = useI18n();
  const plan = data.plan || [];
  const q = id => data.questions.find(x => x.id === id);
  const cal = timelineSvg({ rows: plan.map((r, i) => ({ n: i + 1, label: r.action || pick(q(r.questionId), 'text', lang), due: r.due })), today: new Date(), lang, labels: { today: t('planx.today') }, responsive: true });
  return (
    <>
      <section className="hero2 compact">
        <div>
          <p className="eyebrow">{safeStr(data.subject.name)}</p>
          <h1 className="display sm">{t('osc.plan_title')}<br /><span className="accent">{t('osc.plan_accent')}</span></h1>
        </div>
        <div className="hero2-side"><p className="lead">{t('osc.plan_intro')}</p></div>
      </section>
      {plan.length === 0 ? (
        <div className="callout"><Icon name="clipboard" size={20} /><p>{t('osc.plan_empty')}</p></div>
      ) : (
        <>
          {cal.svg ? <section className="card pcal"><h2>{t('planx.calendar_title')}</h2><div dangerouslySetInnerHTML={{ __html: cal.svg }} /></section> : null}
          <ol className="planlist readonly">
            {plan.map((r, i) => {
              const qq = q(r.questionId);
              return (
                <li key={r.id || i}>
                  <div className="planrow-main">
                    <p className="q-text"><span className="numbadge">{i + 1}</span>{qq?.code ? <span className="q-code">{qq.code}</span> : null}{pick(qq, 'text', lang)}</p>
                    <dl className="planrow-fields">
                      <dt>{t('plan.action')}</dt><dd>{safeStr(r.action) || '—'}</dd>
                      <dt>{t('plan.owner')}</dt><dd>{safeStr(r.owner) || '—'}</dd>
                    </dl>
                  </div>
                  <div className="planrow-side"><span className="muted small">{t('plan.due')}</span><b>{r.due ? fmtDate(r.due, lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</b></div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}

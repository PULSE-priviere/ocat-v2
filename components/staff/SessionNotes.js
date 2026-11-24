// Colonne centrale : une question à la fois. Bloc pré-rempli en H2 (Notes / Actions / Responsable),
// parsé à l'enregistrement pour alimenter answers.coach_notes / coach_action / coach_owner.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n, pick } from '../../lib/i18n';

const H2 = /^##\s+(.+?)\s*$/;

function parseBlock(text) {
  const out = { coach_notes: '', coach_action: '', coach_owner: '' };
  if (!text) return out;
  const lines = String(text).split('\n');
  let bucket = 'coach_notes';
  let buf = [];
  const flush = () => { if (buf.length) out[bucket] = (out[bucket] ? out[bucket] + '\n' : '') + buf.join('\n').trim(); buf = []; };
  for (const line of lines) {
    const m = line.match(H2);
    if (m) {
      flush();
      const h = m[1].toLowerCase();
      if (/action/.test(h)) bucket = 'coach_action';
      else if (/responsa|owner/.test(h)) bucket = 'coach_owner';
      else bucket = 'coach_notes';
    } else buf.push(line);
  }
  flush();
  Object.keys(out).forEach(k => { out[k] = out[k].trim() || null; });
  return out;
}

function buildBlock(a, labels) {
  const n = String(a?.coach_notes || '').trim();
  const act = String(a?.coach_action || '').trim();
  const own = String(a?.coach_owner || '').trim();
  return `## ${labels.notes}\n${n}\n\n## ${labels.action}\n${act}\n\n## ${labels.owner}\n${own}\n`;
}

export default function SessionNotes({ question, answer, section, onSave, onPrev, onNext, hasPrev, hasNext, position, total }) {
  const { t, lang } = useI18n();
  const labels = useMemo(() => ({ notes: t('session.v1.h_notes'), action: t('session.v1.h_action'), owner: t('session.v1.h_owner') }), [t]);
  const [text, setText] = useState(() => buildBlock(answer, labels));
  const [state, setState] = useState('saved');
  const timer = useRef(null);
  const latest = useRef(text);

  // Recharge quand la question change (ou ses données externes)
  useEffect(() => {
    const next = buildBlock(answer, labels);
    setText(next);
    latest.current = next;
    setState('saved');
    return () => clearTimeout(timer.current);
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave
  useEffect(() => {
    if (text === latest.current) return;
    setState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const parsed = parseBlock(text);
      await onSave(parsed);
      latest.current = text;
      setState('saved');
    }, 700);
    return () => clearTimeout(timer.current);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush à la fermeture / changement de question
  useEffect(() => {
    const flush = () => { if (text !== latest.current) onSave(parseBlock(text)); };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush); };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (hasNext) onNext(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') { e.preventDefault(); if (hasNext) onNext(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') { e.preventDefault(); if (hasPrev) onPrev(); }
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
      <div className="sess-stage-crumb">
        {section ? <span>{section.idx}. {pick(section, 'name', lang)}</span> : null}
        {question.code ? <><span className="sep">·</span><span className="q-code">{question.code}</span></> : null}
        <span className="grow" />
        <span className="muted small">{t('session.v1.question_position', { n: position, total })}</span>
      </div>
      <h1 className="sess-stage-title">{pick(question, 'text', lang)}</h1>

      <div className="sess-stage-editor">
        <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey}
          spellCheck="true" aria-label={t('session.v1.notes')} />
        <div className="sess-stage-meta">
          <span className="muted small">{state === 'saving' ? t('session.v1.saving') : t('session.v1.saved')}</span>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onPrev} disabled={!hasPrev}>← {t('session.v1.prev')}</button>
          <button type="button" className="btn primary" onClick={onNext} disabled={!hasNext}>{t('session.v1.next')} →</button>
        </div>
        <p className="muted tiny">{t('session.v1.editor_hint')}</p>
      </div>
    </section>
  );
}

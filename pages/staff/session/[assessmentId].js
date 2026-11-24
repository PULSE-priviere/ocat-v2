// Écran de séance d'accompagnement : plein écran, hors du dashboard.
// Gauche : questions « appui demandé » groupées par section ;
// Centre : une question à la fois, bloc Markdown H2 (Notes / Actions / Responsable) parsé vers answers.coach_* ;
// Droite : récapitulatif = lignes du plan dans l'ordre choisi (flèches haut/bas), persistant action_plans.items.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import SessionAgenda from '../../../components/staff/SessionAgenda';
import SessionNotes from '../../../components/staff/SessionNotes';
import SessionRecap from '../../../components/staff/SessionRecap';
import { useI18n, pick } from '../../../lib/i18n';
import { useStaff } from '../../../lib/useStaff';
import { sb, staffApi } from '../../../lib/supabase';
import { loadBank } from '../../../lib/bank';
import { safeStr } from '../../../lib/safe';
import { planRows, wanted } from '../../../lib/plan';
import appConfig from '../../../app.config';

export default function SessionPage() {
  const router = useRouter();
  const { assessmentId } = router.query;
  const { t, lang } = useI18n();
  const staff = useStaff();

  const [assessment, setAssessment] = useState(null);
  const [subject, setSubject] = useState(null);
  const [project, setProject] = useState(null);
  const [bank, setBank] = useState(null);
  const [answers, setAnswers] = useState({});
  const [plan, setPlan] = useState({ items: [], status: 'draft' });
  const [selectedId, setSelectedId] = useState(null);
  const [savingItems, setSavingItems] = useState(false);
  const [msg, setMsg] = useState('');
  const [finishing, setFinishing] = useState(false);
  const planTimer = useRef(null);

  // Chargement
  useEffect(() => {
    if (!assessmentId || staff.loading) return;
    (async () => {
      const { data: a } = await sb().from('assessments')
        .select('*, subject:subjects(name, project:projects(id, name, framework_id))').eq('id', assessmentId).maybeSingle();
      if (!a) return setMsg('forbidden');
      const b = await loadBank(sb(), a.subject.project.framework_id, a.id, a.subject.project.id);
      const { data: ans } = await sb().from('answers').select('*').eq('assessment_id', a.id);
      const map = {};
      (ans || []).forEach(r => { map[r.question_id] = r; });
      const { data: pl } = await sb().from('action_plans').select('items, status').eq('assessment_id', a.id).maybeSingle();
      setAssessment(a); setSubject(a.subject); setProject(a.subject.project); setBank(b); setAnswers(map);
      setPlan({ items: Array.isArray(pl?.items) ? pl.items : [], status: pl?.status || 'draft' });
    })();
  }, [assessmentId, staff.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Liste ordonnée des questions « appui demandé » (pour la navigation ← →)
  const supportQs = useMemo(() => {
    if (!bank) return [];
    const bySec = new Map();
    (bank.sections || []).forEach(s => bySec.set(s.id, s.idx));
    return (bank.questions || []).filter(q => answers[q.id]?.support)
      .sort((a, b) => (bySec.get(a.section_id) || 99) - (bySec.get(b.section_id) || 99) || String(a.code || '').localeCompare(String(b.code || '')));
  }, [bank, answers]);

  useEffect(() => { if (!selectedId && supportQs.length) setSelectedId(supportQs[0].id); }, [supportQs, selectedId]);

  const selected = selectedId ? (bank?.questions || []).find(q => q.id === selectedId) : null;
  const section = selected ? (bank?.sections || []).find(s => s.id === selected.section_id) : null;
  const curIdx = selected ? supportQs.findIndex(q => q.id === selected.id) : -1;

  // Sauvegarde d'une question : parse vers coach_notes / coach_action / coach_owner
  const saveQuestion = useCallback(async (q, patch) => {
    const prev = answers[q.id] || {};
    const row = { assessment_id: assessmentId, question_id: q.id, ...patch };
    const { data, error } = await sb().from('answers')
      .upsert(row, { onConflict: 'assessment_id,question_id' }).select('id, edited_by_coach').single();
    if (error) return setMsg('server_error');
    setAnswers(prevMap => ({ ...prevMap, [q.id]: { ...prev, ...patch, id: data.id, edited_by_coach: data.edited_by_coach } }));
    // S'il y a du contenu, s'assurer qu'une ligne du plan existe
    if (wanted({ ...prev, ...patch })) ensureInPlan(q.id);
  }, [answers, assessmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ligne du plan
  const persistPlan = useCallback(next => {
    setPlan(next);
    setSavingItems(true);
    clearTimeout(planTimer.current);
    planTimer.current = setTimeout(async () => {
      const { error } = await sb().from('action_plans')
        .upsert({ assessment_id: assessmentId, items: next.items, status: next.status }, { onConflict: 'assessment_id' });
      setSavingItems(false);
      if (error) setMsg('server_error');
    }, 500);
  }, [assessmentId]);

  const ensureInPlan = useCallback(qid => {
    setPlan(cur => {
      if (cur.items.some(i => i.questionId === qid)) return cur;
      const next = { ...cur, items: [...cur.items, { questionId: qid, due: '', kept: true }] };
      clearTimeout(planTimer.current);
      planTimer.current = setTimeout(async () => {
        await sb().from('action_plans').upsert({ assessment_id: assessmentId, items: next.items, status: next.status }, { onConflict: 'assessment_id' });
      }, 500);
      return next;
    });
  }, [assessmentId]);

  // Récap : items dans l'ordre du plan + le reste (questions touchées mais pas encore classées) à la fin
  const recapItems = useMemo(() => {
    if (!bank) return [];
    const touched = (bank.questions || []).filter(q => wanted(answers[q.id])).map(q => q.id);
    const known = new Set(plan.items.map(i => i.questionId));
    const head = plan.items.filter(i => touched.includes(i.questionId));
    const tail = touched.filter(id => !known.has(id)).map(id => ({ questionId: id, due: '', kept: true }));
    return [...head, ...tail];
  }, [bank, answers, plan.items]);

  const reorder = next => persistPlan({ ...plan, items: next });

  const finishSession = async () => {
    setFinishing(true);
    // Flush éventuel de la ligne courante : déjà sauvegardé 700 ms après la dernière frappe.
    await sb().from('assessments').update({ session_status: 'done' }).eq('id', assessmentId);
    staffApi('sync_assessment', { assessmentId }).catch(() => {});
    router.replace(`/staff/subject/${assessment.subject_id}?tab=plan`);
  };

  if (msg === 'forbidden') return <main className="page"><p className="error">{t('errors.forbidden')}</p></main>;
  if (!assessment || !bank) return <main className="page"><p className="muted">{t('common.loading')}</p></main>;

  return (
    <div className="sess-mode">
      <Head><title>{t('session.v1.title')} · {safeStr(subject.name)}</title></Head>

      <header className="sess-topbar">
        <Link className="sess-exit" href={`/staff/subject/${assessment.subject_id}?tab=session`} aria-label={t('session.v1.exit')}>
          <span aria-hidden="true">✕</span>
        </Link>
        <div className="sess-top-ctx">
          <p className="sess-top-eyebrow">{t('session.v1.title')} · {safeStr(project?.name)}</p>
          <h1 className="sess-top-title">{safeStr(subject.name)}</h1>
        </div>
        <label className="sess-top-date">
          <span className="muted small">{t('session.v1.date')}</span>
          <input type="date" value={assessment.session_date || ''} onChange={async e => {
            const v = e.target.value || null;
            setAssessment(x => ({ ...x, session_date: v }));
            await sb().from('assessments').update({ session_date: v }).eq('id', assessmentId);
          }} />
        </label>
        <div className="sess-top-stats muted small">
          {supportQs.length ? t('session.v1.counter_questions', { n: (bank.questions || []).filter(q => wanted(answers[q.id])).length, total: supportQs.length }) : t('session.v1.no_support')}
        </div>
        <span className="sess-top-save muted small">{savingItems ? t('session.v1.saving') : t('session.v1.saved')}</span>
        <button type="button" className="btn primary sess-top-finish" onClick={finishSession} disabled={finishing}>{t('session.v1.finish')}</button>
      </header>

      <div className="sess-canvas">
        <SessionAgenda bank={bank} answers={answers} selectedId={selectedId} onSelect={setSelectedId} />
        <SessionNotes question={selected} answer={selected ? answers[selected.id] : null} section={section}
          onSave={patch => selected && saveQuestion(selected, patch)}
          onPrev={() => setSelectedId(supportQs[Math.max(0, curIdx - 1)]?.id || null)}
          onNext={() => setSelectedId(supportQs[Math.min(supportQs.length - 1, curIdx + 1)]?.id || null)}
          hasPrev={curIdx > 0} hasNext={curIdx >= 0 && curIdx < supportQs.length - 1}
          position={curIdx + 1} total={supportQs.length} />
        <SessionRecap items={recapItems} bank={bank} answers={answers} onReorder={reorder}
          selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </div>
  );
}

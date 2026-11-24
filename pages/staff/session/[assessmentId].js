// Écran de séance d'accompagnement (v1 sans IA).
// Reprend une séance draft existante ou en crée une neuve à l'ouverture.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../../components/Layout';
import StaffNav from '../../../components/staff/StaffNav';
import SessionAgenda from '../../../components/staff/SessionAgenda';
import SessionNotes from '../../../components/staff/SessionNotes';
import SessionRecap from '../../../components/staff/SessionRecap';
import { useI18n } from '../../../lib/i18n';
import { useStaff } from '../../../lib/useStaff';
import { sb, staffApi } from '../../../lib/supabase';
import { fullName } from '../../../lib/names';
import { safeStr } from '../../../lib/safe';
import { buildPlanMarkdown } from '../../../lib/planMarkdown';
import { loadBank } from '../../../lib/bank';
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
  const [needs, setNeeds] = useState([]);
  const [statuses, setStatuses] = useState([]);           // need_status pour ce diagnostic
  const [sessions, setSessions] = useState([]);           // toutes les coaching_sessions du diagnostic
  const [session, setSession] = useState(null);           // la séance en cours (draft)
  const [lastSession, setLastSession] = useState(null);   // la dernière séance done, avec ses statuses d'alors (approximés)
  const [insertSignal, setInsertSignal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');

  // Chargement initial
  useEffect(() => {
    if (!assessmentId || staff.loading) return;
    (async () => {
      const { data: a } = await sb().from('assessments')
        .select('*, subject:subjects(*, project:projects(id, name, framework_id, sessions_target), coach:profiles(name, first_name, last_name, email))')
        .eq('id', assessmentId).maybeSingle();
      if (!a) return setMsg('forbidden');
      const b = await loadBank(sb(), a.subject.project.framework_id, a.id, a.subject.project.id);
      const { data: nd } = await sb().from('needs').select('id, label').eq('project_id', a.subject.project.id).order('label');
      const { data: ans } = await sb().from('answers').select('*').eq('assessment_id', a.id);
      const map = {};
      (ans || []).forEach(r => { map[r.question_id] = r; });
      const ids = (ans || []).map(r => r.id);
      if (ids.length) {
        const { data: links } = await sb().from('answer_needs').select('answer_id, need_id').in('answer_id', ids);
        (ans || []).forEach(r => { r.needIds = (links || []).filter(l => l.answer_id === r.id).map(l => l.need_id); });
      }
      const { data: st } = await sb().from('need_status').select('*').eq('assessment_id', a.id);
      const { data: ss } = await sb().from('coaching_sessions').select('*').eq('assessment_id', a.id).order('session_date');

      let cur = (ss || []).find(s => s.status === 'draft');
      if (!cur) {
        const { data: created, error } = await sb().from('coaching_sessions')
          .insert({ assessment_id: a.id, created_by: staff.profile?.id || null }).select('*').single();
        if (error) return setMsg('server_error');
        cur = created;
      }
      const done = (ss || []).filter(s => s.status === 'done').sort((x, y) => String(y.session_date).localeCompare(String(x.session_date)));
      setAssessment(a); setSubject(a.subject); setProject(a.subject.project); setBank(b);
      setNeeds(nd || []); setAnswers(map); setStatuses(st || []);
      setSessions([...(ss || []).filter(s => s.id !== cur.id), cur]); setSession(cur);
      setLastSession(done[0] ? { ...done[0], statuses: (st || []).filter(s => s.last_session_id === done[0].id) } : null);
    })();
  }, [assessmentId, staff.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compteur « Séances N / objectif »
  const sessionsDone = sessions.filter(s => s.status === 'done').length;
  const target = project?.sessions_target || null;

  // Patch sur un need_status (upsert)
  const upsertStatus = useCallback(async (needId, patch) => {
    const prev = statuses.find(s => s.need_id === needId) || { need_id: needId, assessment_id: assessmentId, status: 'todo' };
    const next = { ...prev, ...patch };
    setStatuses(list => {
      const i = list.findIndex(s => s.need_id === needId);
      if (i < 0) return [...list, next];
      const copy = list.slice(); copy[i] = next; return copy;
    });
    const row = { assessment_id: assessmentId, need_id: needId, ...patch };
    const { error } = await sb().from('need_status').upsert(row, { onConflict: 'assessment_id,need_id' });
    if (error) setMsg('server_error');
  }, [statuses, assessmentId]);

  // Besoin mentionné : passe todo → discussed
  const onMentionNeed = useCallback(needId => {
    const cur = statuses.find(s => s.need_id === needId);
    if (!cur || cur.status === 'todo') upsertStatus(needId, { status: 'discussed' });
  }, [statuses, upsertStatus]);

  // Enregistrement des notes
  const saveNotes = useCallback(async (notes) => {
    if (!session) return;
    setSession(s => ({ ...s, notes }));
    const { error } = await sb().from('coaching_sessions').update({ notes }).eq('id', session.id);
    if (error) setMsg('server_error');
  }, [session]);

  // Besoins « abordés » dans CETTE séance : ceux dont le statut est discussed OU qui sont mentionnés @…
  const discussedInSession = useMemo(() => {
    const mentionned = new Set();
    const notes = session?.notes || '';
    (needs || []).forEach(n => { if (notes.includes(`@${n.label}`)) mentionned.add(n.id); });
    const fromStatus = new Set((statuses || []).filter(s => s.status === 'discussed').map(s => s.need_id));
    const ids = new Set([...mentionned, ...fromStatus]);
    return (needs || []).filter(n => ids.has(n.id));
  }, [session, needs, statuses]);

  const planMd = useMemo(() => {
    if (!subject || !assessment) return '';
    return buildPlanMarkdown({
      subject: { name: subject.name, sessions_target: target },
      assessment: { coachName: fullName(subject.coach), sessions_target: target },
      needs, statuses, sessions, lang,
    });
  }, [subject, assessment, needs, statuses, sessions, target, lang]);

  const downloadMd = () => {
    const blob = new Blob([planMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${t('session.v1.plan_filename')}-${subject?.name || ''}.md`.replace(/\s+/g, '-');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const copyMd = async () => { try { await navigator.clipboard.writeText(planMd); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };

  const finishSession = async () => {
    if (!session) return;
    const { error } = await sb().from('coaching_sessions').update({ status: 'done' }).eq('id', session.id);
    if (error) return setMsg('server_error');
    // last_session_id sur les besoins abordés
    const ids = discussedInSession.map(n => n.id);
    if (ids.length) {
      await Promise.all(ids.map(nid => sb().from('need_status').upsert({ assessment_id: assessmentId, need_id: nid, last_session_id: session.id, status: statuses.find(s => s.need_id === nid)?.status || 'discussed' }, { onConflict: 'assessment_id,need_id' })));
    }
    if (assessment.session_status !== 'done') {
      await sb().from('assessments').update({ session_status: 'in_progress' }).eq('id', assessmentId);
    }
    staffApi('sync_assessment', { assessmentId }).catch(() => {});
    router.replace(`/staff/subject/${assessment.subject_id}?tab=session`);
  };

  if (msg === 'forbidden') return <Layout><p className="error">{t('errors.forbidden')}</p></Layout>;
  if (!assessment || !bank || !session) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;

  const identity = { org: appConfig.orgName, person: fullName(staff.profile), href: '/staff/profile' };
  return (
    <Layout wide title={safeStr(subject.name)} home="/staff" identity={identity}
      sidebar={<StaffNav staff={staff} project={project} active="cohort" onSignOut={async () => { await staff.signOut(); router.replace('/login'); }} />}>
      <Link className="link" href={`/staff/subject/${assessment.subject_id}?tab=session`}>← {t('session.v1.back')}</Link>
      <header className="sess-bar">
        <h1 className="h1-small">{safeStr(subject.name)}</h1>
        <label>{t('session.v1.date')}
          <input type="date" value={session.session_date || ''} onChange={async e => {
            const v = e.target.value || null;
            setSession(s => ({ ...s, session_date: v }));
            await sb().from('coaching_sessions').update({ session_date: v }).eq('id', session.id);
          }} />
        </label>
        {target ? <span className="pill">{t('session.v1.counter', { n: sessionsDone, target })}</span> : null}
        <span className="grow" />
        <button className="btn glass" onClick={copyMd}>{copied ? t('common.copied') : t('session.v1.copy_notion')}</button>
        <button className="btn glass" onClick={downloadMd}>{t('session.v1.download_md')}</button>
        <button className="btn primary" onClick={finishSession}>{t('session.v1.finish')}</button>
      </header>
      {msg && msg !== 'forbidden' ? <p className="error">{t(`errors.${msg}`)}</p> : null}
      <div className="sess-grid">
        <SessionAgenda needs={needs} statuses={statuses} lastSession={lastSession}
          deepenSections={Object.entries(assessment.section_deepen || {}).filter(([, v]) => v).map(([k]) => Number(k))}
          answers={answers} bank={bank}
          onInsertMention={text => setInsertSignal({ text, ts: Date.now() })}
          onSetStatus={(needId, status) => upsertStatus(needId, { status })} />
        <SessionNotes value={session.notes || ''} needs={needs} onSave={saveNotes}
          onMentionNeed={onMentionNeed} insertSignal={insertSignal} />
        <SessionRecap discussedNeeds={discussedInSession} statuses={statuses}
          onSave={(needId, patch) => upsertStatus(needId, patch)} />
      </div>
    </Layout>
  );
}

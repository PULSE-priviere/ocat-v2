// Fiche OSC : récapitulatif, session d'accompagnement, plan d'accompagnement, paramètres
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../../components/Layout';
import StaffNav from '../../../components/staff/StaffNav';
import { StageTracker } from '../../../components/staff/StageBadge';
import { stageOf } from '../../../lib/stage';
import OrgInfoForm from '../../../components/OrgInfoForm';
import Recap from '../../../components/staff/Recap';
import SessionTab from '../../../components/staff/SessionTab';
import PlanEditor from '../../../components/staff/PlanEditor';
import SettingsTab from '../../../components/staff/SettingsTab';
import { useI18n } from '../../../lib/i18n';
import { useStaff } from '../../../lib/useStaff';
import { sb, staffApi, fetchIn } from '../../../lib/supabase';
import { loadBank } from '../../../lib/bank';
import { buildSeries } from '../../../lib/planData';
import { fullName } from '../../../lib/names';
import { safeStr } from '../../../lib/safe';
import { sectionProgress, EVAL_ORDER } from '../../../lib/scoring';
import appConfig from '../../../app.config';

const TABS = ['recap', 'session', 'plan', 'settings'];

export default function SubjectPage() {
  const router = useRouter();
  const { query } = router;
  const { t, lang } = useI18n();
  const staff = useStaff();
  const [subject, setSubject] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [current, setCurrent] = useState(null);
  const [bank, setBank] = useState(null);
  const [answers, setAnswers] = useState({});
  const [allAnswers, setAllAnswers] = useState({});   // assessment_id → { question_id → réponse } (radar)
  const [needs, setNeeds] = useState([]);
  const [tab, setTab] = useState('recap');
  const [planStatus, setPlanStatus] = useState(null);
  useEffect(() => { if (typeof query.tab === 'string' && TABS.includes(query.tab)) setTab(query.tab); }, [query.tab]);   // ex. /staff/subject/…?tab=session
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(x => x + 1), []);

  // Chargement : OSC, évaluations, questions (banque + section du projet), réponses, besoins
  useEffect(() => {
    if (!query.id || staff.loading) return;
    (async () => {
      const { data: s } = await sb().from('subjects')
        .select('*, project:projects(id, name, framework_id, countries, org_types), coach:profiles(name, first_name, last_name, email)').eq('id', query.id).maybeSingle();
      if (!s) return setMsg('forbidden');
      const { data: list } = await sb().from('assessments').select('*').eq('subject_id', s.id);
      const sorted = (list || []).sort((a, b) => EVAL_ORDER.indexOf(a.type) - EVAL_ORDER.indexOf(b.type) || a.created_at.localeCompare(b.created_at));
      const cur = sorted.find(a => a.id === current?.id) || sorted[sorted.length - 1] || null;
      const b = await loadBank(sb(), s.project.framework_id, cur?.id, s.project.id);
      const ans = sorted.length ? await fetchIn(ids => sb().from('answers').select('*').in('assessment_id', ids), sorted.map(a => a.id)) : [];
      const all = {};
      ans.forEach(a => { (all[a.assessment_id] = all[a.assessment_id] || {})[a.question_id] = a; });
      const curAns = all[cur?.id] || {};
      const ids = Object.values(curAns).map(a => a.id);
      const links = ids.length ? await fetchIn(chunk => sb().from('answer_needs').select('answer_id, need_id').in('answer_id', chunk), ids) : [];
      Object.values(curAns).forEach(a => { a.needIds = links.filter(l => l.answer_id === a.id).map(l => l.need_id); });
      if (cur) { const { data: pl } = await sb().from('action_plans').select('status').eq('assessment_id', cur.id).maybeSingle(); setPlanStatus(pl?.status || null); }
      const { data: nd } = await sb().from('needs').select('id, label').eq('project_id', s.project.id).order('label');
      setSubject(s); setAssessments(sorted); setCurrent(cur); setBank(b); setAllAnswers(all); setAnswers({ ...curAns }); setNeeds(nd || []);
    })();
  }, [query.id, staff.loading, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useMemo(() => bank ? sectionProgress(bank.sections, bank.questions, answers) : [], [bank, answers]);

  // Écriture d'un ou plusieurs champs d'une réponse : seules les colonnes modifiées sont envoyées (journalisé par la base)
  const saveAnswer = async (q, patch) => {
    const prev = answers[q.id] || {};
    const row = { ...patch };
    if ('code' in row && !['1', '2'].includes(row.code)) row.support = null;
    setAnswers(a => ({ ...a, [q.id]: { ...prev, ...a[q.id], ...row } }));
    const { data, error } = await sb().from('answers')
      .upsert({ assessment_id: current.id, question_id: q.id, ...row }, { onConflict: 'assessment_id,question_id' }).select('id, edited_by_coach').single();
    if (error) { setMsg('server_error'); throw error; }
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

  // Mise à jour immédiate à l'écran, puis enregistrement ; retour en arrière en cas d'échec
  const updateAssessment = async patch => {
    const before = current;
    const apply = c => ({ ...c, ...patch });
    setCurrent(apply); setAssessments(list => list.map(a => (a.id === before.id ? apply(a) : a)));
    const { error } = await sb().from('assessments').update(patch).eq('id', before.id);
    if (error) { setCurrent(before); setAssessments(list => list.map(a => (a.id === before.id ? before : a))); setMsg('server_error'); throw error; }
    if (patch.session_status === 'done') staffApi('sync_assessment', { assessmentId: before.id }).catch(() => {});   // session terminée : envoyée à Airtable
  };

  const action = async (name, body) => {
    setMsg('');
    try { const r = await staffApi(name, { ...body, lang }); if (r.url) setLink(r.url); reload(); return r; }
    catch (e) { setMsg(e.message); }
  };

  if (msg === 'forbidden') return <Layout><p className="error">{t('errors.forbidden')}</p></Layout>;
  if (!subject || !bank) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;

  // Profil : une série par type d'évaluation (clés normalisées), valeurs provisoires incluses
  const series = buildSeries({ assessments, allAnswers, bank, t });

  const hasWork = Object.values(answers).some(a => String(a.coach_notes || '').trim() || String(a.coach_action || '').trim());
  const stage = stageOf({ assessment: current, plan: planStatus ? { status: planStatus } : null, hasWork });
  const identity = { org: appConfig.orgName, person: fullName(staff.profile), href: '/staff/profile' };
  return (
    <Layout wide title={safeStr(subject.name)} home="/staff" identity={identity}
      sidebar={<StaffNav staff={staff} project={subject.project} active="cohort" onSignOut={async () => { await staff.signOut(); router.replace('/login'); }} />}>
      <Link className="link" href={`/staff?p=${subject.project.id}&tab=cohort`}>← {t('subject.back')}</Link>
      <div className="subjhead">
        <h1 className="h1-small">{safeStr(subject.name)}</h1>
        {current ? <span className="pill">{t(`eval.${current.type}`)}</span> : null}
        {current ? <span className={`pill ${current.status === 'locked' ? 'amber' : current.status === 'submitted' ? 'green' : 'grey'}`}>{t(`astatus.${current.status}`)}</span> : null}
        {assessments.length > 1 ? (
          <select className="evalpick" aria-label={t('cohort.evaluation')} value={current?.id || ''} onChange={e => { setCurrent(assessments.find(a => a.id === e.target.value)); reload(); }}>
            {assessments.map(a => <option key={a.id} value={a.id}>{t(`eval.${a.type}`)} · {new Date(a.created_at).toLocaleDateString(lang)}</option>)}
          </select>
        ) : null}
      </div>

      <OrgInfoForm compact countries={subject.project.countries} orgTypes={subject.project.org_types || []} value={subject}
        rows={[{ label: t('dashboard.project'), value: subject.project?.name }, { label: t('dashboard.coach'), value: fullName(subject.coach) }]}
        onSave={async f => {
          const { error } = await sb().from('subjects').update({
            contact_first_name: f.contact_first_name.trim(), contact_last_name: f.contact_last_name.trim(),
            country: f.country || null, org_type: f.org_type || null, org_size: f.org_size || null }).eq('id', subject.id);
          if (error) throw new Error('server_error');
          reload();
        }} />
      {msg && msg !== 'forbidden' ? <p className="error">{t(`errors.${msg}`)}</p> : null}

      {current ? <StageTracker stage={stage} date={current.session_date} /> : null}
      <nav className="tabs" role="tablist">
        {TABS.map(k => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`subject.tab_${k}`)}</button>)}
      </nav>
      {tab === 'settings' || !current ? (
        <SettingsTab assessment={current} link={link} onAction={action} onUpdate={updateAssessment}
          onCreateAssessment={type => action('create_assessment', { subjectId: subject.id, type })} />
      ) : tab === 'recap' ? (
        <Recap bank={bank} progress={progress} answers={answers} series={series} assessment={current} saveAnswer={saveAnswer} onStartSession={() => setTab('session')} />
      ) : tab === 'session' ? (
        <SessionTab hasWork={hasWork} onUpdate={updateAssessment} bank={bank} answers={answers} comments={current.section_comments || {}} needs={needs} assessment={current}
          saveAnswer={saveAnswer} toggleNeed={toggleNeed} addNeed={addNeed} onQuestionAdded={reload} />
      ) : (
        <PlanEditor assessment={current} bank={bank} answers={answers} onStatus={setPlanStatus} goSession={() => setTab('session')} />
      )}
    </Layout>
  );
}

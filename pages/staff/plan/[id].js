// Plan d'accompagnement : aperçu, PDF (impression du navigateur) et Word (.docx), en français ou en anglais
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import PlanDocument from '../../../components/PlanDocument';
import { useI18n } from '../../../lib/i18n';
import { sb, fetchIn } from '../../../lib/supabase';
import { loadBank } from '../../../lib/bank';
import { buildPlanData } from '../../../lib/planData';
import { radarSvg, barsSvg, timelineSvg } from '../../../lib/planCharts';
import { fullName } from '../../../lib/names';
import { safeStr } from '../../../lib/safe';
import appConfig from '../../../app.config';

export default function PlanExport() {
  const { query } = useRouter();
  const { t, lang, setLang } = useI18n();
  const [raw, setRaw] = useState(null);
  const [state, setState] = useState('');          // '' | 'preparing' | 'done' | 'error'
  const started = useRef(false);

  useEffect(() => { if (query.lang && query.lang !== lang) setLang(query.lang); }, [query.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!query.id) return;
    (async () => {
      const { data: a } = await sb().from('assessments')
        .select('*, subject:subjects(name, project:projects(id, name, framework_id), coach:profiles(name, first_name, last_name, email))').eq('id', query.id).maybeSingle();
      if (!a) return setRaw({ error: true });
      const bank = await loadBank(sb(), a.subject.project.framework_id, a.id, a.subject.project.id);
      const { data: list } = await sb().from('assessments').select('id, type, created_at').eq('subject_id', a.subject_id);
      const ans = await fetchIn(ids => sb().from('answers').select('assessment_id, question_id, code, support, coach_notes, coach_action, coach_owner').in('assessment_id', ids), (list || []).map(x => x.id));
      const allAnswers = {};
      ans.forEach(x => { (allAnswers[x.assessment_id] = allAnswers[x.assessment_id] || {})[x.question_id] = x; });
      const { data: plan } = await sb().from('action_plans').select('items, status').eq('assessment_id', a.id).maybeSingle();
      setRaw({ a, bank, assessments: list || [], allAnswers, plan });
    })();
  }, [query.id]);

  const d = useMemo(() => (raw && !raw.error ? buildPlanData({
    lang, t, orgName: appConfig.orgName, logoUrl: appConfig.logoUrl, subjectName: safeStr(raw.a.subject.name), projectName: safeStr(raw.a.subject.project.name),
    coachName: fullName(raw.a.subject.coach), assessment: raw.a, assessments: raw.assessments, allAnswers: raw.allAnswers, bank: raw.bank,
    planItems: raw.plan?.items || [], planStatus: raw.plan?.status || 'draft' }) : null), [raw, lang, t]);

  const makeDocx = async () => {
    setState('preparing');
    try {
      const [{ planDocxBlob, planFileName }, { svgToPng, loadLogoPng }] = await Promise.all([import('../../../lib/planDocx'), import('../../../lib/svgToPng')]);
      const radar = radarSvg({ labels: d.sections.map(s => `S${s.idx}`), series: d.series, size: 340 });
      const bars = barsSvg({ items: d.sections.map(s => ({ label: `${s.idx}. ${s.name}`, value: s.score })), width: 340 });
      const cal = timelineSvg({ rows: d.rows.map(r => ({ n: r.n, label: r.action || r.question, due: r.due })), today: new Date(`${d.today}T12:00:00`), width: 680, lang, labels: { today: t('planx.today') } });
      const png = async c => (c.svg ? { data: await svgToPng(c.svg, c.w, c.h), w: c.w, h: c.h } : null);
      const images = { radar: await png(radar), bars: await png(bars), timeline: await png(cal) };
      if (appConfig.logoUrl) { try { images.logo = await loadLogoPng(appConfig.logoUrl, 28); } catch { /* sans logo */ } }
      const blob = await planDocxBlob({ d, t, lang, images });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = planFileName(d, lang);
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setState('done');
    } catch (e) { console.error('export word', e); setState('error'); }
  };

  // Ouverture depuis l'onglet Plan : format=pdf lance l'impression, format=docx le téléchargement (une fois la langue appliquée)
  useEffect(() => {
    if (!d || started.current || (query.lang && query.lang !== lang)) return;
    started.current = true;
    if (query.format === 'docx') makeDocx();
    else if (query.format === 'pdf') setTimeout(() => window.print(), 600);
  }, [d, lang, query.lang, query.format]); // eslint-disable-line react-hooks/exhaustive-deps

  if (raw?.error) return <p className="page error">{t('errors.forbidden')}</p>;
  if (!d) return <p className="page">{t('common.loading')}</p>;
  return (
    <main className="plandoc-wrap">
      <Head><title>{t('plan.title')} · {d.meta.org}</title></Head>
      <div className="plantoolbar no-print">
        <Link className="btn" href={`/staff/subject/${raw.a.subject_id}`}>← {t('planx.back')}</Link>
        <button className="btn info" onClick={() => window.print()}>{t('planx.print')}</button>
        <button className="btn ok" onClick={makeDocx} disabled={state === 'preparing'}>{state === 'done' ? t('planx.redownload') : t('planx.download_word')}</button>
        {state === 'preparing' ? <span className="muted small">{t('planx.preparing')}</span> : null}
        {state === 'done' ? <span className="ok small">{t('planx.downloaded')}</span> : null}
        {state === 'error' ? <span className="error small">{t('planx.error')}</span> : null}
      </div>
      <PlanDocument d={d} t={t} lang={lang} />
    </main>
  );
}

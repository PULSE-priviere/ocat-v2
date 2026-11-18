// Plan imprimable (Enregistrer en PDF depuis le navigateur), FR ou EN, avec les scores par section
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useI18n, pick } from '../../../lib/i18n';
import { sb } from '../../../lib/supabase';
import { loadBank } from '../../../lib/bank';
import { planRows } from '../../../lib/plan';
import { safeStr, safeNum } from '../../../lib/safe';
import { sectionProgress, sectionScore, globalScore } from '../../../lib/scoring';
import appConfig from '../../../app.config';

export default function PlanPrint() {
  const { query } = useRouter();
  const { t, lang, setLang } = useI18n();
  const [d, setD] = useState(null);
  useEffect(() => { if (query.lang && query.lang !== lang) setLang(query.lang); }, [query.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!query.id) return;
    (async () => {
      const { data: a } = await sb().from('assessments').select('*, subject:subjects(name, project:projects(id, name, framework_id))').eq('id', query.id).maybeSingle();
      if (!a) return setD({ error: true });
      const bank = await loadBank(sb(), a.subject.project.framework_id, a.id, a.subject.project.id);
      const { data: ans } = await sb().from('answers').select('question_id, code, support, coach_notes, coach_action, coach_owner').eq('assessment_id', a.id);
      const { data: plan } = await sb().from('action_plans').select('*').eq('assessment_id', a.id).maybeSingle();
      const byQ = Object.fromEntries((ans || []).map(x => [x.question_id, x]));
      setD({ a, bank, plan, rows: planRows(bank.questions, byQ, plan?.items).filter(r => r.kept), progress: sectionProgress(bank.sections, bank.questions, byQ) });
    })();
  }, [query.id]);
  useEffect(() => { if (d && !d.error) setTimeout(() => window.print(), 400); }, [d, lang]);

  if (!d) return <p className="page">{t('common.loading')}</p>;
  if (d.error) return <p className="page error">{t('errors.forbidden')}</p>;
  const g = globalScore(d.progress);
  return (
    <main className="page print-doc">
      <Head><title>{t('plan.title')} · {safeStr(d.a.subject.name)}</title></Head>
      {appConfig.logoUrl ? <img className="print-logo" src={appConfig.logoUrl} alt="" /> : null}
      <h1>{t('plan.title')}</h1>
      <p className="lead">{safeStr(d.a.subject.name)} · {safeStr(d.a.subject.project.name)} · {t(`eval.${d.a.type}`)} · {t(`plan.status_${d.plan?.status || 'draft'}`)}</p>
      <h2>{t('sheet.scores')}</h2>
      <table className="table"><tbody>
        {d.progress.map(p => { const s = sectionScore(p); return <tr key={p.section.id}><td>{p.section.idx}. {pick(p.section, 'name', lang)}</td><td>{safeNum(s) !== null ? s.toFixed(2) : '—'}</td></tr>; })}
        <tr className="total"><td>{t('sheet.global')}</td><td>{safeNum(g) !== null ? g.toFixed(2) : '—'}</td></tr>
      </tbody></table>
      <h2>{t('plan.actions')}</h2>
      <table className="table">
        <thead><tr><th>#</th><th>{t('plan.priority')}</th><th>{t('plan.action')}</th><th>{t('plan.owner')}</th><th>{t('plan.due')}</th></tr></thead>
        <tbody>{d.rows.map((r, n) => (
          <tr key={r.q.id}>
            <td>{n + 1}</td>
            <td>{pick(r.q, 'text', lang)}</td>
            <td>{safeStr(r.a.coach_action)}{r.a.coach_notes ? <div className="muted small">{safeStr(r.a.coach_notes)}</div> : null}</td>
            <td>{safeStr(r.a.coach_owner)}</td><td>{safeStr(r.due)}</td>
          </tr>
        ))}</tbody>
      </table>
      <button className="btn no-print" onClick={() => window.print()}>{t('common.print')}</button>
    </main>
  );
}

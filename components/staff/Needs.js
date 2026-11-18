// F20 besoins agrégés + export CSV ; F21 questions les plus faibles
import { useState } from 'react';
import Link from 'next/link';
import { useI18n, pick } from '../../lib/i18n';
import { safeStr } from '../../lib/safe';
import { downloadCsv } from '../../lib/csv';

export default function Needs({ project, cohort, needs }) {
  const { t, lang } = useI18n();
  const maxN = Math.max(1, ...needs.agg.map(a => a.subjects.length));
  const exportCsv = () => downloadCsv(`besoins-${project.name}.csv`, [
    [t('needs.need'), t('needs.count'), t('needs.oscs')],
    ...needs.agg.map(a => [a.need.label, a.subjects.length, a.subjects.map(s => s.name).join(', ')]),
  ]);

  // F21 : nombre de réponses 1 par question sur la dernière évaluation de chaque OSC
  const ones = {};
  cohort.rows.forEach(r => {
    if (!r.current) return;
    Object.values(cohort.byAssessment[r.current.id] || {}).forEach(a => { if (a.code === '1') ones[a.question_id] = (ones[a.question_id] || 0) + 1; });
  });
  const weakest = cohort.questions.filter(q => ones[q.id]).sort((a, b) => ones[b.id] - ones[a.id]).slice(0, 10);

  return (
    <>
      <div className="toolbar"><h2>{t('needs.title')}</h2>{needs.agg.length ? <button className="btn info" onClick={exportCsv}>{t('common.export_csv')}</button> : null}</div>
      {needs.agg.every(a => !a.subjects.length) ? <p className="empty-inline">{t('needs.empty')}</p> : (
        <div className="card flush">
          <table className="table needs-table">
            <thead><tr><th>{t('needs.need')}</th><th>{t('needs.count')}</th><th>{t('needs.oscs')}</th></tr></thead>
            <tbody>{needs.agg.filter(a => a.subjects.length).map(a => (
              <tr key={a.need.id}>
                <td><b>{safeStr(a.need.label)}</b></td>
                <td className="nt-count"><span className="nt-bar"><span style={{ width: `${(a.subjects.length / maxN) * 100}%` }} /></span><b>{a.subjects.length}</b></td>
                <td><div className="chips">{a.subjects.map(s => <Link key={s.id} className="chiplink" href={`/staff/subject/${s.id}`}>{safeStr(s.name)}</Link>)}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <h2>{t('needs.weakest')}</h2>
      <p className="muted small">{t('needs.weakest_hint')}</p>
      {weakest.length === 0 ? <p className="empty-inline">{t('needs.weakest_empty')}</p> : (
        <table className="table"><tbody>{weakest.map(q => (
          <tr key={q.id}><td className="num">{ones[q.id]}</td><td><span className="q-code">{q.code}</span>{pick(q, 'text', lang)}</td></tr>
        ))}</tbody></table>
      )}
    </>
  );
}

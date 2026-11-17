// F29 historique des modifications du projet
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { sb } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';

export default function Journal({ project, cohort }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    sb().from('audit_log').select('*').eq('project_id', project.id).order('at', { ascending: false }).limit(300)
      .then(({ data }) => setRows(data || []));
  }, [project.id]);
  if (!rows) return <p className="muted">{t('common.loading')}</p>;
  if (!rows.length) return <p className="empty-inline">{t('journal.empty')}</p>;
  // Retrouve OSC et question pour les lignes de réponses
  const ans = Object.fromEntries(cohort.answers.map(a => [a.id, a]));
  const subjOfAss = Object.fromEntries(cohort.rows.flatMap(r => r.assessments.map(a => [a.id, r.subject.name])));
  const qcode = Object.fromEntries(cohort.questions.map(q => [q.id, q.code]));
  const what = r => {
    if (r.table_name === 'answers' && ans[r.row_id]) return `${subjOfAss[ans[r.row_id].assessment_id] || ''} · ${qcode[ans[r.row_id].question_id] || ''}`;
    return t(`journal.table_${r.table_name}`);
  };
  return (
    <div className="scroll"><table className="table">
      <thead><tr><th>{t('journal.date')}</th><th>{t('journal.author')}</th><th>{t('journal.what')}</th><th>{t('journal.field')}</th><th>{t('journal.old')}</th><th>{t('journal.new')}</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.id}>
          <td>{new Date(r.at).toLocaleString(lang)}</td><td>{safeStr(r.actor_label)}</td><td>{what(r)}</td>
          <td>{safeStr(r.field)}</td><td className="clip">{safeStr(r.old_value)}</td><td className="clip">{safeStr(r.new_value)}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

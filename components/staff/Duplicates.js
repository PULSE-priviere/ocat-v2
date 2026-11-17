// F31 doublons : même nom normalisé ou même partie locale d'e-mail
import { useI18n } from '../../lib/i18n';
import { staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export function findDuplicates(subjects) {
  const pairs = [];
  for (let i = 0; i < subjects.length; i++) for (let j = i + 1; j < subjects.length; j++) {
    const a = subjects[i], b = subjects[j];
    const sameName = norm(a.name) && norm(a.name) === norm(b.name);
    const sameMail = norm(a.email.split('@')[0]) === norm(b.email.split('@')[0]);
    if (sameName || sameMail) pairs.push([a, b]);
  }
  return pairs;
}

export default function Duplicates({ cohort, reload }) {
  const { t } = useI18n();
  const pairs = findDuplicates(cohort.rows.map(r => r.subject));
  const merge = async (keep, drop) => {
    if (!window.confirm(t('dup.confirm', { keep: keep.name, drop: drop.name }))) return;
    try { await staffApi('merge', { keepId: keep.id, dropId: drop.id }); reload(); } catch (e) { alert(t(`errors.${e.message}`)); }
  };
  if (!pairs.length) return <p className="empty-inline">{t('dup.empty')}</p>;
  return (
    <table className="table"><tbody>{pairs.map(([a, b]) => (
      <tr key={a.id + b.id}>
        <td>{safeStr(a.name)}<br /><small className="muted">{safeStr(a.email)}</small></td>
        <td>{safeStr(b.name)}<br /><small className="muted">{safeStr(b.email)}</small></td>
        <td className="right">
          <button className="btn" onClick={() => merge(a, b)}>{t('dup.keep_left')}</button>{' '}
          <button className="btn" onClick={() => merge(b, a)}>{t('dup.keep_right')}</button>
        </td>
      </tr>
    ))}</tbody></table>
  );
}

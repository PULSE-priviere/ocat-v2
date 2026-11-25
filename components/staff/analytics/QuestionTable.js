// Bloc 3 : tableau des questions. Tri sur chaque colonne, recherche sans accents, filtre par section.
// Clic sur une ligne : panneau latéral avec la répartition détaillée et les organisations par réponse.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Block, Distribution, fmtScore, fmtPct, csvFile, CODE_COLORS } from './ui';
import SearchBox from '../../SearchBox';
import { matches } from '../../../lib/search';
import { pick } from '../../../lib/i18n';
import { safeStr } from '../../../lib/safe';

const COLS = [
  ['code', q => String(q.question.code || '')], ['section', q => q.section.idx], ['question', null],
  ['respondents', q => q.respondents], ['na', q => q.naShare], ['dist', q => q.gap], ['mean', q => q.mean],
  ['gap', q => q.gap], ['support', q => q.supportRate], ['alert', q => (q.naAlert ? 1 : 0)],
];

export default function QuestionTable({ view, table, ctx, section, onSection }) {
  const { t, lang, project, type } = ctx;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'code', dir: 1 });
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const esc = e => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const text = q => pick(q.question, 'text', lang);
  const acc = q => (sort.key === 'question' ? text(q) : COLS.find(c => c[0] === sort.key)[1](q));
  const list = view.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => (!section || q.section.id === section) && matches(query, [q.question.code, text(q), pick(q.section, 'name', lang)]))
    .sort((a, b) => {
      const x = acc(a.q), y = acc(b.q);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'string' ? x.localeCompare(y, lang, { numeric: true }) : x - y) * sort.dir;
    });
  const shown = { ...table, rows: list.map(({ i }) => table.rows[i]) };   // le CSV reprend exactement les lignes affichées
  const th = (key, cls = '') => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="thsort" onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
        {t(`analytics.col_${key}`)}{sort.key === key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
  const cur = open ? view.questions.find(q => q.question.id === open) : null;

  return (
    <Block id="a-questions" title={t('analytics.b3_title')} hint={t('analytics.b3_hint')} table={shown} csvName={csvFile(project, 'questions', type)}>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder={t('analytics.search_question')} />
        <label className="inline">{t('analytics.col_section')}
          <select value={section} onChange={e => onSection(e.target.value)}>
            <option value="">{t('analytics.all_sections')}</option>
            {view.model.sections.map(s => <option key={s.id} value={s.id}>S{s.idx} · {pick(s, 'name', lang)}</option>)}
          </select>
        </label>
        <span className="muted small">{t('analytics.n_questions', { n: list.length })}</span>
      </div>
      {!list.length ? <p className="empty-inline">{t('search.no_result')}</p> : (
        <div className="scroll"><table className="table aqtable">
          <thead><tr>
            {th('code')}{th('section')}{th('question')}{th('respondents', 'right')}{th('na', 'right')}{th('dist')}{th('mean', 'right')}{th('gap', 'right')}{th('support', 'right')}{th('alert')}
          </tr></thead>
          <tbody>{list.map(({ q }) => (
            <tr key={q.question.id} className="clickable" tabIndex={0} onClick={() => setOpen(q.question.id)} onKeyDown={e => { if (e.key === 'Enter') setOpen(q.question.id); }}>
              <td className="mono">{safeStr(q.question.code)}</td>
              <td className="mono">S{q.section.idx}</td>
              <td className="aqtext">{text(q)}</td>
              <td className="right">{q.respondents}</td>
              <td className="right">{fmtPct(q.naShare, lang)}</td>
              <td><Distribution counts={q.counts} withNa={false} /></td>
              <td className="right"><b>{fmtScore(q.mean, lang)}</b></td>
              <td className="right">{fmtPct(q.gap, lang)}</td>
              <td className="right">{fmtPct(q.supportRate, lang)}</td>
              <td>{q.naAlert ? <span className="pill amber">{t('analytics.na_alert_short')}</span> : null}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {cur ? (
        <>
          <div className="adrawer-back" onClick={() => setOpen(null)} aria-hidden="true" />
          <aside className="adrawer" role="dialog" aria-modal="true" aria-label={t('analytics.drawer_title')}>
            <div className="toolbar">
              <span className="mono muted">{safeStr(cur.question.code)} · S{cur.section.idx}</span>
              <span className="grow" />
              <button type="button" className="btn small" onClick={() => setOpen(null)} autoFocus>{t('analytics.close')}</button>
            </div>
            <h3>{text(cur)}</h3>
            <dl className="adl">
              <dt>{t('analytics.col_respondents')}</dt><dd>{cur.respondents}{cur.missing ? ` (${t('analytics.missing', { n: cur.missing })})` : ''}</dd>
              <dt>{t('analytics.col_mean')}</dt><dd>{fmtScore(cur.mean, lang)}</dd>
              <dt>{t('analytics.col_gap')}</dt><dd>{fmtPct(cur.gap, lang)}</dd>
              <dt>{t('analytics.col_support')}</dt><dd>{fmtPct(cur.supportRate, lang)} ({t('analytics.k_support_base', { n: cur.supportKnown })})</dd>
            </dl>
            {['1', '2', '3', 'NA'].map(c => (
              <div key={c} className="adgroup">
                <div className="adhead">
                  <span className="adsw" style={{ background: CODE_COLORS[c] }} />
                  <b>{t(`answer.short_${c}`)}</b>
                  <span className="muted small">{cur.counts[c]} · {fmtPct(cur.respondents ? cur.counts[c] / cur.respondents : null, lang)}</span>
                </div>
                {cur.byCode[c].length ? (
                  <ul className="adlist">{cur.byCode[c].map(o => (
                    <li key={o.id}><Link href={`/staff/subject/${o.id}`}>{safeStr(o.name)}</Link>{o.support ? <em className="tag">{t('report.support_requested')}</em> : null}</li>
                  ))}</ul>
                ) : null}
              </div>
            ))}
          </aside>
        </>
      ) : null}
    </Block>
  );
}

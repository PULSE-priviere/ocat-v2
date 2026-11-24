// Bloc 8 : commentaires des organisations par section (filtres globaux + section + recherche)
import { useState } from 'react';
import Link from 'next/link';
import { Block, csvFile } from './ui';
import SearchBox from '../../SearchBox';
import { comments, commentsTable } from '../../../lib/analytics';
import { pick } from '../../../lib/i18n';
import { safeStr } from '../../../lib/safe';

export default function Comments({ view, ctx }) {
  const { t, lang, project, type } = ctx;
  const [section, setSection] = useState('');
  const [query, setQuery] = useState('');
  const list = comments(view.records, view.model, { section, query }, lang);
  // Même table que l'export Excel, limitée aux commentaires affichés
  const table = commentsTable(list, ctx);
  const withComments = new Set(comments(view.records, view.model, {}, lang).map(c => c.section.id));
  return (
    <Block id="a-comments" title={t('analytics.b8_title')} table={table} csvName={csvFile(project, 'commentaires', type)}>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} />
        <label className="inline">{t('analytics.col_section')}
          <select value={section} onChange={e => setSection(e.target.value)}>
            <option value="">{t('analytics.all_sections')}</option>
            {view.model.allSections.filter(s => withComments.has(s.id)).map(s => <option key={s.id} value={s.id}>S{s.idx} · {pick(s, 'name', lang)}</option>)}
          </select>
        </label>
        <span className="muted small">{t('analytics.n_comments', { n: list.length })}</span>
      </div>
      {!list.length ? <p className="empty-inline">{t('analytics.no_comments')}</p> : (
        <ul className="acomments">{list.map((c, i) => (
          <li key={`${c.subject.id}-${c.section.id}-${i}`}>
            <div className="acm-head"><Link href={`/staff/subject/${c.subject.id}`}><b>{safeStr(c.subject.name)}</b></Link><span className="pill grey">S{c.section.idx} · {pick(c.section, 'name', lang)}</span></div>
            <p>{c.text}</p>
          </li>
        ))}</ul>
      )}
    </Block>
  );
}

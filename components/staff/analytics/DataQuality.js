// Bloc 7 : qualité des données (complétude, questions à fort taux de N/A, organisations peu complètes)
import Link from 'next/link';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Block, fmtPct, csvFile } from './ui';
import { CFG } from '../../../lib/analytics';
import { pick } from '../../../lib/i18n';
import { safeStr } from '../../../lib/safe';
import appConfig from '../../../app.config';

export default function DataQuality({ view, table, ctx }) {
  const { t, lang, project, type } = ctx;
  const q = view.quality;
  const bins = q.bins.map(b => ({ name: `${b.from}–${b.to}`, n: b.n }));
  return (
    <Block id="a-quality" title={t('analytics.b7_title')} table={table} csvName={csvFile(project, 'qualite', type)}>
      <div className="charts">
        <figure className="chartbox">
          <figcaption>{t('analytics.q_hist')}</figcaption>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bins} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="#EFEFEF" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#707070' }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#707070' }} width={28} />
              <Tooltip formatter={v => [v, t('analytics.k_orgs')]} labelFormatter={l => `${l} %`} />
              <Bar dataKey="n" fill={appConfig.colors.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </figure>
        <div>
          <h3 className="atf-title">{t('analytics.q_na_title', { pct: Math.round(CFG.naAlert * 100) })}</h3>
          {!q.naQuestions.length ? <p className="muted small">{t('analytics.q_na_none')}</p> : (
            <ul className="alist">{q.naQuestions.map(x => (
              <li key={x.question.id}><span className="mono muted">{safeStr(x.question.code)}</span> {pick(x.question, 'text', lang)} <b>{fmtPct(x.naShare, lang)}</b></li>
            ))}</ul>
          )}
        </div>
      </div>
      <h3 className="atf-title">{t('analytics.q_low_title', { pct: CFG.lowCompletion })}</h3>
      {!q.lowOrgs.length ? <p className="muted small">{t('analytics.q_low_none')}</p> : (
        <ul className="alist cols">{q.lowOrgs.map(r => (
          <li key={r.subject.id}><Link href={`/staff/subject/${r.subject.id}`}>{safeStr(r.subject.name)}</Link> <b>{r.completion} %</b></li>
        ))}</ul>
      )}
    </Block>
  );
}

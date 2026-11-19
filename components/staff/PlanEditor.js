// Plan d'accompagnement : repris de la session (notes, action, responsable). Ici, seulement l'échéance.
import { useEffect, useRef, useState } from 'react';
import { useI18n, pick } from '../../lib/i18n';
import { sb } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import { planRows } from '../../lib/plan';
import { timelineSvg } from '../../lib/planCharts';
import Icon from '../Icon';

export default function PlanEditor({ assessment, bank, answers, goSession }) {
  const { t, lang } = useI18n();
  const [plan, setPlan] = useState(null);   // { status, items: [{ questionId, due, kept }] }
  const [state, setState] = useState('');
  const [docLang, setDocLang] = useState(lang === 'en' ? 'en' : 'fr');   // langue du document exporté, indépendante de la langue de l'écran
  const timer = useRef(null);

  useEffect(() => {
    sb().from('action_plans').select('items, status').eq('assessment_id', assessment.id).maybeSingle()
      .then(({ data }) => setPlan({ status: data?.status || 'draft', items: Array.isArray(data?.items) ? data.items : [] }));
  }, [assessment.id]);

  const persist = next => {
    setPlan(next); setState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await sb().from('action_plans').upsert({ assessment_id: assessment.id, items: next.items, status: next.status }, { onConflict: 'assessment_id' });
      setState(error ? 'error' : 'saved');
    }, 600);
  };
  if (!plan) return <p className="muted">{t('common.loading')}</p>;

  let k = 0;
  const rows = planRows(bank.questions, answers, plan.items).map(r => ({ ...r, n: r.kept ? ++k : null }));
  const lineText = r => String(r.a.coach_action || '').split('\n')[0].trim() || pick(r.q, 'text', lang);
  const cal = timelineSvg({ rows: rows.filter(r => r.kept).map(r => ({ n: r.n, label: lineText(r), due: r.due })), today: new Date(), lang, labels: { today: t('planx.today') }, responsive: true });
  const undated = rows.filter(r => r.kept && !r.due).length;
  const setRow = (qid, patch) => {
    const map = new Map(plan.items.map(i => [i.questionId, i]));
    map.set(qid, { questionId: qid, due: '', kept: true, ...map.get(qid), ...patch });
    persist({ ...plan, items: [...map.values()] });
  };

  return (
    <>
      <div className="toolbar wrap">
        <label className="inline">{t('plan.status')}
          <select value={plan.status} onChange={e => persist({ ...plan, status: e.target.value })}>
            {['draft', 'validated', 'shared'].map(s => <option key={s} value={s}>{t(`plan.status_${s}`)}</option>)}
          </select>
        </label>
        <span className="grow" />
        <div className="exportbar" role="group" aria-label={t('plan.export_title')}>
          <label className="exportlang">{t('plan.doc_lang')}
            <select value={docLang} onChange={e => setDocLang(e.target.value)}>
              <option value="fr">{t('plan.lang_fr')}</option><option value="en">{t('plan.lang_en')}</option>
            </select>
          </label>
          <a className="btn" href={`/staff/plan/${assessment.id}?lang=${docLang}&format=pdf`} target="_blank" rel="noreferrer"><Icon name="download" size={15} />{t('plan.dl_pdf')}</a>
          <a className="btn" href={`/staff/plan/${assessment.id}?lang=${docLang}&format=docx`} target="_blank" rel="noreferrer"><Icon name="download" size={15} />{t('plan.dl_word')}</a>
        </div>
        {state ? <span className="muted small">{t(`save.${state}`)}</span> : null}
      </div>
      <section className="card pcal">
        <h2>{t('planx.calendar_title')}</h2>
        {cal.svg ? <div dangerouslySetInnerHTML={{ __html: cal.svg }} /> : <p className="empty-inline">{t('planx.no_dates')}</p>}
        <p className="muted small">{cal.svg && undated ? t('planx.undated', { n: undated }) : t('planx.cal_hint')}</p>
      </section>
      <p className="muted small">{t('plan.hint')}</p>
      {rows.length === 0 ? (
        <div className="empty-inline">{t('plan.empty')}<br /><button className="btn small" onClick={goSession}>{t('plan.edit_in_session')}</button></div>
      ) : (
        <ol className="planlist">
          {rows.map(({ q, a, due, kept, n }) => (
            <li key={q.id} className={kept ? '' : 'dropped'}>
              <div className="planrow-main">
                <p className="q-text">{n ? <span className="numbadge">{n}</span> : null}{q.code ? <span className="q-code">{q.code}</span> : null}{pick(q, 'text', lang)}
                  {a.code ? <span className={`chip c${a.code}`}>{t(`answer.short_${a.code}`)}</span> : null}</p>
                <dl className="planrow-fields">
                  <dt>{t('plan.action')}</dt>
                  <dd>{safeStr(a.coach_action) || <button className="link small missing" onClick={goSession}>{t('plan.missing_action')}</button>}</dd>
                  <dt>{t('plan.owner')}</dt><dd>{safeStr(a.coach_owner) || <span className="muted">—</span>}</dd>
                  {a.coach_notes ? <><dt>{t('plan.notes')}</dt><dd className="muted">{safeStr(a.coach_notes)}</dd></> : null}
                </dl>
              </div>
              <div className="planrow-side">
                <label>{t('plan.due')}<input type="date" className="notion" value={due} onChange={e => setRow(q.id, { due: e.target.value })} /></label>
                <label className="check"><input type="checkbox" checked={kept} onChange={e => setRow(q.id, { kept: e.target.checked })} /><span>{t('plan.in_plan')}</span></label>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

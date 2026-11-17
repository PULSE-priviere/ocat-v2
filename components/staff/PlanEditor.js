// F14 propositions, F15 édition, F16 statut, F17 export
import { useEffect, useRef, useState } from 'react';
import { useI18n, pick } from '../../lib/i18n';
import { sb } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import { proposals } from '../../lib/scoring';

const uid = () => Math.random().toString(36).slice(2, 10);

export default function PlanEditor({ assessment, bank, answers, needs }) {
  const { t, lang } = useI18n();
  const [plan, setPlan] = useState(null);
  const [state, setState] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    sb().from('action_plans').select('*').eq('assessment_id', assessment.id).maybeSingle()
      .then(({ data }) => setPlan(data || { assessment_id: assessment.id, items: [], status: 'draft' }));
  }, [assessment.id]);

  const persist = next => {
    setPlan(next); setState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await sb().from('action_plans')
        .upsert({ assessment_id: assessment.id, items: next.items, status: next.status }, { onConflict: 'assessment_id' });
      setState(error ? 'error' : 'saved');
    }, 700);
  };
  if (!plan) return <p className="muted">{t('common.loading')}</p>;

  const qText = id => pick(bank.questions.find(q => q.id === id), 'text', lang);
  // Ajoute les propositions manquantes sans toucher aux lignes déjà éditées
  const propose = () => {
    const have = new Set(plan.items.map(i => i.questionId).filter(Boolean));
    const add = proposals(bank.questions, answers).filter(q => !have.has(q.id)).map(q => ({
      id: uid(), questionId: q.id, title: '', action: '', owner: '', due: '', needId: answers[q.id]?.needIds?.[0] || '', kept: true }));
    persist({ ...plan, items: [...plan.items, ...add] });
  };
  const setItem = (id, patch) => persist({ ...plan, items: plan.items.map(i => (i.id === id ? { ...i, ...patch } : i)) });
  const move = (idx, d) => { const it = [...plan.items]; const j = idx + d; if (j < 0 || j >= it.length) return; [it[idx], it[j]] = [it[j], it[idx]]; persist({ ...plan, items: it }); };
  const remove = id => persist({ ...plan, items: plan.items.filter(i => i.id !== id) });
  const addFree = () => persist({ ...plan, items: [...plan.items, { id: uid(), questionId: null, title: '', action: '', owner: '', due: '', needId: '', kept: true }] });

  return (
    <>
      <div className="toolbar wrap">
        <button className="btn" onClick={propose}>{t('plan.propose')}</button>
        <button className="btn" onClick={addFree}>{t('plan.add_free')}</button>
        <label className="inline">{t('plan.status')}
          <select value={plan.status} onChange={e => persist({ ...plan, status: e.target.value })}>
            {['draft', 'validated', 'shared'].map(s => <option key={s} value={s}>{t(`plan.status_${s}`)}</option>)}
          </select>
        </label>
        <a className="btn" href={`/staff/plan/${assessment.id}?lang=fr`} target="_blank" rel="noreferrer">{t('plan.export_fr')}</a>
        <a className="btn" href={`/staff/plan/${assessment.id}?lang=en`} target="_blank" rel="noreferrer">{t('plan.export_en')}</a>
        {state ? <span className="muted small">{t(`save.${state}`)}</span> : null}
      </div>
      <p className="muted small">{t('plan.hint')}</p>
      {plan.items.length === 0 ? <p className="empty-inline">{t('plan.empty')}</p> : (
        <ol className="planlist">{plan.items.map((i, idx) => (
          <li key={i.id} className={i.kept === false ? 'dropped' : ''}>
            <div className="plan-head">
              <label className="check"><input type="checkbox" checked={i.kept !== false} onChange={e => setItem(i.id, { kept: e.target.checked })} /><span>{t('plan.keep')}</span></label>
              {i.questionId ? <span className="muted small">{safeStr(qText(i.questionId))}</span> : <span className="tag">{t('plan.free')}</span>}
              <span className="grow" />
              <button className="btn small ghost" aria-label={t('plan.up')} onClick={() => move(idx, -1)}>↑</button>
              <button className="btn small ghost" aria-label={t('plan.down')} onClick={() => move(idx, 1)}>↓</button>
              <button className="btn small danger" onClick={() => remove(i.id)}>{t('common.delete')}</button>
            </div>
            <div className="plan-grid">
              <label>{t('plan.priority')}<input value={i.title} placeholder={i.questionId ? safeStr(qText(i.questionId)) : ''} onChange={e => setItem(i.id, { title: e.target.value })} /></label>
              <label>{t('plan.action')}<textarea rows={2} value={i.action} onChange={e => setItem(i.id, { action: e.target.value })} /></label>
              <label>{t('plan.owner')}<input value={i.owner} onChange={e => setItem(i.id, { owner: e.target.value })} /></label>
              <label>{t('plan.due')}<input type="date" value={i.due} onChange={e => setItem(i.id, { due: e.target.value })} /></label>
              <label>{t('plan.need')}<select value={i.needId || ''} onChange={e => setItem(i.id, { needId: e.target.value })}>
                <option value="">—</option>{needs.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select></label>
            </div>
          </li>
        ))}</ol>
      )}
    </>
  );
}

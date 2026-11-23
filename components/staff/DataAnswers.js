// Données d'une section libre (sans score) : consultation et correction par le coach
import Field from './Field';
import { useI18n, pick } from '../../lib/i18n';

export default function DataAnswers({ sections, questions, answers, saveAnswer }) {
  const { t, lang } = useI18n();
  return sections.map(s => (
    <section key={s.id} className="card">
      <h2>{t('recap.data_title')} · {pick(s, 'name', lang)}</h2>
      <div className="props stack">
        {questions.filter(q => q.section_id === s.id).map(q => <DataRow key={q.id} q={q} a={answers[q.id] || {}} saveAnswer={saveAnswer} />)}
      </div>
    </section>
  ));
}

function DataRow({ q, a, saveAnswer }) {
  const { t, lang } = useI18n();
  const label = pick(q, 'text', lang);
  if (q.format === 'yesno') {
    return (
      <div className="prop"><span className="prop-label">{label}</span>
        <select className="notion" value={a.code || ''} onChange={e => saveAnswer(q, { code: e.target.value || null })}>
          <option value="">—</option><option value="yes">{t('common.yes')}</option><option value="no">{t('common.no')}</option>
        </select></div>
    );
  }
  if (q.format === 'choice') {
    const opts = Array.isArray(q.options) ? q.options : [];
    return (
      <div className="prop"><span className="prop-label">{label}</span>
        <select className="notion" value={a.value_text || ''} onChange={e => saveAnswer(q, { value_text: e.target.value || null })}>
          <option value="">—</option>{opts.map(o => <option key={o.key} value={o.key}>{(lang === 'en' && o.en) || o.fr}</option>)}
        </select></div>
    );
  }
  if (q.format === 'multi') {
    // Réponse stockée sous forme de tableau JSON de clés : ["o1","o3"] ; null si rien n'est coché
    const opts = Array.isArray(q.options) ? q.options : [];
    let sel = [];
    try { const p = JSON.parse(a.value_text || '[]'); if (Array.isArray(p)) sel = p; } catch {}
    const toggle = key => {
      const next = sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key];
      saveAnswer(q, { value_text: next.length ? JSON.stringify(next) : null });
    };
    return (
      <div className="prop"><span className="prop-label">{label}</span>
        <div className="opts">
          {opts.map(o => (
            <label key={o.key} className={`opt small ${sel.includes(o.key) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.includes(o.key)} onChange={() => toggle(o.key)} />
              <span>{(lang === 'en' && o.en) || o.fr}</span>
            </label>
          ))}
        </div></div>
    );
  }
  return <Field label={label} value={a.value_text} multiline={q.format === 'text'} type={q.format === 'number' ? 'number' : 'text'} onSave={v => saveAnswer(q, { value_text: v === '' ? null : v })} />;
}
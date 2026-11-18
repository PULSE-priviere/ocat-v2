// Sections propres à un projet : notées (score + radar) ou libres (données, sans score)
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';

const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const split = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const TYPES = ['text', 'short', 'number', 'yesno', 'choice'];
const blankRow = () => ({ type: 'text', fr: '', en: '', opts: '', optsEn: '' });
const isErr = m => m.startsWith('errors') || m.startsWith('psec.need');

export default function ProjectSections({ project, reload }) {
  const { t } = useI18n();
  const [list, setList] = useState(null);
  const [kind, setKind] = useState('');
  const [form, setForm] = useState({ nameFr: '', nameEn: '', qFr: '', qEn: '' });
  const [rows, setRows] = useState([blankRow()]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: secs } = await sb().from('sections').select('id, num, name_fr, name_en, kind').eq('project_id', project.id).order('num');
    const ids = (secs || []).map(s => s.id);
    const qs = ids.length
      ? (await sb().from('questions').select('id, section_id, code, ord, format, text_fr, text_en').in('section_id', ids).is('assessment_id', null).order('ord')).data
      : [];
    setList((secs || []).map(s => ({ ...s, questions: (qs || []).filter(q => q.section_id === s.id) })));
  }, [project.id]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); reload(); };

  const create = async e => {
    e.preventDefault(); setMsg('');
    const payload = { projectId: project.id, kind, nameFr: form.nameFr, nameEn: form.nameEn };
    if (kind === 'scored') { payload.questionsFr = lines(form.qFr); payload.questionsEn = lines(form.qEn); }
    else {
      const qs = rows.filter(r => r.fr.trim()).map(r => ({ type: r.type, fr: r.fr.trim(), en: r.en.trim(), options: r.type === 'choice' ? split(r.opts) : undefined, optionsEn: r.type === 'choice' ? split(r.optsEn) : undefined }));
      if (!qs.length) return setMsg('psec.need_question');
      if (qs.some(q => q.type === 'choice' && q.options.length < 2)) return setMsg('psec.need_choices');
      payload.questions = qs;
    }
    setBusy(true);
    try {
      await staffApi('add_section', payload);
      setForm({ nameFr: '', nameEn: '', qFr: '', qEn: '' }); setRows([blankRow()]); setKind(''); setMsg('psec.created'); refresh();
    } catch (x) { setMsg(`errors.${x.message}`); }
    setBusy(false);
  };
  const renameSection = async (s, patch) => { await sb().from('sections').update(patch).eq('id', s.id); refresh(); };
  const deleteSection = async s => { if (window.confirm(t('psec.delete_section_confirm', { name: s.name_fr }))) { await sb().from('sections').delete().eq('id', s.id); refresh(); } };
  const editQuestion = async (q, patch) => { await sb().from('questions').update(patch).eq('id', q.id); refresh(); };
  const deleteQuestion = async q => { if (window.confirm(t('psec.delete_question_confirm'))) { await sb().from('questions').delete().eq('id', q.id); refresh(); } };
  const addQuestion = async (s, { text, type = 'scale', options = null }) => {
    if (!text.trim()) return;
    const last = s.questions[s.questions.length - 1];
    const prefix = (s.questions[0]?.code || '').split('.')[0];
    const next = (last?.ord || 0) + 1;
    const { data: sec } = await sb().from('sections').select('framework_id').eq('id', s.id).single();
    await sb().from('questions').insert({ framework_id: sec.framework_id, section_id: s.id, project_id: project.id, ord: next, format: type,
      concept_id: `proj-${project.id.slice(0, 8)}-s${s.num}-q${Date.now()}`, code: prefix ? `${prefix}.${next}` : null, text_fr: text.trim(), text_en: text.trim(),
      options: options ? options.map((o, i) => ({ key: `o${i + 1}`, fr: o, en: o })) : null });
    refresh();
  };
  const setRow = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <>
      <h2>{t('psec.title')}</h2>
      <p className="lead">{t('psec.intro')}</p>
      {!list ? <p className="muted">{t('common.loading')}</p> : list.length === 0 ? <p className="empty-inline">{t('psec.none')}</p> : list.map(s => (
        <section key={s.id} className="card psec">
          <div className="psec-head">
            <input className="notion strong" aria-label={t('psec.name_fr')} defaultValue={s.name_fr} onBlur={e => e.target.value.trim() && e.target.value !== s.name_fr && renameSection(s, { name_fr: e.target.value.trim() })} />
            <input className="notion" aria-label={t('psec.name_en')} placeholder={t('psec.name_en')} defaultValue={s.name_en} onBlur={e => e.target.value.trim() && e.target.value !== s.name_en && renameSection(s, { name_en: e.target.value.trim() })} />
            <span className="psec-actions"><span className={`pill ${s.kind === 'data' ? 'green' : 'blue'}`}>{t(`psec.badge_${s.kind === 'data' ? 'data' : 'scored'}`)}</span>
              <button className="btn danger small" onClick={() => deleteSection(s)}>{t('psec.delete_section')}</button></span>
          </div>
          <ol className="psec-qs">
            {s.questions.map(q => (
              <li key={`${q.id}-${q.text_fr}`}>
                <span className="q-code">{safeStr(q.code)}</span>
                <div className="psec-q">
                  <input className="notion" aria-label={t('psec.q_text_fr')} defaultValue={q.text_fr} onBlur={e => e.target.value.trim() && e.target.value !== q.text_fr && editQuestion(q, { text_fr: e.target.value.trim() })} />
                  <input className="notion muted-in" aria-label={t('psec.q_text_en')} defaultValue={q.text_en} onBlur={e => e.target.value.trim() && e.target.value !== q.text_en && editQuestion(q, { text_en: e.target.value.trim() })} />
                </div>
                <span className="psec-qtail">{s.kind === 'data' ? <span className="pill grey">{t(`psec.t_${q.format}`)}</span> : null}
                  <button className="btn danger small" aria-label={t('common.delete')} onClick={() => deleteQuestion(q)}>×</button></span>
              </li>
            ))}
          </ol>
          {s.kind === 'data' ? <AddDataQuestion onAdd={x => addQuestion(s, x)} /> : <AddRow placeholder={t('psec.add_question_ph')} label={t('psec.add_question')} onAdd={text => addQuestion(s, { text })} />}
        </section>
      ))}

      <h2>{t('psec.add_title')}</h2>
      <section className="card">
        <p className="stepl">{t('psec.step1')}</p>
        <div className="kindpick" role="radiogroup" aria-label={t('psec.kind_title')}>
          {['scored', 'data'].map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`kindcard ${k} ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
              <span className="kindcard-title">{t(`psec.kind_${k}`)}</span>
              <span className="kindcard-desc">{t(`psec.kind_${k}_desc`)}</span>
            </button>
          ))}
        </div>
        {kind ? (
          <form className="form" onSubmit={create}>
            <p className="stepl">{t('psec.step2')}</p>
            <div className="form row">
              <label>{t('psec.name_fr')}<input required value={form.nameFr} onChange={e => setForm({ ...form, nameFr: e.target.value })} /></label>
              <label>{t('psec.name_en')}<input value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })} /></label>
            </div>
            {kind === 'scored' ? (
              <>
                <p className="muted small">{t('psec.help_scored')}</p>
                <div className="form row">
                  <label>{t('psec.questions_fr')}<textarea required rows={6} className="notion boxed" value={form.qFr} onChange={e => setForm({ ...form, qFr: e.target.value })} /></label>
                  <label>{t('psec.questions_en')}<textarea rows={6} className="notion boxed" value={form.qEn} onChange={e => setForm({ ...form, qEn: e.target.value })} /></label>
                </div>
                <p className="muted small">{t('psec.count', { n: lines(form.qFr).length })}</p>
              </>
            ) : (
              <>
                <p className="muted small">{t('psec.help_data')} {t('psec.no_score')}</p>
                {rows.map((r, i) => (
                  <div key={i} className="qrow">
                    <select aria-label={t('psec.q_type')} value={r.type} onChange={e => setRow(i, { type: e.target.value })}>{TYPES.map(k => <option key={k} value={k}>{t(`psec.t_${k}`)}</option>)}</select>
                    <input placeholder={t('psec.q_text_fr')} aria-label={t('psec.q_text_fr')} value={r.fr} onChange={e => setRow(i, { fr: e.target.value })} />
                    <input placeholder={t('psec.q_text_en')} aria-label={t('psec.q_text_en')} value={r.en} onChange={e => setRow(i, { en: e.target.value })} />
                    <button type="button" className="btn danger small" aria-label={t('psec.remove')} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, k) => k !== i))}>×</button>
                    {r.type === 'choice' ? (
                      <div className="qrow-opts">
                        <input placeholder={t('psec.q_options')} aria-label={t('psec.q_options')} value={r.opts} onChange={e => setRow(i, { opts: e.target.value })} />
                        <input placeholder={t('psec.q_options_en')} aria-label={t('psec.q_options_en')} value={r.optsEn} onChange={e => setRow(i, { optsEn: e.target.value })} />
                      </div>
                    ) : null}
                  </div>
                ))}
                <div><button type="button" className="btn small" onClick={() => setRows([...rows, blankRow()])}>+ {t('psec.add_row')}</button></div>
              </>
            )}
            {msg ? <p className={isErr(msg) ? 'error' : 'ok'}>{t(msg)}</p> : null}
            <div><button className="btn primary" disabled={busy}>{t('psec.create')}</button></div>
          </form>
        ) : (msg ? <p className={isErr(msg) ? 'error' : 'ok'}>{t(msg)}</p> : null)}
      </section>
    </>
  );
}

function AddRow({ placeholder, label, onAdd }) {
  const [v, setV] = useState('');
  return (
    <form className="inline-form addrow" onSubmit={e => { e.preventDefault(); onAdd(v); setV(''); }}>
      <input className="notion" placeholder={placeholder} aria-label={label} value={v} onChange={e => setV(e.target.value)} />
      <button className="btn small">{label}</button>
    </form>
  );
}

// Nouvelle question dans une section libre existante : type + texte (+ choix)
function AddDataQuestion({ onAdd }) {
  const { t } = useI18n();
  const [r, setR] = useState({ type: 'text', text: '', opts: '' });
  const submit = e => {
    e.preventDefault();
    if (!r.text.trim()) return;
    const options = r.type === 'choice' ? split(r.opts) : null;
    if (options && options.length < 2) return;
    onAdd({ text: r.text, type: r.type, options });
    setR({ type: r.type, text: '', opts: '' });
  };
  return (
    <form className="inline-form addrow" onSubmit={submit}>
      <select aria-label={t('psec.q_type')} value={r.type} onChange={e => setR({ ...r, type: e.target.value })} style={{ width: 'auto' }}>{TYPES.map(k => <option key={k} value={k}>{t(`psec.t_${k}`)}</option>)}</select>
      <input className="notion" placeholder={t('psec.add_question_ph')} value={r.text} onChange={e => setR({ ...r, text: e.target.value })} />
      {r.type === 'choice' ? <input className="notion" placeholder={t('psec.q_options')} value={r.opts} onChange={e => setR({ ...r, opts: e.target.value })} /> : null}
      <button className="btn small">{t('psec.add_question')}</button>
    </form>
  );
}

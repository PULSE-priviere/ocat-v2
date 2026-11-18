// Sections et questions propres à un projet (owner ou administrateur)
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';

const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

export default function ProjectSections({ project, reload }) {
  const { t } = useI18n();
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ nameFr: '', nameEn: '', qFr: '', qEn: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: secs } = await sb().from('sections').select('id, num, name_fr, name_en').eq('project_id', project.id).order('num');
    const ids = (secs || []).map(s => s.id);
    const qs = ids.length
      ? (await sb().from('questions').select('id, section_id, code, ord, text_fr, text_en').in('section_id', ids).is('assessment_id', null).order('ord')).data
      : [];
    setList((secs || []).map(s => ({ ...s, questions: (qs || []).filter(q => q.section_id === s.id) })));
  }, [project.id]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); reload(); };

  const create = async e => {
    e.preventDefault(); setMsg(''); setBusy(true);
    try {
      await staffApi('add_section', { projectId: project.id, nameFr: form.nameFr, nameEn: form.nameEn, questionsFr: lines(form.qFr), questionsEn: lines(form.qEn) });
      setForm({ nameFr: '', nameEn: '', qFr: '', qEn: '' }); setMsg('psec.created'); refresh();
    } catch (x) { setMsg(`errors.${x.message}`); }
    setBusy(false);
  };
  const renameSection = async (s, patch) => { await sb().from('sections').update(patch).eq('id', s.id); refresh(); };
  const deleteSection = async s => { if (window.confirm(t('psec.delete_section_confirm', { name: s.name_fr }))) { await sb().from('sections').delete().eq('id', s.id); refresh(); } };
  const editQuestion = async (q, patch) => { await sb().from('questions').update(patch).eq('id', q.id); refresh(); };
  const deleteQuestion = async q => { if (window.confirm(t('psec.delete_question_confirm'))) { await sb().from('questions').delete().eq('id', q.id); refresh(); } };
  const addQuestion = async (s, text) => {
    if (!text.trim()) return;
    const last = s.questions[s.questions.length - 1];
    const prefix = (s.questions[0]?.code || '').split('.')[0];
    const next = (last?.ord || 0) + 1;
    const { data: sec } = await sb().from('sections').select('framework_id').eq('id', s.id).single();
    await sb().from('questions').insert({ framework_id: sec.framework_id, section_id: s.id, project_id: project.id, ord: next, format: 'scale',
      concept_id: `proj-${project.id.slice(0, 8)}-s${s.num}-q${Date.now()}`, code: prefix ? `${prefix}.${next}` : null, text_fr: text.trim(), text_en: text.trim() });
    refresh();
  };

  return (
    <>
      <h2>{t('psec.title')}</h2>
      <p className="lead">{t('psec.intro')}</p>
      <p className="muted small">{t('psec.note')}</p>
      {!list ? <p className="muted">{t('common.loading')}</p> : list.length === 0 ? <p className="empty-inline">{t('psec.none')}</p> : list.map(s => (
        <section key={s.id} className="card psec">
          <div className="psec-head">
            <input className="notion strong" aria-label={t('psec.name_fr')} defaultValue={s.name_fr} onBlur={e => e.target.value.trim() && e.target.value !== s.name_fr && renameSection(s, { name_fr: e.target.value.trim() })} />
            <input className="notion" aria-label={t('psec.name_en')} placeholder={t('psec.name_en')} defaultValue={s.name_en} onBlur={e => e.target.value.trim() && e.target.value !== s.name_en && renameSection(s, { name_en: e.target.value.trim() })} />
            <button className="btn danger small" onClick={() => deleteSection(s)}>{t('psec.delete_section')}</button>
          </div>
          <ol className="psec-qs">
            {s.questions.map(q => (
              <li key={`${q.id}-${q.text_fr}`}>
                <span className="q-code">{safeStr(q.code)}</span>
                <div className="psec-q">
                  <input className="notion" aria-label={t('psec.questions_fr')} defaultValue={q.text_fr} onBlur={e => e.target.value.trim() && e.target.value !== q.text_fr && editQuestion(q, { text_fr: e.target.value.trim() })} />
                  <input className="notion muted-in" aria-label={t('psec.questions_en')} defaultValue={q.text_en} onBlur={e => e.target.value.trim() && e.target.value !== q.text_en && editQuestion(q, { text_en: e.target.value.trim() })} />
                </div>
                <button className="btn danger small" aria-label={t('common.delete')} onClick={() => deleteQuestion(q)}>×</button>
              </li>
            ))}
          </ol>
          <AddRow placeholder={t('psec.add_question_ph')} label={t('psec.add_question')} onAdd={text => addQuestion(s, text)} />
        </section>
      ))}
      <h2>{t('psec.add_title')}</h2>
      <form className="card form" onSubmit={create}>
        <div className="form row">
          <label>{t('psec.name_fr')}<input required value={form.nameFr} onChange={e => setForm({ ...form, nameFr: e.target.value })} /></label>
          <label>{t('psec.name_en')}<input value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })} /></label>
        </div>
        <div className="form row">
          <label>{t('psec.questions_fr')}<textarea required rows={6} className="notion boxed" value={form.qFr} onChange={e => setForm({ ...form, qFr: e.target.value })} /></label>
          <label>{t('psec.questions_en')}<textarea rows={6} className="notion boxed" value={form.qEn} onChange={e => setForm({ ...form, qEn: e.target.value })} /></label>
        </div>
        <p className="muted small">{t('psec.count', { n: lines(form.qFr).length })}</p>
        {msg ? <p className={msg.startsWith('errors') ? 'error' : 'ok'}>{t(msg)}</p> : null}
        <div><button className="btn primary" disabled={busy}>{t('psec.create')}</button></div>
      </form>
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

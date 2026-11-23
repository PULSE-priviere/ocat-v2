// Questionnaire du projet : toutes les sections et questions que voient les organisations (une carte par section, au clic les questions).
// Coachs et owners voient tout. Les questions de base ne se modifient pas. Seuls les owners ajoutent des sections et des questions ;
// une question ajoutée à une section commune ne compte pas dans le score. Une barre de recherche indique où un sujet est déjà abordé.
import { useCallback, useEffect, useState } from 'react';
import { useI18n, pick } from '../../lib/i18n';
import { sb, staffApi } from '../../lib/supabase';
import { loadBank } from '../../lib/bank';
import { isProjectExtra } from '../../lib/scoring';
import { matches, highlightParts } from '../../lib/search';
import { safeStr } from '../../lib/safe';
import SearchBox from '../SearchBox';

const DATA_TYPES = ['text', 'short', 'number', 'yesno', 'choice', 'multi'];
const HAS_OPTS = ['choice', 'multi'];
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const split = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const blankRow = () => ({ type: 'text', fr: '', en: '', opts: '', optsEn: '' });

// ───────────────────────── Conteneur : charge le questionnaire du projet et enregistre les ajouts
export default function Questionnaire({ project, owner, reload }) {
  const [bank, setBank] = useState(null);
  const load = useCallback(async () => { setBank(await loadBank(sb(), project.framework_id, null, project.id)); }, [project.id, project.framework_id]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); reload?.(); };

  const h = {
    // Nouvelle question à la fin d'une section : rang suivant, code « section.rang », rattachée au projet
    async addQuestion(s, { text, textEn, type = 'scale', options = null }) {
      if (!text.trim()) return;
      const qs = bank.questions.filter(q => q.section_id === s.id);
      const next = Math.max(0, ...qs.map(q => q.ord || 0)) + 1;
      const prefix = (qs[0]?.code || '').split('.')[0] || String(s.idx);
      const { error } = await sb().from('questions').insert({
        framework_id: project.framework_id, section_id: s.id, project_id: project.id, ord: next, format: type,
        concept_id: `proj-${project.id.slice(0, 8)}-s${s.num}-q${Date.now()}`, code: `${prefix}.${next}`,
        text_fr: text.trim(), text_en: (textEn || text).trim(), options: options ? options.map((o, i) => ({ key: `o${i + 1}`, fr: o, en: o })) : null });
      if (error) throw error;
      refresh();
    },
    async editQuestion(q, patch) { await sb().from('questions').update(patch).eq('id', q.id); refresh(); },
    async deleteQuestion(q) { await sb().from('questions').delete().eq('id', q.id); refresh(); },
    async renameSection(s, patch) { await sb().from('sections').update(patch).eq('id', s.id); refresh(); },
    async deleteSection(s) { await sb().from('sections').delete().eq('id', s.id); refresh(); },
    async createSection(payload) { await staffApi('add_section', { projectId: project.id, ...payload }); refresh(); },
  };
  const { t } = useI18n();
  if (!bank) return <p className="muted">{t('common.loading')}</p>;
  return <QuestionnaireView project={project} owner={owner} bank={bank} handlers={h} />;
}

// ───────────────────────── Vue
function Hl({ text, query }) {
  return <>{highlightParts(text, query).map((p, i) => (p.hit ? <mark key={i} className="qn-hit">{p.text}</mark> : p.text))}</>;
}

export function QuestionnaireView({ project, owner, bank, handlers, initialView = '', initialQuery = '' }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState(initialView);        // '' : cartes ; identifiant de section ; 'new' : ajout d'une section
  const [query, setQuery] = useState(initialQuery);
  const secs = bank.sections;
  const inSection = id => bank.questions.filter(q => q.section_id === id);
  const hay = q => [q.code, q.text_fr, q.text_en, q.guide_fr, q.guide_en];
  const hits = id => inSection(id).filter(q => matches(query, hay(q)));
  const searching = query.trim().length > 0;
  const withHits = secs.filter(s => hits(s.id).length);
  const total = secs.reduce((a, s) => a + hits(s.id).length, 0);
  const sec = secs.find(s => s.id === view);

  const search = <SearchBox value={query} onChange={setQuery} placeholder={t('qn.search_ph')} />;
  const specific = s => (s.project_id ? <span className="pill violet">{t('qn.specific', { project: safeStr(project.name) })}</span> : null);

  // ── Ajout d'une section (owner)
  if (view === 'new' && owner) {
    return (
      <>
        <button className="link" onClick={() => setView('')}>← {t('qn.back')}</button>
        <AddSection onCreate={async p => { await handlers.createSection(p); setView(''); }} />
      </>
    );
  }

  // ── Une section : ses questions
  if (sec) {
    const all = inSection(sec.id), list = searching ? hits(sec.id) : all;
    const types = sec.kind === 'data' ? DATA_TYPES : sec.project_id ? ['scale'] : ['scale', ...DATA_TYPES];
    return (
      <>
        <button className="link" onClick={() => setView('')}>← {t('qn.back')}</button>
        <div className="qn-head">
          <h2>S{sec.idx}. {pick(sec, 'name', lang)}</h2>
          <div className="chips">{specific(sec)}{sec.kind === 'data' ? <span className="pill green">{t('qn.data_badge')}</span> : null}</div>
        </div>
        {owner && sec.project_id ? (
          <details className="qn-edit">
            <summary>{t('qn.edit_section')}</summary>
            <div className="psec-head">
              <input className="notion strong" aria-label={t('psec.name_fr')} defaultValue={sec.name_fr} onBlur={e => e.target.value.trim() && e.target.value !== sec.name_fr && handlers.renameSection(sec, { name_fr: e.target.value.trim() })} />
              <input className="notion" aria-label={t('psec.name_en')} placeholder={t('psec.name_en')} defaultValue={sec.name_en} onBlur={e => e.target.value.trim() && e.target.value !== sec.name_en && handlers.renameSection(sec, { name_en: e.target.value.trim() })} />
              <button className="btn danger small" onClick={() => { if (window.confirm(t('psec.delete_section_confirm', { name: sec.name_fr }))) { handlers.deleteSection(sec); setView(''); } }}>{t('psec.delete_section')}</button>
            </div>
          </details>
        ) : null}
        <div className="toolbar">{search}<span className="muted small">{searching ? t('qn.x_of_y', { x: list.length, y: all.length }) : t('qn.questions_count', { n: all.length })}</span></div>
        {list.length === 0 ? <p className="empty-inline">{searching ? t('qn.no_match_section') : t('psec.none')}</p> : (
          <ol className="qn-qs">
            {list.map(q => <QuestionRow key={`${q.id}-${q.text_fr}`} q={q} sec={sec} owner={owner} query={query} handlers={handlers} />)}
          </ol>
        )}
        {owner ? (
          <section className="card qn-add">
            <h3>{t('qn.add_here')}</h3>
            {!sec.project_id ? <p className="muted small">{t('qn.add_note_base')}</p> : null}
            <AddQuestion types={types} onAdd={x => handlers.addQuestion(sec, x)} />
          </section>
        ) : null}
      </>
    );
  }

  // ── Les cartes (une par section) + recherche
  return (
    <>
      <p className="lead">{t(owner ? 'qn.lead_owner' : 'qn.lead_coach')}</p>
      <div className="toolbar">{search}</div>
      <div className="grid qn-grid">
        {secs.map(s => {
          const qs = inSection(s.id), extra = qs.filter(q => isProjectExtra(q, s)).length, n = hits(s.id).length;
          return (
            <button key={s.id} type="button" className={`tile qn-tile ${searching && !n ? 'dim' : ''}`} onClick={() => setView(s.id)}>
              <span className="tile-num">S{s.idx}{specific(s)}</span>
              <span className="tile-title">{pick(s, 'name', lang)}</span>
              <span className="tile-meta">
                <span>{t('qn.questions_count', { n: qs.length - extra })}{extra ? ` · ${t('qn.extra_count', { n: extra })}` : ''}{s.kind === 'data' ? ` · ${t('qn.data_badge')}` : ''}</span>
                {searching ? <span className={`pill ${n ? 'coral' : ''}`}>{n ? t('qn.matches', { n }) : t('qn.no_match')}</span> : null}
              </span>
            </button>
          );
        })}
        {owner ? <button type="button" className="tile qn-tile add" onClick={() => setView('new')}>+ {t('qn.add_section')}</button> : null}
      </div>

      {searching ? (
        <section className="card qn-results">
          <h2>{total ? t('qn.results', { n: total, m: withHits.length }) : t('qn.no_results_title')}</h2>
          {total === 0 ? <p className="muted">{t('qn.no_results', { q: query.trim() })}</p> : (
            <>
              {withHits.map(s => (
                <div key={s.id} className="qn-group">
                  <button type="button" className="qn-grouphead" onClick={() => setView(s.id)}><b>S{s.idx} · {pick(s, 'name', lang)}</b><span className="pill coral">{hits(s.id).length}</span>{specific(s)}</button>
                  <ul>{hits(s.id).map(q => <li key={q.id}><span className="q-code">{safeStr(q.code)}</span><span><Hl text={pick(q, 'text', lang)} query={query} /></span></li>)}</ul>
                </div>
              ))}
              {withHits.length < secs.length ? <p className="muted small">{t('qn.none_in', { list: secs.filter(s => !hits(s.id).length).map(s => `S${s.idx}`).join(', ') })}</p> : null}
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

// Une question : texte (surligné si recherche), type, origine. Les questions de base sont en lecture seule ;
// celles que l'owner a ajoutées au projet se modifient et se suppriment.
function QuestionRow({ q, sec, owner, query, handlers }) {
  const { t, lang } = useI18n();
  const mine = !!q.project_id, extra = isProjectExtra(q, sec), editable = owner && mine;
  const opts = Array.isArray(q.options) ? q.options.map(o => o[lang] || o.fr).filter(Boolean) : [];
  return (
    <li className="qn-q">
      <span className="q-code">{safeStr(q.code)}</span>
      <div className="qn-qbody">
        {editable ? (
          <>
            <input className="notion" aria-label={t('psec.q_text_fr')} defaultValue={q.text_fr} onBlur={e => e.target.value.trim() && e.target.value !== q.text_fr && handlers.editQuestion(q, { text_fr: e.target.value.trim() })} />
            <input className="notion muted-in" aria-label={t('psec.q_text_en')} defaultValue={q.text_en} onBlur={e => e.target.value.trim() && e.target.value !== q.text_en && handlers.editQuestion(q, { text_en: e.target.value.trim() })} />
          </>
        ) : <p className="qn-qtext"><Hl text={pick(q, 'text', lang)} query={query} /></p>}
        <div className="qn-qmeta">
          <span className="pill grey">{t(`psec.t_${q.format}`)}</span>
          {extra ? <><span className="pill violet">{t('qn.extra_badge')}</span><span className="muted small">{t('qn.extra_hint')}</span></> : null}
          {!mine ? <span className="muted small">{t('qn.base_readonly')}</span> : null}
          {opts.length ? <span className="muted small">{t('qn.choices')} : {opts.join(' · ')}</span> : null}
        </div>
        {pick(q, 'guide', lang) ? <details className="qn-guide"><summary>{t('osc.guide')}</summary><div className="guide"><Hl text={pick(q, 'guide', lang)} query={query} /></div></details> : null}
      </div>
      {editable ? <button className="btn danger small" aria-label={t('common.delete')} onClick={() => { if (window.confirm(t('psec.delete_question_confirm'))) handlers.deleteQuestion(q); }}>×</button> : <span />}
    </li>
  );
}

// Ajouter une question à la fin d'une section (owner)
function AddQuestion({ types, onAdd }) {
  const { t } = useI18n();
  const [r, setR] = useState({ type: types[0], text: '', en: '', opts: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setError('');
    if (!r.text.trim()) return;
    const options = HAS_OPTS.includes(r.type) ? split(r.opts) : null;
    if (options && options.length < 2) return setError('psec.need_choices');
    setBusy(true);
    try { await onAdd({ text: r.text, textEn: r.en, type: r.type, options }); setR({ type: r.type, text: '', en: '', opts: '' }); }
    catch { setError('errors.server_error'); }
    setBusy(false);
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="form row">
        {types.length > 1 ? <label>{t('psec.q_type')}<select value={r.type} onChange={e => setR({ ...r, type: e.target.value })}>{types.map(k => <option key={k} value={k}>{t(`psec.t_${k}`)}</option>)}</select></label> : null}
        <label>{t('psec.q_text_fr')}<input required value={r.text} onChange={e => setR({ ...r, text: e.target.value })} /></label>
        <label>{t('qn.text_en_optional')}<input value={r.en} onChange={e => setR({ ...r, en: e.target.value })} /></label>
      </div>
      {HAS_OPTS.includes(r.type) ? <label>{t('psec.q_options')}<input value={r.opts} onChange={e => setR({ ...r, opts: e.target.value })} /></label> : null}
      {error ? <p className="error">{t(error)}</p> : null}
      <div><button className="btn primary" aria-busy={busy} disabled={busy}>{t('psec.add_question')}</button></div>
    </form>
  );
}

// Ajouter une section propre au projet : notée (échelle 1 à 3, hors score global) ou libre (données)
function AddSection({ onCreate }) {
  const { t } = useI18n();
  const [kind, setKind] = useState('');
  const [form, setForm] = useState({ nameFr: '', nameEn: '', qFr: '', qEn: '' });
  const [rows, setRows] = useState([blankRow()]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const setRow = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const create = async e => {
    e.preventDefault(); setMsg('');
    const payload = { kind, nameFr: form.nameFr, nameEn: form.nameEn };
    if (kind === 'scored') { payload.questionsFr = lines(form.qFr); payload.questionsEn = lines(form.qEn); }
    else {
      const qs = rows.filter(r => r.fr.trim()).map(r => ({ type: r.type, fr: r.fr.trim(), en: r.en.trim(), options: HAS_OPTS.includes(r.type) ? split(r.opts) : undefined, optionsEn: HAS_OPTS.includes(r.type) ? split(r.optsEn) : undefined }));
      if (!qs.length) return setMsg('psec.need_question');
      if (qs.some(q => HAS_OPTS.includes(q.type) && q.options.length < 2)) return setMsg('psec.need_choices');
      payload.questions = qs;
    }
    setBusy(true);
    try { await onCreate(payload); } catch (x) { setMsg(`errors.${x.message}`); setBusy(false); }
  };
  return (
    <section className="card">
      <h2>{t('psec.add_title')}</h2>
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
                  <select aria-label={t('psec.q_type')} value={r.type} onChange={e => setRow(i, { type: e.target.value })}>{DATA_TYPES.map(k => <option key={k} value={k}>{t(`psec.t_${k}`)}</option>)}</select>
                  <input placeholder={t('psec.q_text_fr')} aria-label={t('psec.q_text_fr')} value={r.fr} onChange={e => setRow(i, { fr: e.target.value })} />
                  <input placeholder={t('psec.q_text_en')} aria-label={t('psec.q_text_en')} value={r.en} onChange={e => setRow(i, { en: e.target.value })} />
                  <button type="button" className="btn danger small" aria-label={t('psec.remove')} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, k) => k !== i))}>×</button>
                  {HAS_OPTS.includes(r.type) ? (
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
          {msg ? <p className="error">{t(msg)}</p> : null}
          <div><button className="btn primary" aria-busy={busy} disabled={busy}>{t('psec.create')}</button></div>
        </form>
      ) : null}
    </section>
  );
}

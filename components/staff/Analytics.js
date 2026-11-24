// Onglet Analytics (owners et administrateur) : analyse de besoins (baseline) puis évolution (suivi, endline).
// Un seul appel réseau (action « analytics »), puis tous les calculs dans lib/analytics.js (mêmes chiffres à l'écran et dans les exports).
// Les filtres sont dans l'URL : un lien copié ouvre la même vue filtrée.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useI18n } from '../../lib/i18n';
import { staffApi } from '../../lib/supabase';
import { prepare, buildView, tables, PROFILE_KEYS, NONE, CFG } from '../../lib/analytics';
import { countryName } from '../../lib/countries';
import { orgTypeLabel } from '../../lib/orgTypes';
import { datedName } from '../../lib/csv';
import Icon from '../Icon';
import KeyFigures from './analytics/KeyFigures';
import SectionMaturity from './analytics/SectionMaturity';
import QuestionTable from './analytics/QuestionTable';
import TopFlop from './analytics/TopFlop';
import SegmentHeatmap from './analytics/SegmentHeatmap';
import Evolution from './analytics/Evolution';
import DataQuality from './analytics/DataQuality';
import Comments from './analytics/Comments';

// Filtre → paramètre d'URL
const PARAM = { type: 'type', support_org: 'so', coach: 'coach', org_size: 'size', org_type: 'otype', mode: 'mode', country: 'country' };
const VIEW_PARAMS = ['ip', 'seg', 'evo', 'sec', 'sort'];

export default function Analytics({ project }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setRaw(null); setError('');
    staffApi('analytics', { projectId: project.id })
      .then(d => alive && setRaw(d))
      .catch(e => alive && setError(e.message || 'server_error'));
    return () => { alive = false; };
  }, [project.id]);

  const model = useMemo(() => (raw ? prepare({ sections: raw.sections, questions: raw.questions }, raw) : null), [raw]);

  // État de la vue lu dans l'URL
  const q = router.query;
  const str = k => (typeof q[k] === 'string' ? q[k] : '');
  const defaultType = model ? (model.types.includes('baseline') ? 'baseline' : model.types[0] || 'baseline') : 'baseline';
  const filters = { inProgress: str('ip') === '1' };
  Object.entries(PARAM).forEach(([k, p]) => { filters[k] = str(p); });
  if (!filters.type || (model && !model.types.includes(filters.type))) filters.type = defaultType;
  const segBy = PROFILE_KEYS.includes(str('seg')) ? str('seg') : 'org_size';
  const setParams = patch => {
    const next = { ...router.query, ...patch };
    Object.keys(next).forEach(k => { if (next[k] === '' || next[k] === null || next[k] === undefined) delete next[k]; });
    router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true, scroll: false });
  };
  const setFilter = (k, v) => setParams({ [PARAM[k]]: v });
  const reset = () => setParams(Object.fromEntries([...Object.values(PARAM), ...VIEW_PARAMS].map(p => [p, ''])));

  const view = useMemo(() => (model ? buildView(model, filters, { segBy, evoTo: str('evo'), lang }) : null),
    [model, JSON.stringify(filters), segBy, str('evo'), lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Libellés des valeurs de profil (écran, CSV, Excel)
  const label = (key, v) => {
    if (v === '__all') return t('analytics.all');
    if (!v || v === NONE) return t('analytics.none');
    if (key === 'country') return countryName(v, lang);
    if (key === 'org_type') return orgTypeLabel(project, v, lang, t);
    if (key === 'org_size') return t(`profile.opt.org_size.${v}`) || v;
    if (key === 'coach') return model?.coachNames[v] || t('analytics.unknown_coach');
    if (key === 'mode') return t(`analytics.mode_${v}`);
    return v;
  };
  const ctx = { t, lang, label, project, type: filters.type };
  const tabs = useMemo(() => (view ? tables(view, ctx) : null), [view, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportAll = async () => {
    setBusy(true);
    try {
      const { exportWorkbook } = await import('./analytics/exportXlsx');   // exceljs chargé seulement au clic
      await exportWorkbook({ view, tabs, ctx, filters, filename: datedName([project.name, 'analytics', filters.type], 'xlsx') });
    } catch (e) { console.error(e); setError('export_failed'); }
    setBusy(false);
  };

  if (error && !raw) return <p className="error">{t(`errors.${error}`) || t('errors.server_error')}</p>;
  if (!model) return <p className="muted">{t('common.loading')}</p>;
  if (!model.records.length) return <p className="empty-inline">{t('analytics.empty_project')}</p>;

  const n = view.records.length;
  const filterKeys = PROFILE_KEYS.filter(k => k !== 'country' || model.options.country.length > 1);
  const active = Object.values(PARAM).some(p => str(p)) || VIEW_PARAMS.some(p => str(p));
  return (
    <div className="analytics">
      <div className="afilters" role="group" aria-label={t('analytics.filters')}>
        <label>{t('analytics.f_type')}
          <select value={filters.type} onChange={e => setFilter('type', e.target.value)}>
            {model.types.map(k => <option key={k} value={k}>{t(`eval.${k}`)}</option>)}
          </select>
        </label>
        {filterKeys.map(k => (
          <label key={k}>{t(`analytics.f_${k}`)}
            <select value={filters[k]} onChange={e => setFilter(k, e.target.value)}>
              <option value="">{t('analytics.all')}</option>
              {model.options[k].map(v => <option key={v || NONE} value={v || NONE}>{label(k, v)}</option>)}
            </select>
          </label>
        ))}
        <label className="acheck"><input type="checkbox" checked={filters.inProgress} onChange={e => setParams({ ip: e.target.checked ? '1' : '' })} />{t('analytics.f_in_progress')}</label>
        <span className="grow" />
        <span className={`acount ${n < CFG.minGroup ? 'warn' : ''}`} aria-live="polite">
          <b>{n}</b> {t('analytics.orgs_selected')}
          {n > 0 && n < CFG.minGroup ? <em> · {t('analytics.small_warning', { n: CFG.minGroup })}</em> : null}
        </span>
        <button type="button" className="btn small" onClick={reset} disabled={!active}>{t('analytics.reset')}</button>
        <button type="button" className="btn small primary" onClick={exportAll} disabled={busy || !n} aria-busy={busy}>
          <Icon name="download" size={14} />{t('analytics.export_all')}
        </button>
      </div>
      {error === 'export_failed' ? <p className="error">{t('analytics.export_failed')}</p> : null}

      {!n ? <p className="empty-inline">{t('analytics.empty')}</p> : (
        <>
          <KeyFigures view={view} table={tabs.key} ctx={ctx} />
          <SectionMaturity view={view} table={tabs.sections} ctx={ctx} sort={str('sort') === 'score' ? 'score' : 'order'}
            onSort={v => setParams({ sort: v === 'score' ? 'score' : '' })} onPick={id => { setParams({ sec: id }); document.getElementById('a-questions')?.scrollIntoView({ behavior: 'smooth' }); }} />
          <QuestionTable view={view} table={tabs.questions} ctx={ctx} section={str('sec')} onSection={id => setParams({ sec: id })} />
          <TopFlop view={view} table={tabs.topflop} ctx={ctx} />
          <SegmentHeatmap view={view} table={tabs.segments} ctx={ctx} onBy={v => setParams({ seg: v === 'org_size' ? '' : v })} />
          {model.types.length >= 2 ? <Evolution view={view} table={tabs.evolution} ctx={ctx} onTo={v => setParams({ evo: v })} /> : null}
          <DataQuality view={view} table={tabs.quality} ctx={ctx} />
          <Comments view={view} ctx={ctx} />
        </>
      )}
    </div>
  );
}

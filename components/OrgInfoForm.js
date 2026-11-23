// Fiche organisation : consultation et modification (OSC par l'API, staff par la base).
// compact : une seule ligne de résumé, pour la page du coach.
import { Fragment, useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { safeStr } from '../lib/safe';
import { contactName } from '../lib/names';
import { countryName, countryOptions } from '../lib/countries';
import appConfig from '../app.config';
import { orgTypesOf, orgTypeLabel } from '../lib/orgTypes';

const SELECTS = ['country', 'org_type', 'org_size'];
const pickFields = v => ({
  contact_first_name: safeStr(v?.contact_first_name), contact_last_name: safeStr(v?.contact_last_name),
  country: safeStr(v?.country), org_type: safeStr(v?.org_type), org_size: safeStr(v?.org_size),
});

export default function OrgInfoForm({ value, onSave, rows = [], editable = true, compact = false, countries = [], orgTypes = [] }) {
  const { t, lang } = useI18n();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(pickFields(value));
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!edit) setF(pickFields(value)); }, [value, edit]);

  // Types de structure : liste du projet si elle existe, sinon liste par défaut
  const project = { org_types: orgTypes };
  const label = (field, code) => (!code ? '' : field === 'country' ? countryName(code, lang)
    : field === 'org_type' ? orgTypeLabel(project, code, lang, t)
    : t(`profile.opt.${field}.${code}`));
  // Pays : ceux du projet (ou tous si le projet n'en a pas) ; la valeur actuelle reste choisissable
  const optionsFor = k => {
    const list = k === 'country' ? countryOptions(lang, countries).map(o => o.code)
      : k === 'org_type' ? orgTypesOf(project).map(x => x.key)
      : appConfig.profileOptions[k];
    const cur = safeStr(f[k]);
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  };
  const incomplete = SELECTS.some(k => !safeStr(value?.[k])) || !contactName(value);
  const save = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await onSave(f); setEdit(false); setOk(true); setTimeout(() => setOk(false), 2500); }
    catch (x) { setErr(x.message || 'server_error'); }
    setBusy(false);
  };

  if (!edit) {
    if (compact) {
      const items = [contactName(value), safeStr(value?.email), ...SELECTS.map(k => label(k, safeStr(value?.[k]))), ...rows.map(r => safeStr(r.value))].filter(Boolean);
      return (
        <div className="orgbar">
          <div className="orgbar-items">
            {items.map((x, i) => <span key={i}>{x}</span>)}
            {editable && incomplete ? <span className="pill amber">{t('profile.to_complete')}</span> : null}
            {ok ? <span className="ok small">{t('profile.saved')}</span> : null}
          </div>
          {editable ? <button type="button" className="btn small" onClick={() => setEdit(true)}>{t('profile.edit')}</button> : null}
        </div>
      );
    }
    const missing = <span className="muted">{t('profile.missing')}</span>;
    return (
      <>
        <dl className="kv">
          <dt>{t('profile.label.contact')}</dt><dd>{contactName(value) || missing}</dd>
          <dt>{t('profile.label.email')}</dt><dd>{safeStr(value?.email) || missing}</dd>
          {SELECTS.map(k => <Fragment key={k}><dt>{t(`profile.label.${k}`)}</dt><dd>{label(k, safeStr(value?.[k])) || missing}</dd></Fragment>)}
          {rows.map((r, i) => <Fragment key={i}><dt>{r.label}</dt><dd>{safeStr(r.value) || missing}</dd></Fragment>)}
        </dl>
        <div className="toolbar">
          {editable ? <button type="button" className="btn small" onClick={() => setEdit(true)}>{t('profile.edit')}</button> : null}
          {editable && incomplete ? <span className="pill amber">{t('profile.to_complete')}</span> : null}
          {ok ? <span className="ok small">{t('profile.saved')}</span> : null}
        </div>
      </>
    );
  }
  const fields = (
    <>
      <label>{t('profile.label.first_name')}<input required value={f.contact_first_name} onChange={e => setF({ ...f, contact_first_name: e.target.value })} /></label>
      <label>{t('profile.label.last_name')}<input required value={f.contact_last_name} onChange={e => setF({ ...f, contact_last_name: e.target.value })} /></label>
      {SELECTS.map(k => (
        <label key={k}>{t(`profile.label.${k}`)}
          <select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}>
            <option value="">{t('profile.choose')}</option>
            {optionsFor(k).map(code => <option key={code} value={code}>{label(k, code)}</option>)}
          </select>
        </label>
      ))}
    </>
  );
  return (
    <form className={compact ? 'card slim form' : 'form'} onSubmit={save}>
      {compact ? <div className="form row">{fields}</div> : fields}
      {err ? <p className="error" role="alert">{t(`errors.${err}`)}</p> : null}
      <div className="toolbar">
        <button className="btn primary small" disabled={busy}>{t('profile.save')}</button>
        <button type="button" className="btn small" onClick={() => setEdit(false)}>{t('profile.cancel')}</button>
      </div>
    </form>
  );
}
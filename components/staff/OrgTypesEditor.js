import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import frJson from '../../locales/fr.json';
import enJson from '../../locales/en.json';
import { orgTypesOf, cleanOrgTypes, slugKey } from '../../lib/orgTypes';

const defaultRows = () => orgTypesOf({ org_types: [] }).map((x) => ({
  key: x.key,
  fr: frJson.profile?.opt?.org_type?.[x.key] || x.key,
  en: enJson.profile?.opt?.org_type?.[x.key] || x.key,
}));

export default function OrgTypesEditor({ value, onSave }) {
  const { t } = useI18n();
  const [rows, setRows] = useState(value || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setRows(value || []); }, [value]);

  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows([...rows, { key: '', fr: '', en: '' }]);
  const remove = (i) => setRows(rows.filter((_, j) => j !== i));

  async function save() {
    setBusy(true); setMsg('');
    try {
      const clean = cleanOrgTypes(rows);
      await onSave(clean);
      setRows(clean); setMsg(t('orgtypes.saved'));
    } catch (e) { setMsg(e.message || t('errors.server_error')); }
    setBusy(false);
  }

  return (
    <section className="card form">
      <p className="muted small" style={{ marginTop: 0 }}>{t('orgtypes.hint')}</p>
      {rows.length === 0 && <p className="muted small">{t('orgtypes.empty')}</p>}
      {rows.map((r, i) => (
        <div key={i} className="toolbar">
          <input aria-label="FR" placeholder={t('orgtypes.fr_ph')} value={r.fr} onChange={(e) => set(i, { fr: e.target.value })} />
          <input aria-label="EN" placeholder={t('orgtypes.en_ph')} value={r.en} onChange={(e) => set(i, { en: e.target.value })} />
          <button type="button" className="btn danger" onClick={() => remove(i)}>{t('orgtypes.remove')}</button>
        </div>
      ))}
      <div className="toolbar">
        <button type="button" className="btn" onClick={add}>{t('orgtypes.add')}</button>
        <button type="button" className="btn" onClick={() => setRows(defaultRows())}>{t('orgtypes.from_default')}</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? t('common.sending') : t('common.save')}</button>
        {msg ? <span className="small">{msg}</span> : null}
      </div>
    </section>
  );
}
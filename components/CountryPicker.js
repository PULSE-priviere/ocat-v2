// Choix de plusieurs pays : pays sélectionnés en pastilles retirables, puis une liste pour en ajouter
import { useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import { countryName, countryOptions } from '../lib/countries';

export default function CountryPicker({ value = [], onChange }) {
  const { t, lang } = useI18n();
  const options = useMemo(() => countryOptions(lang), [lang]);
  const left = options.filter(o => !value.includes(o.code));
  return (
    <div className="countrypicker">
      {value.length ? (
        <div className="chips">
          {value.map(c => (
            <span key={c} className="chip removable">
              {countryName(c, lang)}
              <button type="button" aria-label={t('countries.remove', { name: countryName(c, lang) })} onClick={() => onChange(value.filter(x => x !== c))}>×</button>
            </span>
          ))}
        </div>
      ) : <p className="muted small" style={{ margin: 0 }}>{t('countries.none')}</p>}
      <select value="" aria-label={t('countries.add')} onChange={e => { if (e.target.value) onChange([...value, e.target.value]); }}>
        <option value="">{t('countries.add')}</option>
        {left.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
      </select>
    </div>
  );
}

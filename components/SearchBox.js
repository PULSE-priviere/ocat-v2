// Champ de recherche simple (organisation, contact, e-mail, pays)
import { useI18n } from '../lib/i18n';

export default function SearchBox({ value, onChange, placeholder }) {
  const { t } = useI18n();
  return (
    <div className="searchbox">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || t('search.placeholder')} aria-label={placeholder || t('search.placeholder')} autoComplete="off" />
    </div>
  );
}

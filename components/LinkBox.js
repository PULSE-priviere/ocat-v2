import { useState } from 'react';
import { useI18n } from '../lib/i18n';

export default function LinkBox({ url: raw }) {
  const { t } = useI18n();
  // Une adresse relative (APP_URL manquant côté serveur) est complétée avec le domaine courant
  const url = typeof window !== 'undefined' && String(raw).startsWith('/') ? window.location.origin + raw : raw;
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };
  return (
    <div className="linkbox">
      <p className="small">{t('link.label')}</p>
      <div className="linkrow"><code>{url}</code><button type="button" className="btn" onClick={copy}>{copied ? t('common.copied') : t('common.copy')}</button></div>
      <p className="small muted">{t('link.warning')}</p>
    </div>
  );
}

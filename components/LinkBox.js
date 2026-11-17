import { useState } from 'react';
import { useI18n } from '../lib/i18n';

export default function LinkBox({ url }) {
  const { t } = useI18n();
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

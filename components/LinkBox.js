import { useState } from 'react';
import { useI18n } from '../lib/i18n';

// kind : 'personal' (lien d'une OSC) ou 'public' (lien du projet). Boîte d'information bleue, pas d'alerte.
export default function LinkBox({ url: raw, kind = 'personal' }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  // Une adresse relative (APP_URL manquant côté serveur) est complétée avec le domaine courant
  const url = typeof window !== 'undefined' && String(raw).startsWith('/') ? window.location.origin + raw : raw;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };
  const pub = kind === 'public';
  return (
    <div className={`linkbox ${kind}`}>
      <p className="linktitle">{t(pub ? 'link.label_public' : 'link.label')}</p>
      <div className="linkrow"><code>{url}</code><button type="button" className="btn info" onClick={copy}>{copied ? t('common.copied') : t('common.copy')}</button></div>
      <p className="small linknote">{t(pub ? 'link.note_public' : 'link.note_personal')}</p>
    </div>
  );
}

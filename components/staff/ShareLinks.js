// Liens du formulaire à partager : visibles par tous les rôles (owner, coach, administrateur) ; le coach a aussi son lien personnel
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';

function CopyRow({ label, url, hint }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };
  return (
    <div className="copyrow">
      <label>{label}</label>
      <div className="linkrow"><code>{url}</code><button type="button" className="btn" onClick={copy}>{copied ? t('common.copied') : t('common.copy')}</button></div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export default function ShareLinks({ project, staff }) {
  const { t } = useI18n();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  if (!project.public_active) return <div className="callout">{t('share.disabled')}</div>;
  const base = `${origin}/p/${project.public_slug}`;
  const isCoach = (staff.roles?.[project.id] || []).includes('coach');
  return (
    <section className="sharebar">
      <p className="linktitle">{t('share.title')}</p>
      <p className="small linknote">{t('share.desc')}</p>
      <CopyRow label={t('share.project_link')} url={base} />
      {isCoach ? <CopyRow label={t('share.my_link')} url={`${base}?coach=${staff.profile.id}`} hint={t('share.my_hint')} /> : null}
    </section>
  );
}

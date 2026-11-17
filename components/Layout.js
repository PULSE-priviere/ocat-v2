import Head from 'next/head';
import { useI18n } from '../lib/i18n';
import appConfig from '../app.config';

export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="seg" role="group" aria-label={t('common.language')}>
      {appConfig.languages.map(l => (
        <button key={l} type="button" className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function Layout({ title, right, wide, children }) {
  const { t } = useI18n();
  return (
    <>
      <Head><title>{title ? `${title} · ${appConfig.appName}` : appConfig.appName}</title></Head>
      <header className="top no-print">
        <div className="brand">
          {appConfig.logoUrl ? <img src={appConfig.logoUrl} alt={appConfig.orgName} /> : null}
          <span>{t('common.app_title')}</span>
        </div>
        <div className="top-right">{right}<LangToggle /></div>
      </header>
      <main className={wide ? 'page wide' : 'page'}>{children}</main>
    </>
  );
}

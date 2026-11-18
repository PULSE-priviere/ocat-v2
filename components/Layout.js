import Head from 'next/head';
import Link from 'next/link';
import { useI18n } from '../lib/i18n';
import { safeStr } from '../lib/safe';
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

// home : adresse du logo ; onHome : retour interne (sans rechargement) ; identity : { org, person, href }
export default function Layout({ title, right, wide, home, onHome, identity, children }) {
  const { t } = useI18n();
  const brand = (
    <>
      {appConfig.logoUrl ? <img src={appConfig.logoUrl} alt={appConfig.orgName} /> : null}
      <span>{t('common.app_title')}</span>
    </>
  );
  const who = identity ? (
    <>
      <span className="who-org">{safeStr(identity.org)}</span>
      {identity.person ? <span className="who-person">{safeStr(identity.person)}</span> : null}
    </>
  ) : null;
  return (
    <>
      <Head><title>{title ? `${title} · ${appConfig.appName}` : appConfig.appName}</title></Head>
      <header className="top no-print">
        <div className="top-in">
          {onHome
            ? <a className="brand" href={home || '/'} onClick={e => { e.preventDefault(); onHome(); }}>{brand}</a>
            : <Link className="brand" href={home || '/'}>{brand}</Link>}
          <div className="top-right">
            {right}
            {who ? (identity.href ? <Link className="who" href={identity.href}>{who}</Link> : <div className="who">{who}</div>) : null}
            <LangToggle />
          </div>
        </div>
      </header>
      <main className={wide ? 'page wide' : 'page'}>{children}</main>
    </>
  );
}

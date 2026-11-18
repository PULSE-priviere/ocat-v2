import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { useI18n } from '../lib/i18n';
import { safeStr } from '../lib/safe';
import appConfig from '../app.config';

function Logo() {
  const [failed, setFailed] = useState(false);
  if (!appConfig.logoUrl || failed) return null;
  return <img src={appConfig.logoUrl} alt="" onError={() => setFailed(true)} />;
}

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
// sidebar : menu latéral collé au bord gauche, repliable (choix mémorisé dans le navigateur)
export default function Layout({ title, right, wide, home, onHome, identity, sidebar, children }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem('ocat:side') === 'closed'); } catch {} }, []);
  const toggle = () => { const n = !collapsed; setCollapsed(n); try { localStorage.setItem('ocat:side', n ? 'closed' : 'open'); } catch {} };
  const brand = <><Logo /><span>{t('common.app_title')}</span></>;
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
        <div className={sidebar ? 'top-in full' : 'top-in'}>
          <div className="top-left">
            {sidebar ? (
              <button type="button" className="sidetoggle" onClick={toggle} aria-pressed={!collapsed} title={t(collapsed ? 'common.show_menu' : 'common.hide_menu')} aria-label={t(collapsed ? 'common.show_menu' : 'common.hide_menu')}>
                <Icon name="panel" />
              </button>
            ) : null}
            {onHome
              ? <a className="brand" href={home || '/'} onClick={e => { e.preventDefault(); onHome(); }}>{brand}</a>
              : <Link className="brand" href={home || '/'}>{brand}</Link>}
          </div>
          <div className="top-right">
            {right}
            {who ? (identity.href ? <Link className="who" href={identity.href}>{who}</Link> : <div className="who">{who}</div>) : null}
            <LangToggle />
          </div>
        </div>
      </header>
      {sidebar ? (
        <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
          <aside className="side no-print">{sidebar}</aside>
          <main className="shell-main"><div className="shell-inner">{children}</div></main>
        </div>
      ) : <main className={wide ? 'page wide' : 'page'}>{children}</main>}
    </>
  );
}

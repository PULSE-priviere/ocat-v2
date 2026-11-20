// Confirmation d'un lien de connexion reçu par e-mail. La connexion ne se fait qu'au clic sur le bouton :
// un antivirus d'e-mail qui ouvre l'adresse ne consomme donc pas le lien.
import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useI18n } from '../../lib/i18n';
import { sb } from '../../lib/supabase';

const TYPES = ['magiclink', 'email', 'recovery', 'invite', 'signup'];

export default function Confirm() {
  const { t } = useI18n();
  const router = useRouter();
  const hash = typeof router.query.token_hash === 'string' ? router.query.token_hash : '';
  const type = TYPES.includes(router.query.type) ? router.query.type : 'magiclink';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const go = async () => {
    setBusy(true); setError(false);
    const { error: e } = await sb().auth.verifyOtp({ token_hash: hash, type });
    if (e) { setError(true); setBusy(false); return; }
    router.replace('/staff');
  };
  return (
    <Layout title={t('confirm.title')}>
      <Head><meta name="robots" content="noindex" /></Head>
      <div className="narrow hero">
        <h1>{t('confirm.title')}</h1>
        {error || (router.isReady && !hash) ? (
          <>
            <div className="callout"><p>{t('confirm.failed')}</p></div>
            <p><a className="btn primary" href="/login">{t('activate.go_login')}</a></p>
          </>
        ) : (
          <div className="card form">
            <p style={{ margin: 0 }}>{t('confirm.text')}</p>
            <button className="btn primary big" aria-busy={busy} disabled={busy || !hash} onClick={go}>{t('confirm.button')}</button>
          </div>
        )}
      </div>
    </Layout>
  );
}

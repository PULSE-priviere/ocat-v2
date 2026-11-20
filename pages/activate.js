// Activation d'un compte invité. Le lien reçu par e-mail n'expire pas : il se consomme au clic sur le bouton, pas à l'ouverture de la page.
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useI18n } from '../lib/i18n';
import { sb } from '../lib/supabase';
import { safeStr } from '../lib/safe';

export default function Activate() {
  const { t } = useI18n();
  const router = useRouter();
  const token = typeof router.query.t === 'string' ? router.query.t : '';
  const [info, setInfo] = useState(null);     // { status: 'valid' | 'used' | 'invalid', firstName }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) { setInfo({ status: 'invalid' }); return; }
    fetch(`/api/auth/activate?t=${encodeURIComponent(token)}`).then(r => r.json()).then(setInfo).catch(() => setInfo({ status: 'error' }));
  }, [router.isReady, token]);

  const activate = async () => {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 404 || r.status === 410) { setInfo({ status: r.status === 410 ? 'used' : 'invalid' }); return; }
      if (!r.ok) throw new Error('server');
      const { error: e } = await sb().auth.verifyOtp({ token_hash: j.tokenHash, type: j.type });   // échange le jeton tout frais contre une session
      if (e) throw e;
      router.replace('/staff');
    } catch { setError('activation_failed'); } finally { setBusy(false); }
  };

  const first = safeStr(info?.firstName);
  return (
    <Layout title={t('activate.title')}>
      <Head><meta name="robots" content="noindex" /></Head>
      <div className="narrow hero">
        <h1>{t('activate.title')}</h1>
        {!info ? <p className="muted">{t('common.loading')}</p> : info.status === 'valid' ? (
          <div className="card form">
            <p style={{ margin: 0 }}><b>{first ? t('activate.hello', { name: first }) : t('activate.hello_anon')}</b></p>
            <p style={{ margin: 0 }}>{t('activate.text')}</p>
            {error ? <p className="error" role="alert">{t(`errors.${error}`)}</p> : null}
            <button className="btn primary big" aria-busy={busy} disabled={busy} onClick={activate}>{t('activate.button')}</button>
          </div>
        ) : info.status === 'used' ? (
          <>
            <div className="callout"><p><b>{t('activate.used_title')}</b><br />{t('activate.used_text')}</p></div>
            <p><a className="btn primary" href="/login">{t('activate.go_login')}</a></p>
          </>
        ) : (
          <>
            <div className="callout"><p><b>{t('activate.invalid_title')}</b><br />{t('activate.invalid_text')}</p></div>
            <p><a className="btn" href="/login">{t('activate.go_login')}</a></p>
          </>
        )}
      </div>
    </Layout>
  );
}

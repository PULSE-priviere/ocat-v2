// Connexion staff par lien magique
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useI18n } from '../lib/i18n';
import { sb } from '../lib/supabase';
import MailSent from '../components/MailSent';

export default function Login() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { sb().auth.getSession().then(({ data }) => { if (data.session) router.replace('/staff'); }); }, [router]);
  const submit = async e => {
    e.preventDefault(); setError(''); setBusy(true);
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, lang }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: 'offline' };
    if (j.error) setError(j.error); else setSent(true);
    setBusy(false);
  };
  return (
    <Layout title={t('login.title')}>
      <div className="narrow hero">
        <h1>{t('login.title')}</h1>
        {router.query.e ? <p className="error">{t(`errors.${router.query.e}`)}</p> : null}
        {sent ? (
          <>
            <MailSent title={t('login.sent_title')}>{t('login.sent_body', { email })}</MailSent>
            <p><button type="button" className="link" onClick={() => setSent(false)}>{t('login.other')}</button></p>
          </>
        ) : (
          <form className="card form" onSubmit={submit}>
            <label>{t('entry.email')}<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
            {error ? <p className="error" role="alert">{t(`errors.${error}`)}</p> : null}
            <button className="btn primary big" aria-busy={busy} disabled={busy}>{t('login.submit')}</button>
          </form>
        )}
      </div>
    </Layout>
  );
}

// Connexion staff par lien magique
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useI18n } from '../lib/i18n';
import { sb } from '../lib/supabase';

export default function Login() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { sb().auth.getSession().then(({ data }) => { if (data.session) router.replace('/staff'); }); }, [router]);
  const submit = async e => {
    e.preventDefault(); setError('');
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, lang }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: 'offline' };
    if (j.error) setError(j.error); else setSent(true);
  };
  return (
    <Layout title={t('login.title')}>
      <div className="narrow">
        <h1>{t('login.title')}</h1>
        {router.query.e ? <p className="error">{t(`errors.${router.query.e}`)}</p> : null}
        {sent ? <p className="lead">{t('login.sent')}</p> : (
          <form className="card form" onSubmit={submit}>
            <label>{t('entry.email')}<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
            {error ? <p className="error" role="alert">{t(`errors.${error}`)}</p> : null}
            <button className="btn primary big">{t('login.submit')}</button>
          </form>
        )}
      </div>
    </Layout>
  );
}

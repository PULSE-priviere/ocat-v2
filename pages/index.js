// La racine n'expose rien : les OSC passent par le lien public de leur projet
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useI18n } from '../lib/i18n';
import { sb } from '../lib/supabase';

export default function Home() {
  const { t } = useI18n();
  const router = useRouter();
  // Un lien magique peut atterrir sur la racine : on ouvre la session, puis on va à l'espace équipe
  useEffect(() => {
    if (!/access_token|error_description/.test(window.location.hash)) return;
    sb().auth.getSession().then(({ data }) => router.replace(data.session ? '/staff' : '/login?e=link_failed'));
  }, [router]);
  return <Layout><div className="narrow hero"><h1>{t('home.title')}</h1><p className="lead">{t('home.body')}</p><a className="btn" href="/login">{t('home.staff')}</a></div></Layout>;
}

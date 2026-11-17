// La racine n'expose rien : les OSC passent par le lien public de leur projet
import Layout from '../components/Layout';
import { useI18n } from '../lib/i18n';
export default function Home() {
  const { t } = useI18n();
  return <Layout><div className="narrow"><h1>{t('home.title')}</h1><p className="lead">{t('home.body')}</p><a className="btn" href="/login">{t('home.staff')}</a></div></Layout>;
}

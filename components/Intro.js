// Texte d'introduction du diagnostic (dans locales/*.json, clé intro)
import { useI18n } from '../lib/i18n';
import Icon from './Icon';
import appConfig from '../app.config';

export default function Intro({ open, n = 9 }) {
  const { t } = useI18n();
  const levels = t('intro.levels');
  return (
    <details className="intro" open={open}>
      <summary><Icon name="bulb" />{t('intro.toggle')}</summary>
      <h2>{t('intro.title', { org: appConfig.orgName })}</h2>
      <p>{t('intro.p1')}</p>
      <p>{t('intro.p2', { n })}</p>
      <p>{t('intro.p3')}</p>
      <ul>{Array.isArray(levels) ? levels.map((l, i) => <li key={i}>{l}</li>) : null}</ul>
      <p>{t('intro.p4')}</p>
      <p>{t('intro.p5')}</p>
    </details>
  );
}

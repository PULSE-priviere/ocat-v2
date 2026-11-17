import Head from 'next/head';
import { LangProvider } from '../lib/i18n';
import appConfig from '../app.config';
import '../styles/globals.css';

// Les couleurs de la configuration deviennent des variables CSS
const vars = Object.entries(appConfig.colors).map(([k, v]) => `--${k}:${v};`).join('');

export default function App({ Component, pageProps }) {
  return (
    <LangProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href={appConfig.font.googleUrl} />
        <style>{`:root{${vars}--font:'${appConfig.font.family}',system-ui,-apple-system,'Segoe UI',sans-serif;}`}</style>
      </Head>
      <Component {...pageProps} />
    </LangProvider>
  );
}

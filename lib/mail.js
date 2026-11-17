// Envoi d'e-mails derrière une seule fonction. Fournisseur choisi par MAIL_PROVIDER.
import fr from '../locales/fr.json';
import en from '../locales/en.json';
import appConfig from '../app.config';

const L = { fr, en };
const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// kind : clé dans locales/*.json → email.<kind>.subject / email.<kind>.body
export async function sendMail({ to, kind, lang = 'fr', vars = {} }) {
  const dict = (L[lang] || L.fr).email[kind];
  const v = { org: appConfig.orgName, app: appConfig.appName, ...vars };
  const subject = fill(dict.subject, v), text = fill(dict.body, v);
  const provider = process.env.MAIL_PROVIDER || 'console';

  if (provider === 'airtable') {
    // Une ligne dans la table Outbox ; une automatisation Airtable envoie l'e-mail puis vide le champ Body
    const r = await fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(process.env.AIRTABLE_OUTBOX_TABLE || 'Outbox')}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { To: to, Subject: subject, Body: text, Kind: kind } }),
    });
    if (!r.ok) { console.error('[mail] Airtable a refusé la ligne', r.status, await r.text().catch(() => '')); throw new Error(`mail_airtable_${r.status}`); }
    return;
  }
  if (provider === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, text }),
    });
    if (!r.ok) { console.error('[mail] Resend a refusé l\'envoi', r.status, await r.text().catch(() => '')); throw new Error(`mail_resend_${r.status}`); }
    return;
  }
  // console : développement local uniquement
  if (process.env.NODE_ENV !== 'production') console.log(`[mail] ${to} | ${subject}\n${text}`);
}

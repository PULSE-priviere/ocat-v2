// Envoi d'e-mails derrière une seule fonction. Fournisseur choisi par MAIL_PROVIDER :
//   resend   : recommandé avec un domaine d'envoi à vous (SPF/DKIM/DMARC : voir docs/EMAIL.md)
//   smtp     : envoi direct depuis l'application par un serveur SMTP, par exemple Gmail (mot de passe d'application) ; sans domaine à vous
//   airtable : relais du pilote (une automatisation Airtable envoie le texte) ; l'expéditeur n'est pas authentifié pour votre domaine
//   console  : développement local
import nodemailer from 'nodemailer';
import fr from '../locales/fr.json';
import en from '../locales/en.json';
import appConfig from '../app.config';

const L = { fr, en };
const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const mailConfig = () => ({
  provider: (process.env.MAIL_PROVIDER || 'console').trim().toLowerCase(),
  from: (process.env.MAIL_FROM || '').trim(),
  replyTo: (process.env.MAIL_REPLY_TO || '').trim(),
});

// SMTP : par défaut Gmail (smtp.gmail.com, port 465). Le mot de passe d'application Gmail s'affiche avec des espaces : on les retire.
export const smtpConfig = () => {
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(), port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    user: (process.env.SMTP_USER || '').trim(), pass: String(process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  };
};
const smtpErrorCode = e => (e.code === 'EAUTH' || e.responseCode === 535 ? 'mail_smtp_auth'
  : ['ECONNECTION', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ENOTFOUND', 'EHOSTUNREACH'].includes(e.code) ? 'mail_smtp_connect'
  : e.responseCode >= 550 && e.responseCode < 560 ? 'mail_smtp_refused' : 'mail_smtp_error');

// « Nom <adresse> » : le nom affiché est celui de l'organisation (un nom connu rassure les filtres et les lecteurs)
export function fromHeader(from = process.env.MAIL_FROM, name = appConfig.orgName) {
  const f = String(from || '').trim();
  if (!f || f.includes('<')) return f;
  return `${String(name).replace(/["<>\r\n]/g, '')} <${f}>`;
}

// Version HTML sobre : texte, un bouton pour le lien principal, le lien en clair en dessous. Aucune image, aucun suivi.
export function renderHtml({ subject, text, url, button, fallback }) {
  const p = 'margin:0 0 16px';
  const blocks = [];
  for (const para of String(text).split(/\n{2,}/).map(x => x.trim()).filter(Boolean)) {
    let buf = [];
    const flush = () => { if (buf.length) { blocks.push(`<p style="${p}">${buf.map(esc).join('<br>')}</p>`); buf = []; } };
    for (const line of para.split('\n')) {
      if (url && button && line.trim() === url) {
        flush();
        blocks.push(`<p style="margin:24px 0 12px"><a href="${esc(url)}" style="display:inline-block;background:#E0533D;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${esc(button)}</a></p>`);
        blocks.push(`<p style="margin:0 0 20px;font-size:13px;color:#6b6b6b">${esc(fallback)}<br><a href="${esc(url)}" style="color:#6b6b6b;word-break:break-all">${esc(url)}</a></p>`);
      } else buf.push(line);
    }
    flush();
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f6f6f6"><div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.6;color:#171717">${blocks.join('')}</div></body></html>`;
}

// kind : clé dans locales/*.json → email.<kind>.subject / email.<kind>.body
export function renderEmail({ kind, lang = 'fr', vars = {} }) {
  const all = (L[lang] || L.fr).email;
  const dict = all[kind];
  const hello = vars.contact ? fill(all.hello, { name: vars.contact }) : all.hello_anon;
  const v = { org: appConfig.orgName, app: appConfig.appName, hello, ...vars };
  const subject = fill(dict.subject, v).replace(/[\r\n]+/g, ' ').trim(), text = fill(dict.body, v);
  return { subject, text, html: renderHtml({ subject, text, url: vars.url, button: all.button?.[kind], fallback: all.fallback }) };
}

async function deliver({ to, kind, lang = 'fr', vars = {} }) {
  const { subject, text, html } = renderEmail({ kind, lang, vars });
  const { provider, replyTo } = mailConfig();

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
  if (provider === 'smtp') {
    const c = smtpConfig();
    const fail = (code, detail) => { const err = new Error(code); err.detail = detail; return err; };
    if (!c.user || !c.pass) throw fail('mail_smtp_config', 'SMTP_USER / SMTP_PASS');
    try {
      await nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.pass }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 })
        .sendMail({ from: fromHeader(process.env.MAIL_FROM || c.user), to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
    } catch (e) {
      console.error('[mail] SMTP a refusé l\'envoi', e.code, e.responseCode || '', e.response || e.message);
      throw fail(smtpErrorCode(e), e.response || e.message);
    }
    return;
  }
  if (provider === 'resend') {
    const r = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromHeader(), to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) { console.error('[mail] Resend a refusé l\'envoi', r.status, await r.text().catch(() => '')); throw new Error(`mail_resend_${r.status}`); }
    return;
  }
  // console : développement local uniquement
  if (process.env.NODE_ENV !== 'production') console.log(`[mail] ${to} | ${subject}\n${text}`);
  else console.error(`[mail] AUCUN E-MAIL ENVOYÉ : MAIL_PROVIDER vaut « ${provider} » (attendu : smtp, resend ou airtable)`);
}

// Tout échec d'envoi est écrit dans les logs, puis relancé
export async function sendMail(opts) {
  try { await deliver(opts); }
  catch (e) { console.error('[mail] échec de l\'envoi', opts.kind, e.message); throw e; }
}

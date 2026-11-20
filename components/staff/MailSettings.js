// Envoi des e-mails : fournisseur, expéditeur, enregistrements DNS, e-mail de test
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { staffApi } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';

function Row({ level, title, children }) {
  const { t } = useI18n();
  return (
    <div className="mailrow">
      <span className={`pill ${level === 'ok' ? 'green' : level === 'warn' ? 'amber' : level === 'bad' ? 'red' : ''}`}>{t(`mailv.lvl_${level}`)}</span>
      <div><b>{title}</b><p className="muted small">{children}</p></div>
    </div>
  );
}

export default function MailSettings() {
  const { t, lang } = useI18n();
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { staffApi('mail_status').then(setSt).catch(() => setSt({ error: true })); }, []);
  const test = async () => {
    setBusy(true); setMsg(null);
    try { const r = await staffApi('mail_test', { lang }); setMsg({ kind: 'ok', text: t('mailv.test_sent', { to: r.to }) }); }
    catch (e) {
      const friendly = t(`errors.${e.message}`);
      setMsg({ kind: 'error', text: `${t('mailv.test_failed')} ${friendly !== `errors.${e.message}` ? friendly : ''}${e.detail ? ` (${e.detail})` : ''}` });
    }
    setBusy(false);
  };
  if (!st) return <p className="muted">{t('common.loading')}</p>;
  if (st.error) return <p className="error">{t('errors.server_error')}</p>;
  const p = st.provider;
  const dns = st.dns;
  const sm = st.smtp;
  return (
    <>
      <section className="card">
        <h2>{t('mailv.title')}</h2>
        <p className="muted small">{t('mailv.lead')}</p>
        <Row level={p === 'resend' ? 'ok' : p === 'smtp' ? (sm?.configured ? 'ok' : 'bad') : p === 'airtable' ? 'warn' : 'bad'} title={t('mailv.provider')}>
          {p === 'smtp' ? t(sm?.configured ? 'mailv.provider_smtp' : 'mailv.provider_smtp_incomplete', { host: sm?.host, port: sm?.port, user: sm?.user }) : t(`mailv.provider_${p === 'resend' || p === 'airtable' ? p : 'none'}`)}
        </Row>
        <Row level={!st.from ? (p === 'airtable' ? 'info' : 'bad') : st.freeMail ? 'bad' : sm?.gmail && sm?.fromMismatch ? 'warn' : 'ok'} title={t('mailv.from')}>
          {st.from ? safeStr(st.from) : t('mailv.from_none')}{st.freeMail ? ` — ${t('mailv.from_free')}` : ''}{sm?.gmail && sm?.fromMismatch ? ` — ${t('mailv.from_mismatch', { user: sm.user })}` : ''}
        </Row>
        {dns ? (
          <>
            <Row level={dns.spf ? 'ok' : 'bad'} title="SPF">{t(dns.spf ? 'mailv.dns_ok' : 'mailv.spf_missing', { domain: st.domain })}</Row>
            <Row level={dns.dkim ? 'ok' : 'bad'} title="DKIM">{t(dns.dkim ? 'mailv.dns_ok' : 'mailv.dkim_missing', { domain: st.domain })}</Row>
            <Row level={dns.dmarc ? 'ok' : 'warn'} title="DMARC">{t(dns.dmarc ? 'mailv.dns_ok' : 'mailv.dmarc_missing', { domain: st.domain })}</Row>
          </>
        ) : null}
        <Row level="info" title={t('mailv.links')}>{t('mailv.links_text', { host: st.appHost || '—' })}</Row>
        <Row level={st.replyTo ? 'ok' : 'info'} title={t('mailv.reply_to')}>{st.replyTo || t('mailv.reply_to_none')}</Row>
      </section>
      <section className="card">
        <h2>{t('mailv.test_title')}</h2>
        <p className="muted small">{t('mailv.test_text')}</p>
        <button className="btn primary" aria-busy={busy} disabled={busy || p === 'console'} onClick={test}>{t('mailv.test_button')}</button>
        {msg ? <p className={msg.kind === 'ok' ? 'ok' : 'error'}>{msg.text}</p> : null}
      </section>
    </>
  );
}

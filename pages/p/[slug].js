// F0 : entrée par le lien public du projet
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Script from 'next/script';
import Layout from '../../components/Layout';
import { useI18n, pick } from '../../lib/i18n';
import { safeStr } from '../../lib/safe';
import LinkBox from '../../components/LinkBox';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function PublicEntry() {
  const { query } = useRouter();
  const { t, lang } = useI18n();
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', firstName: '', lastName: '', email: '', coachId: '', consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const captcha = useRef('');
  const widget = useRef(null);

  useEffect(() => {
    if (!query.slug) return;
    fetch(`/api/public/project?slug=${encodeURIComponent(query.slug)}`)
      .then(r => r.json()).then(j => (j.error ? setLoadError(j.error) : setProject(j)))
      .catch(() => setLoadError('offline'));
  }, [query.slug]);

  const renderCaptcha = () => {
    if (!SITE_KEY || !window.turnstile || !widget.current || widget.current.dataset.done) return;
    widget.current.dataset.done = '1';
    window.turnstile.render(widget.current, { sitekey: SITE_KEY, callback: tok => { captcha.current = tok; } });
  };
  useEffect(renderCaptcha, [project]);

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/public/enter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, slug: query.slug, lang, captcha: captcha.current }),
      });
      const j = await r.json();
      if (j.error) { setError(j.error); if (window.turnstile) window.turnstile.reset(); }
      else setResult(j);
    } catch { setError('offline'); }
    setBusy(false);
  };

  if (loadError) return <Layout><div className="empty"><h1>{t('entry.unavailable_title')}</h1><p>{t(`errors.${loadError}`)}</p></div></Layout>;
  if (!project) return <Layout><p className="muted">{t('common.loading')}</p></Layout>;

  if (result?.status === 'exists') return (
    <Layout><div className="narrow hero"><h1>{t('entry.exists_title')}</h1><p className="lead">{t('entry.exists_body')}</p></div></Layout>
  );
  if (result?.status === 'created') return (
    <Layout>
      <div className="narrow hero">
        <h1>{t('entry.created_title')}</h1>
        <p className="lead">{t('entry.created_body')}</p>
        <LinkBox url={result.url} />
        <a className="btn primary big" href={result.url}>{t('entry.start')}</a>
      </div>
    </Layout>
  );

  const welcome = pick(project, 'welcome', lang);
  return (
    <Layout title={safeStr(project.name)}>
      {SITE_KEY ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" onLoad={renderCaptcha} /> : null}
      <div className="narrow hero">
        <h1>{t('entry.title')}</h1>
        <p className="lead">{welcome || t('entry.default_welcome', { project: safeStr(project.name) })}</p>
        <form className="card form" onSubmit={submit}>
          <label>{t('entry.name')}
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="organization" />
          </label>
          <div className="form row">
            <label>{t('entry.first_name')}
              <input required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" />
            </label>
            <label>{t('entry.last_name')}
              <input required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" />
            </label>
          </div>
          <label>{t('entry.email')}
            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            <small>{t('entry.email_hint')}</small>
          </label>
          {project.coaches?.length ? (
            <label>{t('entry.coach')}
              <select value={form.coachId} onChange={e => setForm({ ...form, coachId: e.target.value })}>
                <option value="">{t('entry.coach_none')}</option>
                {project.coaches.map(c => <option key={c.id} value={c.id}>{safeStr(c.name)}</option>)}
              </select>
            </label>
          ) : null}
          <label className="check">
            <input type="checkbox" required checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} />
            <span>{t('entry.consent')}</span>
          </label>
          <div ref={widget} />
          {error ? <p className="error" role="alert">{t(`errors.${error}`)}</p> : null}
          <button className="btn primary big" disabled={busy}>{busy ? t('common.sending') : t('entry.submit')}</button>
        </form>
      </div>
    </Layout>
  );
}

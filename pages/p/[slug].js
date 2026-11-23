// F0 : entrée par le lien public du projet
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Script from 'next/script';
import Layout from '../../components/Layout';
import { useI18n, pick } from '../../lib/i18n';
import { safeStr } from '../../lib/safe';
import { countryName, countryOptions } from '../../lib/countries';
import appConfig from '../../app.config';
import LinkBox from '../../components/LinkBox';
import { orgTypesOf, orgTypeText } from '../../lib/orgTypes';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function PublicEntry() {
  const { query } = useRouter();
  const { t, lang } = useI18n();
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', firstName: '', lastName: '', email: '', coachId: '', country: '', orgType: '', orgSize: '', consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const captcha = useRef('');
  const widget = useRef(null);

  useEffect(() => {
    if (!query.slug) return;
    const cq = typeof query.coach === 'string' ? `&coach=${encodeURIComponent(query.coach)}` : '';
    fetch(`/api/public/project?slug=${encodeURIComponent(query.slug)}${cq}`)
      .then(r => r.json()).then(j => { if (j.error) return setLoadError(j.error); setProject(j); setForm(f => ({ ...f, coachId: j.presetCoach ? j.presetCoach.id : f.coachId, country: j.countries?.length === 1 ? j.countries[0] : f.country })); })
      .catch(() => setLoadError('offline'));
  }, [query.slug, query.coach]);

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
        <a className="btn primary big" href={`${result.url}?start=1`}>{t('entry.start')}</a>
      </div>
    </Layout>
  );

  const welcome = pick(project, 'welcome', lang);
  const countries = project.countries || [];
  const countryChoices = countryOptions(lang, countries);
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
          <fieldset className="entry-org">
            <legend>{t('entry.org_legend')}</legend>
            {countries.length === 1
              ? <p className="presetcoach">{t('entry.country_fixed', { name: countryName(countries[0], lang) })}</p>
              : (
                <label>{t('profile.label.country')}
                  <select required value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} autoComplete="country">
                    <option value="">{t('profile.choose')}</option>
                    {countryChoices.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                  </select>
                </label>
              )}
            <div className="form row">
              <label>{t('profile.label.org_type')}
                <select required value={form.orgType} onChange={e => setForm({ ...form, orgType: e.target.value })}>
                  <option value="">{t('profile.choose')}</option>
                  {orgTypesOf(project).map(x => <option key={x.key} value={x.key}>{orgTypeText(x, lang, t)}</option>)}
                </select>
              </label>
              <label>{t('profile.label.org_size')}
                <select required value={form.orgSize} onChange={e => setForm({ ...form, orgSize: e.target.value })}>
                  <option value="">{t('profile.choose')}</option>
                  {appConfig.profileOptions.org_size.map(c => <option key={c} value={c}>{t(`profile.opt.org_size.${c}`)}</option>)}
                </select>
              </label>
            </div>
          {project.presetCoach ? <p className="presetcoach">{t('entry.coach_fixed', { name: safeStr(project.presetCoach.name) })}</p> : project.coaches?.length ? (
            <label>{t('entry.coach')}
              <select value={form.coachId} onChange={e => setForm({ ...form, coachId: e.target.value })}>
                <option value="">{t('entry.coach_none')}</option>
                {project.coaches.map(c => <option key={c.id} value={c.id}>{safeStr(c.name)}</option>)}
              </select>
            </label>
          ) : null}
          </fieldset>
          <label className="check">
            <input type="checkbox" required checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} />
            <span>{t('entry.consent')}</span>
          </label>
          <div ref={widget} />
          {error ? <p className="error" role="alert">{t(`errors.${error}`)}</p> : null}
          <button className="btn primary big" aria-busy={busy} disabled={busy}>{t('entry.submit')}</button>
        </form>
      </div>
    </Layout>
  );
}

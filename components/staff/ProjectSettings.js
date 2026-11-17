// F30 lien public ; F28 liste des besoins du projet
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { sb } from '../../lib/supabase';
import { safeStr } from '../../lib/safe';
import LinkBox from '../LinkBox';

const randomSlug = () => Array.from(crypto.getRandomValues(new Uint8Array(9))).map(b => b.toString(16).padStart(2, '0')).join('');

export default function ProjectSettings({ project, needs, reload }) {
  const { t } = useI18n();
  const [p, setP] = useState(project);
  const [newNeed, setNewNeed] = useState('');
  const [saved, setSaved] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => { setP(project); setOrigin(window.location.origin); }, [project]);

  const update = async patch => {
    const { error } = await sb().from('projects').update(patch).eq('id', project.id);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 1500); reload(); }
  };
  const renew = () => { if (window.confirm(t('project.renew_confirm'))) update({ public_slug: randomSlug() }); };
  const addNeed = async e => { e.preventDefault(); if (!newNeed.trim()) return; await sb().from('needs').insert({ project_id: project.id, label: newNeed.trim() }); setNewNeed(''); reload(); };
  const renameNeed = async (n, label) => { if (label.trim() && label !== n.label) { await sb().from('needs').update({ label: label.trim() }).eq('id', n.id); reload(); } };
  const deleteNeed = async n => { if (window.confirm(t('project.need_delete_confirm', { label: n.label }))) { await sb().from('needs').delete().eq('id', n.id); reload(); } };

  return (
    <>
      <h2>{t('project.public_link')}</h2>
      {p.public_active ? <LinkBox url={`${origin}/p/${p.public_slug}`} /> : <p className="banner">{t('project.link_disabled')}</p>}
      <div className="toolbar">
        <button className="btn" onClick={() => update({ public_active: !p.public_active })}>{p.public_active ? t('project.disable') : t('project.enable')}</button>
        <button className="btn" onClick={renew}>{t('project.renew')}</button>
        <label className="check"><input type="checkbox" checked={p.offer_coach_choice} onChange={e => update({ offer_coach_choice: e.target.checked })} /><span>{t('project.offer_coach_choice')}</span></label>
      </div>
      <div className="card form">
        <label>{t('project.welcome_fr')}<textarea rows={3} value={p.welcome_fr || ''} onChange={e => setP({ ...p, welcome_fr: e.target.value })} /></label>
        <label>{t('project.welcome_en')}<textarea rows={3} value={p.welcome_en || ''} onChange={e => setP({ ...p, welcome_en: e.target.value })} /></label>
        <button className="btn primary" onClick={() => update({ welcome_fr: p.welcome_fr, welcome_en: p.welcome_en })}>{saved ? t('save.saved') : t('common.save')}</button>
      </div>
      <h2>{t('project.needs')}</h2>
      <ul className="plain">{needs.map(n => (
        <li key={n.id} className="neededit">
          <input aria-label={t('project.needs')} defaultValue={n.label} onBlur={e => renameNeed(n, e.target.value)} />
          <button className="btn danger" onClick={() => deleteNeed(n)}>{t('common.delete')}</button>
        </li>
      ))}</ul>
      <form className="toolbar" onSubmit={addNeed}>
        <input aria-label={t('project.need_new')} placeholder={t('project.need_new')} value={newNeed} onChange={e => setNewNeed(e.target.value)} />
        <button className="btn">{t('common.add')}</button>
      </form>
      <p className="muted small">{safeStr(t('project.needs_hint'))}</p>
    </>
  );
}

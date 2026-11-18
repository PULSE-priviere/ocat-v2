// Champ façon Notion : libellé discret, saisie sans cadre, enregistrement automatique
import { useEffect, useRef, useState } from 'react';
import AutoTextarea from '../AutoTextarea';
import { useI18n } from '../../lib/i18n';

export default function Field({ label, value, onSave, placeholder, multiline = true }) {
  const { t } = useI18n();
  const [v, setV] = useState(value || '');
  const [state, setState] = useState('');
  const timer = useRef(null);
  const latest = useRef(value || '');
  const saver = useRef(onSave);
  saver.current = onSave;

  // Reprend la valeur venue d'ailleurs, sauf pendant une saisie en cours
  useEffect(() => { if (!timer.current) { setV(value || ''); latest.current = value || ''; } }, [value]);

  const flush = async () => {
    if (!timer.current) return;
    clearTimeout(timer.current); timer.current = null;
    setState('saving');
    try { await saver.current(latest.current); setState('saved'); } catch { setState('error'); }
  };
  const change = nv => { setV(nv); latest.current = nv; setState(''); clearTimeout(timer.current); timer.current = setTimeout(flush, 800); };
  // Une saisie en attente est enregistrée si on quitte l'onglet
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; saver.current(latest.current); } }, []);

  return (
    <div className="prop">
      <span className="prop-label">{label}{state ? <em> · {t(`save.${state}`)}</em> : null}</span>
      {multiline
        ? <AutoTextarea value={v} onChange={change} onBlur={flush} placeholder={placeholder} />
        : <input className="notion" value={v} onChange={e => change(e.target.value)} onBlur={flush} placeholder={placeholder} />}
    </div>
  );
}

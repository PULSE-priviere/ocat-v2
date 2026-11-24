// Colonne centrale : textarea large, enregistrement auto 1 s après la dernière frappe
// et à la fermeture ; menu @ pour insérer un besoin.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n';

export default function SessionNotes({ value, needs, onSave, onMentionNeed, insertSignal }) {
  const { t } = useI18n();
  const [text, setText] = useState(value || '');
  const [saved, setSaved] = useState(true);
  const [menu, setMenu] = useState(null);     // { from, filter }
  const ref = useRef(null);
  const timer = useRef(null);
  const latest = useRef(value || '');

  // Enregistrement auto 1 s après la dernière frappe
  useEffect(() => {
    if (text === latest.current) return;
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await onSave(text, { notifyMentions: true });
      latest.current = text;
      setSaved(true);
    }, 1000);
    return () => clearTimeout(timer.current);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enregistrement à la fermeture de l'onglet
  useEffect(() => {
    const flush = () => {
      if (text !== latest.current) { try { navigator.sendBeacon?.(''); } catch {} onSave(text, { notifyMentions: true }); }
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush); };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Insertion depuis l'extérieur (clic sur un besoin de l'ordre du jour)
  useEffect(() => {
    if (!insertSignal) return;
    const el = ref.current; if (!el) return;
    const start = el.selectionStart ?? text.length;
    const before = text.slice(0, start), after = text.slice(start);
    const pad = before && !before.endsWith(' ') ? ' ' : '';
    const next = `${before}${pad}${insertSignal.text} ${after}`;
    setText(next);
    requestAnimationFrame(() => { el.focus(); const pos = (before + pad + insertSignal.text + ' ').length; el.setSelectionRange(pos, pos); });
  }, [insertSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = e => {
    if (e.key === '@') {
      const pos = ref.current?.selectionStart ?? text.length;
      setMenu({ from: pos + 1, filter: '' });
    } else if (menu) {
      if (e.key === 'Escape') setMenu(null);
      else if (e.key === 'Enter' && menu.list?.length) { e.preventDefault(); pick(menu.list[0]); }
    }
  };

  const onChange = e => {
    const v = e.target.value;
    setText(v);
    if (menu) {
      const at = v.lastIndexOf('@', (ref.current?.selectionStart ?? v.length) - 1);
      if (at < 0) return setMenu(null);
      const filter = v.slice(at + 1, ref.current?.selectionStart ?? v.length);
      if (/\s/.test(filter)) return setMenu(null);
      setMenu({ from: at + 1, filter });
    }
  };

  const list = menu
    ? (needs || []).filter(n => n.label.toLowerCase().includes(menu.filter.toLowerCase())).slice(0, 8)
    : [];
  if (menu) menu.list = list;

  const pick = n => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const at = text.lastIndexOf('@', caret - 1);
    const before = text.slice(0, at);
    const after = text.slice(caret);
    const insert = `@${n.label} `;
    const next = `${before}${insert}${after}`;
    setText(next);
    setMenu(null);
    onMentionNeed?.(n.id);
    requestAnimationFrame(() => { el?.focus(); const pos = (before + insert).length; el?.setSelectionRange(pos, pos); });
  };

  return (
    <section className="sess-notes">
      <textarea ref={ref} value={text} onChange={onChange} onKeyDown={onKey}
        placeholder={t('session.v1.notes_placeholder')} aria-label={t('session.v1.notes')} />
      <div className="sess-save muted small">{saved ? t('session.v1.saved') : t('session.v1.saving')}</div>
      {menu && list.length ? (
        <ul className="sess-mention-menu" role="listbox">
          {list.map(n => <li key={n.id}><button type="button" onClick={() => pick(n)}>{n.label}</button></li>)}
        </ul>
      ) : null}
    </section>
  );
}

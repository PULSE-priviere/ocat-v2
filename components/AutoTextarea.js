// Zone de texte qui s'agrandit avec son contenu
import { useEffect, useRef } from 'react';

export default function AutoTextarea({ value, onChange, onBlur, placeholder, className = 'notion' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} value={value} placeholder={placeholder}
    onChange={e => onChange(e.target.value)} onBlur={onBlur} />;
}

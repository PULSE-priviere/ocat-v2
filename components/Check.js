// Case à cocher instantanée : l'état change tout de suite, l'enregistrement suit ; en cas d'échec, la case revient en arrière.
// onChange(valeur) doit renvoyer une promesse qui échoue (throw) si l'enregistrement n'a pas eu lieu.
import { useEffect, useState } from 'react';

export default function Check({ checked, onChange, label, className = '', disabled }) {
  const [v, setV] = useState(!!checked);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!busy) setV(!!checked); }, [checked, busy]);
  const change = async e => {
    const next = e.target.checked;
    setV(next); setBusy(true);
    try { await onChange(next); } catch { setV(!next); }
    setBusy(false);
  };
  return <label className={`check ${className}`}><input type="checkbox" checked={v} disabled={disabled} onChange={change} /><span>{label}</span></label>;
}

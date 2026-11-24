// Échéance prévisionnelle : date unique, plage (de X à Y) ou trimestre (Q1 2026).
// Stockée comme chaîne : 'YYYY-MM-DD', 'YYYY-MM-DD..YYYY-MM-DD' ou 'YYYY-Qx'.
import { useMemo, useState } from 'react';
import { useI18n } from '../../lib/i18n';

const Q_START = { 1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01' };

export function parseDue(raw) {
  const s = String(raw || '').trim();
  if (!s) return { kind: 'none' };
  const q = s.match(/^(\d{4})-Q([1-4])$/);
  if (q) return { kind: 'quarter', year: Number(q[1]), q: Number(q[2]) };
  const r = s.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (r) return { kind: 'range', from: r[1], to: r[2] };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { kind: 'date', date: s };
  return { kind: 'none' };
}

// Premier jour de l'échéance, pour la timeline du plan
export function dueStartISO(raw) {
  const p = parseDue(raw);
  if (p.kind === 'date') return p.date;
  if (p.kind === 'range') return p.from;
  if (p.kind === 'quarter') return `${p.year}-${Q_START[p.q]}`;
  return '';
}

export function dueLabel(raw, lang = 'fr') {
  const p = parseDue(raw);
  const fmt = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
  if (p.kind === 'date') return fmt(p.date);
  if (p.kind === 'range') return `${new Date(`${p.from}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' })} → ${fmt(p.to)}`;
  if (p.kind === 'quarter') return `T${p.q} ${p.year}`;
  return '';
}

export default function DuePicker({ value, onChange }) {
  const { t } = useI18n();
  const parsed = parseDue(value);
  const [mode, setMode] = useState(parsed.kind === 'none' ? 'date' : parsed.kind);
  const year = new Date().getFullYear();

  const push = raw => onChange(raw || '');
  const setDate = d => push(d);
  const setFrom = f => push(`${f}..${parsed.kind === 'range' ? parsed.to : f}`);
  const setTo = to => push(`${parsed.kind === 'range' ? parsed.from : to}..${to}`);
  const setQ = (y, q) => push(`${y}-Q${q}`);

  const change = m => {
    setMode(m);
    if (m === 'date' && parsed.kind !== 'date') push(parsed.kind === 'range' ? parsed.from : '');
    if (m === 'range' && parsed.kind !== 'range') { const d = parsed.kind === 'date' ? parsed.date : ''; push(d ? `${d}..${d}` : ''); }
    if (m === 'quarter' && parsed.kind !== 'quarter') push('');
  };

  const mem = useMemo(() => parsed, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sess-due">
      <div className="sess-due-tabs" role="tablist">
        {['date', 'range', 'quarter'].map(m => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => change(m)}>
            {t(`session.v1.due_${m}`)}
          </button>
        ))}
      </div>
      {mode === 'date' ? (
        <input className="sess-field" type="date" value={mem.kind === 'date' ? mem.date : ''} onChange={e => setDate(e.target.value)} />
      ) : null}
      {mode === 'range' ? (
        <div className="sess-due-range">
          <input className="sess-field" type="date" value={mem.kind === 'range' ? mem.from : ''} onChange={e => setFrom(e.target.value)} />
          <span className="muted small">→</span>
          <input className="sess-field" type="date" value={mem.kind === 'range' ? mem.to : ''} onChange={e => setTo(e.target.value)} />
        </div>
      ) : null}
      {mode === 'quarter' ? (
        <div className="sess-due-quarter">
          {[year, year + 1].map(y => (
            <div key={y} className="sess-due-year">
              <span className="sess-due-year-label">{y}</span>
              {[1, 2, 3, 4].map(q => {
                const on = mem.kind === 'quarter' && mem.year === y && mem.q === q;
                return (
                  <button key={q} type="button" className={`sess-due-q ${on ? 'on' : ''}`} onClick={() => setQ(y, q)}>T{q}</button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

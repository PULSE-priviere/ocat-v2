// Forme de radar pour Recharts : relie seulement les sections renseignées (les autres ne tirent pas la surface vers le centre).
// Repère creux = valeur provisoire (section incomplète). dataKey = clé normalisée (baseline, followup, endline).
export function filledShape({ dataKey, color, opacity = 0.22 }) {
  return function RadarShape({ points }) {
    const pts = (points || []).filter(p => p.payload && p.payload[dataKey] != null && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!pts.length) return null;
    const path = pts.map(p => `${p.x},${p.y}`).join(' ');
    return (
      <g>
        {pts.length >= 3 ? <polygon points={path} fill={color} fillOpacity={opacity} stroke={color} strokeWidth={2} strokeLinejoin="round" /> : null}
        {pts.length === 2 ? <polyline points={path} fill="none" stroke={color} strokeWidth={2} /> : null}
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.6} fill={p.payload[`${dataKey}_p`] ? '#FFFFFF' : color} stroke={color} strokeWidth={1.7} />)}
      </g>
    );
  };
}

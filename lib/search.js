// Recherche simple : insensible aux accents et à la casse ; tous les mots saisis doivent se retrouver
export const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function matches(query, fields) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(fields.filter(Boolean).join(' '));
  return words.every(w => hay.includes(w));
}

// Découpe un texte en morceaux « trouvé / non trouvé » pour surligner la recherche (insensible aux accents et à la casse)
export function highlightParts(text, query) {
  const src = String(text ?? '');
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [{ text: src, hit: false }];
  const chars = [...src];
  const n = chars.map(c => norm(c));                          // une lettre accentuée reste une lettre : les positions concordent
  const flat = n.join('');
  const start = []; let pos = 0; n.forEach((s, i) => { for (let k = 0; k < s.length; k++) start[pos + k] = i; pos += s.length; });
  const mark = new Array(chars.length).fill(false);
  for (const w of words) for (let i = flat.indexOf(w); i >= 0; i = flat.indexOf(w, i + 1)) for (let k = i; k < i + w.length; k++) mark[start[k]] = true;
  const out = [];
  chars.forEach((c, i) => { const last = out[out.length - 1]; if (last && last.hit === mark[i]) last.text += c; else out.push({ text: c, hit: mark[i] }); });
  return out;
}

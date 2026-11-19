// Recherche simple : insensible aux accents et à la casse ; tous les mots saisis doivent se retrouver
export const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function matches(query, fields) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(fields.filter(Boolean).join(' '));
  return words.every(w => hay.includes(w));
}

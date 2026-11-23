import config from '../app.config.js';

export function slugKey(label, taken = []) {
  const base = String(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'type';
  let key = base, i = 2;
  while (taken.includes(key)) key = `${base}_${i++}`;
  return key;
}

// Liste du projet si elle existe, sinon la liste par défaut ({ key, i18n: true })
export function orgTypesOf(project) {
  const own = Array.isArray(project?.org_types) ? project.org_types : [];
  if (own.length) return own;
  return (config.profileOptions?.org_type || []).map((key) => ({ key, i18n: true }));
}

export function orgTypeText(item, lang, t) {
  if (item.i18n) return t(`profile.opt.org_type.${item.key}`);
  return item[lang] || item.fr || item.key;
}

export function orgTypeLabel(project, key, lang, t) {
  if (!key) return '';
  const item = orgTypesOf(project).find((x) => x.key === key);
  if (item) return orgTypeText(item, lang, t);
  // clé de l'ancienne liste par défaut, absente de la liste du projet
  if ((config.profileOptions?.org_type || []).includes(key)) return t(`profile.opt.org_type.${key}`);
  return key;
}

export function cleanOrgTypes(list) {
  const out = [], seen = [];
  for (const x of Array.isArray(list) ? list : []) {
    const fr = String(x?.fr || '').trim().slice(0, 80);
    if (!fr) continue;
    const key = /^[a-z0-9_]{1,40}$/.test(x.key || '') && !seen.includes(x.key) ? x.key : slugKey(fr, seen);
    seen.push(key);
    out.push({ key, fr, en: String(x?.en || '').trim().slice(0, 80) || fr });
  }
  return out;
}
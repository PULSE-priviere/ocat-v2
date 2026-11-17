// Traductions FR/EN : tous les libellés d'interface passent par t()
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import fr from '../locales/fr.json';
import en from '../locales/en.json';
import appConfig from '../app.config';

const DICTS = { fr, en };
const Ctx = createContext({ lang: 'fr', setLang: () => {}, t: k => k });

function lookup(dict, key) { return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), dict); }

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(appConfig.defaultLanguage);
  useEffect(() => {
    try { const s = localStorage.getItem('ocat:lang'); if (s && DICTS[s]) setLangState(s); } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = l => { setLangState(l); try { localStorage.setItem('ocat:lang', l); } catch {} };
  const t = useCallback((key, vars) => {
    const v = lookup(DICTS[lang], key) ?? lookup(DICTS.fr, key) ?? key;
    return typeof v === 'string' && vars ? v.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : v;
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);

// Texte bilingue venant de la base (ex. text_fr / text_en)
export const pick = (row, field, lang) => (row && (row[`${field}_${lang}`] || row[`${field}_fr`])) || '';

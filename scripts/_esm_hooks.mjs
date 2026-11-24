// Permet d'importer les modules de lib/ (écrits pour Next.js, imports sans extension) dans un script Node.
// Usage : node --import ./scripts/_esm_hooks.mjs scripts/test_analytics.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (e) {
    if (!/^\\.\\.?\\//.test(specifier) || /\\.[cm]?js$/.test(specifier)) throw e;
    return next(specifier + '.js', context);
  }
}`), import.meta.url);

// Tâches de fond : l'utilisateur n'attend ni l'envoi d'un e-mail ni la synchronisation vers Airtable.
// Sur Vercel, waitUntil garde la fonction en vie jusqu'à la fin de la tâche ; ailleurs, on attend (comportement sûr, un peu plus lent).
import { waitUntil } from '@vercel/functions';

const onVercel = () => { try { return typeof globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil === 'function'; } catch { return false; } };

export async function inBackground(task) {
  const p = Promise.resolve(task).catch(e => console.error('[tâche de fond]', e?.message));
  if (onVercel()) { waitUntil(p); return; }
  await p;
}

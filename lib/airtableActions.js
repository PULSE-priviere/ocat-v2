// Actions Airtable partagées par l'écran de l'administrateur (tous les projets) et celui de l'owner (un projet)
import { useState } from 'react';
import { useI18n } from './i18n';
import { staffApi } from './supabase';
import { downloadCsv } from './csv';
import { airtableMsg } from './airtableMsg';

// scope : { projectId } ou { all: true }
export function useAirtableActions(scope, fileBase) {
  const { t } = useI18n();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);       // { kind: 'ok' | 'error', text }
  const [prog, setProg] = useState(null);

  const run = async (name, fn) => {
    setBusy(name); setMsg(null); setProg(null);
    try { await fn(); } catch (e) { setMsg({ kind: 'error', text: airtableMsg(t, e) }); }
    setBusy('');
  };
  const setup = () => run('setup', async () => {
    const r = await staffApi('scores_setup', scope);
    const parts = [];
    if (r.created?.length) parts.push(t('mex.done_created', { names: r.created.join(', ') }));
    if (r.added?.length) parts.push(t('mex.done_added', { names: r.added.join(' ; ') }));
    setMsg({ kind: 'ok', text: parts.length ? parts.join(' ') : t('mex.done_ok') });
  });
  const sync = () => run('sync', async () => {
    let offset = 0, d = 0, a = 0, mode = 'simple';
    const orgs = new Set();
    for (;;) {
      const r = await staffApi('scores_sync', { ...scope, offset });
      d += r.diagnostics; a += r.accompagnement; mode = r.mode || mode; r.orgIds.forEach(x => orgs.add(x));
      setProg({ done: r.done, total: r.total });
      if (r.next == null) break;
      offset = r.next;
    }
    setMsg({ kind: 'ok', text: mode === 'complet' ? t('mex.done_sync', { o: orgs.size, d, a }) : t('mex.done_sync_simple', { d }) });
  });
  // CSV d'une des trois tables (organisations, diagnostics, accompagnement)
  const csv = table => run(`csv_${table}`, async () => {
    let offset = 0, rows = [], fields = [];
    for (;;) {
      const r = await staffApi('scores_csv', { ...scope, table, offset });
      fields = r.fields; rows = rows.concat(r.rows); setProg({ done: r.done, total: r.total });
      if (r.next == null) break;
      offset = r.next;
    }
    if (table === 'organisations') rows = [...new Map(rows.map(x => [x.Identifiant, x])).values()];   // une organisation figure dans plusieurs diagnostics
    downloadCsv(`${fileBase}-${table}.csv`, [fields, ...rows.map(row => fields.map(f => row[f] ?? ''))]);
  });
  return { busy, msg, prog, setMsg, run, setup, sync, csv };
}

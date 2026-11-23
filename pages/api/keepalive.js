import { admin } from '../../lib/server';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  const { error } = await admin().from('app_settings').select('key').limit(1);
  res.status(error ? 500 : 200).json({ ok: !error, ms: Date.now() - t0 });
}

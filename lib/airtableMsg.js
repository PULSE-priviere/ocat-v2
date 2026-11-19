// Message d'erreur Airtable pour l'écran : explication + détail brut d'Airtable entre parenthèses
export function airtableMsg(t, e) {
  const code = e?.message || '';
  if (code === 'airtable_not_configured') return t('mex.not_configured');
  const friendly = t(`errors.${code}`);
  const known = friendly !== `errors.${code}`;
  const detail = e?.detail ? ` (Airtable : ${e.detail})` : '';
  return t('mex.error', { msg: known ? `${friendly}${detail}` : (e?.detail || code) });
}

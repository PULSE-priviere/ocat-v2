// Contrôle des enregistrements DNS de l'expéditeur (SPF, DKIM, DMARC) : sans eux, les messages sont filtrés ou classés en indésirables
import dns from 'dns';

export const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|gmx|orange|free|laposte|wanadoo|sfr)\./i;

// Avec Resend : SPF sur « send.<domaine> », DKIM sur « resend._domainkey.<domaine> », DMARC sur « _dmarc.<domaine> »
export async function checkDns(domain, resolveTxt = dns.promises.resolveTxt) {
  const txt = async name => { try { return (await resolveTxt(name)).map(parts => (Array.isArray(parts) ? parts.join('') : String(parts))); } catch { return []; } };
  const [root, send, dkim, dmarc] = await Promise.all([txt(domain), txt(`send.${domain}`), txt(`resend._domainkey.${domain}`), txt(`_dmarc.${domain}`)]);
  return {
    spf: [...root, ...send].some(r => /^v=spf1/i.test(r)),
    dkim: dkim.some(r => /p=/.test(r)),
    dmarc: dmarc.some(r => /^v=DMARC1/i.test(r)),
  };
}

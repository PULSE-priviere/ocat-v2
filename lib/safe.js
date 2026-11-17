// Validation des types avant rendu (évite l'erreur React #31)
export function safeNum(v) { if (v === null || v === undefined || typeof v === 'object') return null; const n = Number(v); return isNaN(n) ? null : n; }
export function safeStr(v) { if (v === null || v === undefined || typeof v === 'object') return ''; return String(v); }

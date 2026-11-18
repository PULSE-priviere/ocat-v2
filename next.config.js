const fs = require('fs');
const path = require('path');

// Logo : la variable NEXT_PUBLIC_LOGO_URL si elle est renseignée, sinon le premier fichier image trouvé dans public/brand/
// (de préférence un nom qui commence par « logo »). Il suffit donc de déposer le fichier et de redéployer.
function detectLogo() {
  const dir = path.join(__dirname, 'public', 'brand');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /\.(svg|png|webp|jpe?g)$/i.test(f)).sort(); } catch { return ''; }
  const pick = files.find(f => /^logo/i.test(f)) || files[0];
  return pick ? `/brand/${encodeURIComponent(pick)}` : '';
}

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  // L'app n'utilise pas next/image : on désactive l'API d'optimisation d'images
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_LOGO_URL: process.env.NEXT_PUBLIC_LOGO_URL || detectLogo() },
};

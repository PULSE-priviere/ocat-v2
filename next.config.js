/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  // L'app n'utilise pas next/image : on désactive l'API d'optimisation d'images
  images: { unoptimized: true },
};

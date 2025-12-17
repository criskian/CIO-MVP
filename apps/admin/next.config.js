/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Configuración para producción
  output: 'standalone',
  // Optimización de imágenes
  images: {
    unoptimized: false,
    remotePatterns: [],
  },
  // Permitir SVG
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });
    return config;
  },
};

module.exports = nextConfig;


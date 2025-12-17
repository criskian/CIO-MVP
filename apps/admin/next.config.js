/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Configuración para producción con SSG
  output: 'standalone',
  // Optimización de imágenes
  images: {
    unoptimized: false,
  },
};

module.exports = nextConfig;


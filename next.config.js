/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')],
  },
  webpack: (config) => {
    // Add path aliases
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
  // Enable TypeScript checking in production
  typescript: {
    ignoreBuildErrors: false,
  },
  // Enable ESLint in production
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
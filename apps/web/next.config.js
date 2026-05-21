/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NODE_ENV === 'production' 
          ? 'http://api_layer:3001/api/:path*' 
          : 'http://localhost:3001/api/:path*',
      },
    ];
  },
  // Optimizations
  swcMinify: true,
  poweredByHeader: false,
  compress: true,
};

module.exports = nextConfig;
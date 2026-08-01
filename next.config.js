/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export keeps the deploy footprint tiny and works flawlessly
  // on Vercel's free tier (no server functions needed since all data
  // access goes through the Supabase client SDK).
  output: 'export',

  // Gzip/Brotli compression for smaller payloads on low-end mobile networks.
  compress: true,

  // No React Strict double-render cost in production builds.
  reactStrictMode: true,

  images: {
    // next/image optimization requires a server; disable it for static export
    // and rely on pre-sized, compressed source assets instead.
    unoptimized: true,
  },

  // Keep trailing slashes off to minimize URL/route table size.
  trailingSlash: false,

  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;

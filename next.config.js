/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export was removed here — real payment processing needs actual
  // server routes (to hold secret keys and verify webhook signatures,
  // neither of which is safe to do in browser-side code). Vercel hosts the
  // rest of the app essentially the same as before (still fast, still free
  // tier), it just now also runs a handful of serverless functions under
  // /app/api for checkout + webhooks.

  // Gzip/Brotli compression for smaller payloads on low-end mobile networks.
  compress: true,

  // No React Strict double-render cost in production builds.
  reactStrictMode: true,

  images: {
    // Kept from the static-export era — still avoids next/image's
    // optimization pipeline, since this app uses no images that need it.
    unoptimized: true,
  },

  // Keep trailing slashes off to minimize URL/route table size.
  trailingSlash: false,

  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;

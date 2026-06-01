/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We allow rendering of external images from S3 or R2 storage if needed.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;

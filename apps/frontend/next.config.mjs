// Constitution IX — host-agnostic. Frontend is a static export — any S3 / CDN / file:// works.
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};
export default nextConfig;

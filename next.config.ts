import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/*': ['./public/brand/lumina-lockup.png'],
  },
};

export default nextConfig;

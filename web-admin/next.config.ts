import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 3600, // 1시간 캐시 — Supabase 이그레스 절감
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dmjaynqqjztwzyvufape.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;

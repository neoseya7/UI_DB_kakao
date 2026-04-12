import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 31536000, // 1년 캐시 — Supabase egress 절감 (신규 이미지는 새 URL이라 영향 없음)
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

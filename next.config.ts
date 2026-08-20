import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permanent, not a temporary shim: the PWA shell may still be caching the
  // old link, and there is no point ever removing this.
  async redirects() {
    return [
      {
        source: "/freeplay/new",
        destination: "/sessions/new",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

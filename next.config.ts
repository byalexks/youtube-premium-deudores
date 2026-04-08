import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/_admin",
        destination: "/admin",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

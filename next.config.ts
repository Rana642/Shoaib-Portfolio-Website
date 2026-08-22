import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/cv",
        destination: "/shoaib-nabi-noor",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sanity/sdk-react ships an untranspiled-JSX dist file; run it through
  // Next's own compiler instead of treating it as pre-built.
  transpilePackages: ["@sanity/sdk-react"],
  async redirects() {
    return [
      {
        source: "/cv",
        destination: "/shoaib-nabi-noor",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // Browsers/crawlers request /favicon.ico directly regardless of the
      // <link rel="icon"> tags app/icon.tsx generates — serve it there too.
      { source: "/favicon.ico", destination: "/icon" },
    ];
  },
};

export default nextConfig;

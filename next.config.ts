import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sanity/sdk-react ships an untranspiled-JSX dist file; run it through
  // Next's own compiler instead of treating it as pre-built.
  transpilePackages: ["@sanity/sdk-react"],
  // sharp ships native bindings — keep it external rather than bundled, per
  // Next's own guidance for native-dependency packages used in Route
  // Handlers (app/api/social/tiktok-media, converting images to JPEG for TikTok).
  serverExternalPackages: ["sharp"],
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

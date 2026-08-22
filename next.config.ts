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
};

export default nextConfig;

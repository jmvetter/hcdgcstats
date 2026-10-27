import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // UDisc exports for big events can exceed the 1 MB default.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;

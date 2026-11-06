import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // UDisc exports for big events can exceed the 1 MB default.
    serverActions: { bodySizeLimit: "5mb" },
    // Check-ins made with no signal at the course wait and send once it returns.
    useOffline: true,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@h2map/lcoh-engine", "@h2map/profile-service"],
};

export default nextConfig;

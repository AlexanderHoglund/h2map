import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@h2map/lcoh-engine", "@h2map/profile-service"],
};

export default withNextIntl(nextConfig);

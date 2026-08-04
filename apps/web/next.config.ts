import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@h2map/lcoh-engine", "@h2map/profile-service"],

  /**
   * Keep URLs out of third-party access logs. The map components fetch tiles
   * straight from CARTO and Esri, and the geocoder from Nominatim; under a lax
   * referrer policy those requests would carry the FULL current URL — which on
   * `/corridor/s/<token>` is a working, capability-bearing share link, and on
   * the calculator is the `?c=` scenario blob. Origin-only closes both.
   * (The `#@lat,lon,zoom` camera hash was never at risk: fragments are not sent.)
   *
   * Set here rather than in `proxy.ts` (whose matcher skips /api and any dotted
   * path, so assets would go uncovered) or a <meta> tag (parsed only after the
   * HTML arrives, so early subresource requests can race it).
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

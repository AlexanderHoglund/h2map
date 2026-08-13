import { getRequestConfig } from "next-intl/server";

/**
 * Single-locale (English) setup without locale routing; the language stub in
 * the top bar reserves the spot for future locales. Message files are split
 * per surface and merged here.
 */
export default getRequestConfig(async () => {
  const [common, explorer, calculator, corridor, fuelEmissions] = await Promise.all([
    import("../messages/en/common.json"),
    import("../messages/en/explorer.json"),
    import("../messages/en/calculator.json"),
    import("../messages/en/corridor.json"),
    import("../messages/en/fuelemissions.json"),
  ]);
  return {
    locale: "en",
    messages: {
      ...common.default,
      ...explorer.default,
      ...calculator.default,
      ...corridor.default,
      ...fuelEmissions.default,
    },
  };
});

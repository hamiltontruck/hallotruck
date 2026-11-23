import type { CustomerLanguage } from "./customer-language";

/** Latin-script place names retain English provider search even in Oromo/Amharic UI.
 * Native Ethiopic-script queries retain the user's chosen provider language.
 * Never modify geocoder feature IDs, coordinates, or route geometry.
 */
export function mapTilerSearchLanguage(query: string, language: CustomerLanguage): CustomerLanguage {
  return /[\u1200-\u137F]/u.test(query) ? language : "en";
}

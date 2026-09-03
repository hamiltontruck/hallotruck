import { HALLO_GEOCODING_COUNTRIES, isMapTilerGeocodingUrl } from "./customer-operating-region";

const guardKey = "__halloCustomerGeocodingRegionGuard";
const guardedWindow = window as typeof window & { [guardKey]?: boolean };

if (!guardedWindow[guardKey]) {
  guardedWindow[guardKey] = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL | null = null;

    try {
      url = input instanceof Request
        ? new URL(input.url)
        : new URL(input.toString(), window.location.href);
    } catch {
      return nativeFetch(input, init);
    }

    if (!isMapTilerGeocodingUrl(url)) return nativeFetch(input, init);

    url.searchParams.set("country", HALLO_GEOCODING_COUNTRIES.join(","));

    if (input instanceof Request) {
      return nativeFetch(new Request(url, input), init);
    }

    return nativeFetch(url, init);
  };
}

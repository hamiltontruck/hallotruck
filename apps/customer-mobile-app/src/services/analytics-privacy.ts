/** Fixed, non-identifying surfaces only. Never turn URL content into telemetry. */
const SAFE_ROUTES = new Set([
  "/", "/customer-mobile", "/hallotruck/customer-mobile",
  "/home", "/book", "/orders", "/order", "/track",
  "/payments", "/profile", "/saved", "/help", "/settings",
  "/login", "/signup", "/forgot-password",
]);

function routeFromPath(input: string): string | null {
  const pathname = input.split(/[?#]/, 1)[0].trim();
  // Dynamic IDs, encoded secrets, callback parameters and unfamiliar paths
  // must never be reflected back into analytics.
  if (!/^\/[a-z/-]*$/i.test(pathname)) return null;
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return SAFE_ROUTES.has(normalized) ? normalized : null;
}

export function safeCustomerAnalyticsRoute(hash: string, pathname: string): string {
  // Supabase OAuth callbacks use #access_token=...; only known hash-router
  // paths beginning with #/ may supersede the known hosting pathname.
  const hashRoute = hash.startsWith("#/") ? routeFromPath(hash.slice(1)) : null;
  return hashRoute ?? routeFromPath(pathname) ?? "/unknown";
}

export function safeCustomerAnalyticsUrl(origin: string, route: string): string {
  // Do not use location.href, pathname, search or hash; they may hold credentials.
  const normalized = routeFromPath(route) ?? "/unknown";
  return origin + "/#" + normalized;
}

const SAFE_EVENT_NAMES = new Set([
  "$pageview", "login_succeeded", "login_failed", "quote_created", "order_placed",
  "order_cancelled", "driver_assigned", "trip_started", "trip_completed",
  "payment_confirmed", "payment_not_received", "permission_denied", "route_not_found",
]);
const SAFE_CUSTOM_KEYS = new Set([
  "environment", "release", "route", "role", "outcome", "workflow", "source",
  "device_class", "payment_method", "order_state", "reason_code", "error_code",
  "organization_type",
]);
// Explicit SDK transport metadata only; unknown/nested properties fail closed.
// Retain anonymous distinct/session identifiers so PostHog ingestion still works.
const SAFE_SDK_STRINGS = new Set([
  "$lib", "$lib_version", "$browser", "$os", "$device_type",
  "$session_id", "$window_id", "$insert_id", "$device_id", "distinct_id",
]);
const SAFE_SDK_NUMBERS = new Set([
  "$screen_width", "$screen_height", "$viewport_width", "$viewport_height",
]);
const SAFE_SDK_BOOLEANS = new Set(["$is_identified"]);
// Property-name filtering alone is insufficient: arbitrary strings can look like
// short enum codes while containing personal identifiers. Values must be curated.
const SAFE_CUSTOM_VALUES: Record<string, ReadonlySet<string>> = {
  environment: new Set(["production", "development", "preview", "test", "staging", "qa", "unknown", "local"]),
  role: new Set(["customer", "driver", "partner", "admin", "ceo", "guest", "unknown"]),
  outcome: new Set(["success", "failed", "error", "denied", "pending", "cancelled", "blocked"]),
  workflow: new Set(["customer_booking", "customer_orders", "customer_auth", "customer_tracking"]),
  source: new Set(["email_login", "google_login", "password_reset", "signup", "customer_mobile"]),
  device_class: new Set(["mobile", "tablet", "desktop", "unknown"]),
  payment_method: new Set(["cash", "bank_telebirr"]),
  order_state: new Set(["quoted", "placed", "assigned", "accepted", "in_transit", "delivered", "cancelled", "pending"]),
  reason_code: new Set(["login_unavailable", "route_preview_unavailable", "network_unavailable", "permission_denied", "quote_unavailable", "unknown_error"]),
  error_code: new Set(["network_unavailable", "permission_denied", "quote_unavailable", "unknown_error"]),
  organization_type: new Set(["individual", "business", "partner", "unknown"]),
};
const SAFE_RELEASE = /^(?:local|[a-f0-9]{7,64})$/i;
// Strict SDK-generated UUIDs only. Free-form identifier strings could themselves
// be OAuth credentials, even when the property name is allowlisted.
const SAFE_IDENTIFIER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// SDK descriptive fields are also untrusted input: never accept arbitrary scalars.
const SAFE_SDK_VALUES: Record<string, ReadonlySet<string>> = {
  "$lib": new Set(["web", "posthog-js"]),
  "$browser": new Set(["Chrome", "Chrome iOS", "Chrome Mobile", "Firefox", "Firefox iOS", "Safari", "Mobile Safari", "Edge", "Opera", "Samsung Internet", "Unknown"]),
  "$os": new Set(["iOS", "Android", "Windows", "Mac OS X", "Linux", "Chrome OS", "Ubuntu", "Unknown"]),
  "$device_type": new Set(["Mobile", "Desktop", "Tablet", "mobile", "desktop", "tablet"]),
};
const SAFE_SDK_VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[a-z0-9.-]{1,24})?$/i;

function safeCustomValue(key: string, value: unknown): string | number | boolean | undefined {
  if (!SAFE_CUSTOM_KEYS.has(key) || typeof value !== "string") return undefined;
  if (key === "release") return SAFE_RELEASE.test(value) ? value : undefined;
  return SAFE_CUSTOM_VALUES[key]?.has(value) ? value : undefined;
}

export function sanitizeCustomerAnalyticsProperties(
  input: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "route") continue; // only trusted derived route may be sent
    const cleaned = safeCustomValue(key, value);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  return output;
}

export function sanitizeCustomerPostHogEvent(input: unknown, route: string, url: string) {
  if (!input || typeof input !== "object") return null;
  const event = input as { event?: unknown; properties?: unknown; timestamp?: unknown; uuid?: unknown };
  if (typeof event.event !== "string" || !SAFE_EVENT_NAMES.has(event.event)) return null;
  const raw = event.properties && typeof event.properties === "object" && !Array.isArray(event.properties)
    ? event.properties as Record<string, unknown> : {};
  // React SPA pageviews intentionally have a static route different from location.hash.
  // Trust only a route that exactly matches a fixed known path: never accept queries,
  // fragments, dynamic IDs or OAuth callback values from SDK-generated properties.
  const suppliedRoute = event.event === "$pageview"
    && typeof raw.route === "string" && !/[?#]/.test(raw.route)
    ? routeFromPath(raw.route) : null;
  const safeRoute = suppliedRoute ?? routeFromPath(route) ?? "/unknown";
  const clean: Record<string, string | number | boolean> = sanitizeCustomerAnalyticsProperties(raw);
  for (const [key, value] of Object.entries(raw)) {
    if (!SAFE_SDK_STRINGS.has(key) || typeof value !== "string") {
      if (SAFE_SDK_NUMBERS.has(key) && typeof value === "number" && Number.isFinite(value)) clean[key] = value;
      else if (SAFE_SDK_BOOLEANS.has(key) && typeof value === "boolean") clean[key] = value;
      continue;
    }
    if (key === "distinct_id" || key.endsWith("_id")) {
      if (SAFE_IDENTIFIER.test(value)) clean[key] = value;
    } else if (key === "$lib_version" ? SAFE_SDK_VERSION.test(value) : SAFE_SDK_VALUES[key]?.has(value)) {
      clean[key] = value;
    }
  }
  clean.route = safeRoute;
  clean.$pathname = safeRoute;
  // url is constructed from window.location.origin by safeCustomerAnalyticsUrl.
  // No previously captured URL or referrer is reintroduced.
  clean.$current_url = url.endsWith("#" + safeRoute) ? url : url.split("#", 1)[0] + "#" + safeRoute;
  clean.$referrer = "";

  const result: { event: string; properties: typeof clean; timestamp?: string; uuid?: string } = {
    event: event.event,
    properties: clean,
  };
  if (typeof event.timestamp === "string" && /^\d{4}-\d\d-\d\dT[\d:.+-]+Z?$/.test(event.timestamp)) {
    result.timestamp = event.timestamp;
  }
  if (typeof event.uuid === "string" && SAFE_IDENTIFIER.test(event.uuid)) result.uuid = event.uuid;
  return result;
}

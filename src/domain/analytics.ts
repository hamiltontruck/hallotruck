export type AnalyticsEventName =
  | "login_succeeded"
  | "login_failed"
  | "quote_created"
  | "order_placed"
  | "order_cancelled"
  | "driver_assigned"
  | "job_accepted"
  | "trip_started"
  | "trip_completed"
  | "payment_confirmed"
  | "payment_not_received"
  | "settlement_requested"
  | "settlement_approved"
  | "settlement_payment_recorded"
  | "permission_denied"
  | "route_not_found";

export type AnalyticsProperties = Record<string, unknown>;

const SAFE_CUSTOM_PROPERTY_KEYS = new Set([
  "environment",
  "release",
  "route",
  "role",
  "outcome",
  "workflow",
  "source",
  "device_class",
  "payment_method",
  "order_state",
  "reason_code",
  "error_code",
  "organization_type",
]);

const BLOCKED_KEY_PARTS = new Set([
  "address",
  "authorization",
  "cookie",
  "credential",
  "description",
  "document",
  "email",
  "full_name",
  "name",
  "note",
  "password",
  "phone",
  "photo",
  "provider_ref",
  "receipt",
  "reference",
  "secret",
  "signature",
  "token",
  "transaction",
]);
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_VALUE = /^\+?[\d\s().-]{8,20}$/;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;

function normalizedKeyParts(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isBlockedPropertyKey(key: string) {
  const normalized = normalizedKeyParts(key).join("_");
  if (BLOCKED_KEY_PARTS.has(normalized)) return true;
  return [...BLOCKED_KEY_PARTS].some((part) => normalized.startsWith(`${part}_`) || normalized.endsWith(`_${part}`) || normalized.includes(`_${part}_`));
}

function safeString(value: string) {
  const normalized = value.trim();
  if (EMAIL_VALUE.test(normalized) || PHONE_VALUE.test(normalized)) return "[redacted]";
  return normalized.slice(0, 160);
}

function sanitizeNestedValue(value: unknown, depth = 0): unknown {
  if (depth > 3 || value == null) return value == null ? null : undefined;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return safeString(value);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeNestedValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isBlockedPropertyKey(key)) continue;
      const sanitized = sanitizeNestedValue(item, depth + 1);
      if (sanitized !== undefined) clean[key] = sanitized;
    }
    return clean;
  }
  return undefined;
}

export function normalizeAnalyticsRoute(input: string) {
  let route = input.trim();
  try {
    if (/^https?:\/\//i.test(route)) {
      const url = new URL(route);
      route = url.hash ? url.hash.slice(1) : url.pathname;
    }
  } catch {
    route = "/unknown";
  }
  const hashIndex = route.indexOf("#");
  if (hashIndex >= 0) route = route.slice(hashIndex + 1);
  route = route.split("?", 1)[0] || "/";
  try { route = decodeURIComponent(route); } catch { /* keep safe encoded route */ }
  if (!route.startsWith("/")) route = `/${route}`;

  const parts = route.split("/").map((part, index, values) => {
    if (!part) return part;
    const previous = values[index - 1]?.toLowerCase();
    if ((previous === "tracking" || previous === "payment") && index === values.length - 1) return ":orderId";
    if (UUID_SEGMENT.test(part) || OPAQUE_SEGMENT.test(part)) return ":id";
    return part.slice(0, 48);
  });
  return parts.join("/").replace(/\/{2,}/g, "/").slice(0, 160) || "/";
}

export function sanitizeAnalyticsProperties(properties: AnalyticsProperties) {
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!SAFE_CUSTOM_PROPERTY_KEYS.has(key) || isBlockedPropertyKey(key)) continue;
    if (typeof value === "boolean" || typeof value === "number") clean[key] = value;
    else if (typeof value === "string") clean[key] = safeString(value);
  }
  return clean;
}

export function sanitizePostHogEvent(input: unknown, currentRoute = "/", currentUrl = currentRoute) {
  if (!input || typeof input !== "object") return null;
  const event = input as { event?: unknown; properties?: unknown };
  const eventName = typeof event.event === "string" ? event.event : "";
  if (["$autocapture", "$snapshot", "$exception"].includes(eventName)) return null;

  const properties = sanitizeNestedValue(event.properties);
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return { ...event, properties: {} };
  const clean = properties as Record<string, unknown>;
  if ("$current_url" in clean) clean.$current_url = currentUrl;
  if ("$pathname" in clean) clean.$pathname = currentRoute;
  if ("$referrer" in clean) clean.$referrer = "";
  return { ...event, properties: clean };
}

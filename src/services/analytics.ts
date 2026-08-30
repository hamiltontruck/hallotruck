import { supabase } from "./supabase.client";

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

type PostHogMethod = (...args: unknown[]) => unknown;
type PostHogStub = unknown[] & {
  __SV?: number;
  __loaded?: boolean;
  _i?: unknown[][];
  init?: PostHogMethod;
  capture?: PostHogMethod;
  identify?: PostHogMethod;
  reset?: PostHogMethod;
  people?: unknown[];
  [key: string]: unknown;
};

declare global {
  interface Window {
    posthog?: PostHogStub;
  }
}

const SDK_METHODS = [
  "capture",
  "register",
  "register_once",
  "register_for_session",
  "unregister",
  "unregister_for_session",
  "identify",
  "setPersonProperties",
  "group",
  "resetGroups",
  "reset",
  "get_distinct_id",
  "getGroups",
  "get_session_id",
  "get_property",
  "getSessionProperty",
  "opt_in_capturing",
  "opt_out_capturing",
  "has_opted_in_capturing",
  "has_opted_out_capturing",
] as const;

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

const BLOCKED_PROPERTY_KEY = /(address|authorization|cookie|credential|description|document|email|full.?name|name|note|password|phone|photo|provider.?ref|receipt|reference|secret|signature|token|transaction)/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_VALUE = /^\+?[\d\s().-]{8,20}$/;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{24,}$/;
const ANALYTICS_SCRIPT_ID = "hallo-posthog-sdk";

let initialized = false;

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
      if (BLOCKED_PROPERTY_KEY.test(key)) continue;
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
    if (!SAFE_CUSTOM_PROPERTY_KEYS.has(key) || BLOCKED_PROPERTY_KEY.test(key)) continue;
    if (typeof value === "boolean" || typeof value === "number") clean[key] = value;
    else if (typeof value === "string") clean[key] = safeString(value);
  }
  return clean;
}

export function sanitizePostHogEvent(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const event = input as { event?: unknown; properties?: unknown };
  const eventName = typeof event.event === "string" ? event.event : "";
  if (["$autocapture", "$snapshot", "$exception"].includes(eventName)) return null;

  const properties = sanitizeNestedValue(event.properties);
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return { ...event, properties: {} };
  const clean = properties as Record<string, unknown>;
  const route = typeof window === "undefined" ? "/" : normalizeAnalyticsRoute(window.location.hash || window.location.pathname);
  if ("$current_url" in clean) clean.$current_url = typeof window === "undefined" ? route : `${window.location.origin}${window.location.pathname}#${route}`;
  if ("$pathname" in clean) clean.$pathname = route;
  if ("$referrer" in clean) clean.$referrer = "";
  return { ...event, properties: clean };
}

function addQueuedMethod(target: PostHogStub, method: string) {
  target[method] = (...args: unknown[]) => target.push([method, ...args]);
}

function installSnippetStub(apiHost: string) {
  const existing = window.posthog;
  if (existing?.__SV || existing?.__loaded) return existing;

  const root = (existing ?? []) as PostHogStub;
  window.posthog = root;
  root._i = root._i ?? [];
  root.init = (token: unknown, config: unknown, instanceName?: unknown) => {
    if (!document.getElementById(ANALYTICS_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = ANALYTICS_SCRIPT_ID;
      script.type = "text/javascript";
      script.crossOrigin = "anonymous";
      script.async = true;
      script.src = `${apiHost.replace(".i.posthog.com", "-assets.i.posthog.com")}/static/1/array.js`;
      document.head.appendChild(script);
    }
    const name = typeof instanceName === "string" && instanceName ? instanceName : "posthog";
    const target = name === "posthog" ? root : ((root[name] = []) as PostHogStub);
    target.people = target.people ?? [];
    for (const method of SDK_METHODS) addQueuedMethod(target, method);
    root._i?.push([token, config, instanceName]);
    return target;
  };
  root.__SV = 1;
  return root;
}

function environmentProperties() {
  return {
    environment: import.meta.env.MODE || "unknown",
    release: String(import.meta.env.VITE_RELEASE_SHA || "local").slice(0, 64),
  };
}

function deviceClass() {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

function client() {
  return typeof window === "undefined" ? undefined : window.posthog;
}

export function captureAnalyticsPageview() {
  if (!initialized || typeof window === "undefined") return;
  const route = normalizeAnalyticsRoute(window.location.hash || window.location.pathname);
  client()?.capture?.("$pageview", {
    ...environmentProperties(),
    route,
    device_class: deviceClass(),
    $pathname: route,
    $current_url: `${window.location.origin}${window.location.pathname}#${route}`,
  });
}

export function captureAnalyticsEvent(event: AnalyticsEventName, properties: AnalyticsProperties = {}) {
  if (!initialized) return;
  client()?.capture?.(event, {
    ...environmentProperties(),
    route: typeof window === "undefined" ? "/" : normalizeAnalyticsRoute(window.location.hash || window.location.pathname),
    device_class: deviceClass(),
    ...sanitizeAnalyticsProperties(properties),
  });
}

async function identifyAuthenticatedUser(userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = typeof data?.role === "string" ? data.role.toLowerCase() : "unknown";
  client()?.identify?.(userId, { role, ...environmentProperties() });
}

async function syncIdentity() {
  const { data } = await supabase.auth.getUser();
  if (data.user) await identifyAuthenticatedUser(data.user.id);
  else client()?.reset?.();
}

export function initializeAnalytics() {
  if (initialized || typeof window === "undefined") return initialized;
  const token = String(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN || "").trim();
  if (!token) return false;

  const apiHost = String(import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const stub = installSnippetStub(apiHost);
  stub.init?.(token, {
    api_host: apiHost,
    defaults: "2026-05-30",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
    persistence: "memory",
    ip: false,
    advanced_disable_flags: true,
    before_send: sanitizePostHogEvent,
  });

  initialized = true;
  captureAnalyticsPageview();
  window.addEventListener("hashchange", captureAnalyticsPageview);
  void syncIdentity();
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) client()?.reset?.();
    else void identifyAuthenticatedUser(session.user.id);
  });
  return true;
}

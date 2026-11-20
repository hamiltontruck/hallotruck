import { safeCustomerAnalyticsRoute, safeCustomerAnalyticsUrl, sanitizeCustomerAnalyticsProperties, sanitizeCustomerPostHogEvent } from "./analytics-privacy";

export type AnalyticsEventName =
  | "login_succeeded"
  | "login_failed"
  | "quote_created"
  | "order_placed"
  | "order_cancelled"
  | "driver_assigned"
  | "trip_started"
  | "trip_completed"
  | "payment_confirmed"
  | "payment_not_received"
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
  [key: string]: unknown;
};

declare global {
  interface Window { posthog?: PostHogStub; }
}

const SCRIPT_ID = "hallo-customer-posthog-sdk";
const SDK_METHODS = ["capture"] as const;
let initialized = false;

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
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.type = "text/javascript";
      script.crossOrigin = "anonymous";
      script.async = true;
      script.src = `${apiHost.replace(".i.posthog.com", "-assets.i.posthog.com")}/static/1/array.js`;
      document.head.appendChild(script);
    }
    const target = root;
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

function currentRoute() {
  return safeCustomerAnalyticsRoute(window.location.hash, window.location.pathname);
}

function currentSafeUrl(route = currentRoute()) {
  return safeCustomerAnalyticsUrl(window.location.origin, route);
}

function deviceClass() {
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

function emitAnalyticsPageview(route: string) {
  window.posthog?.capture?.("$pageview", {
    ...environmentProperties(),
    route,
    device_class: deviceClass(),
    $pathname: route,
    $current_url: currentSafeUrl(route),
  });
}

export function captureAnalyticsPageview() {
  if (!initialized) return;
  emitAnalyticsPageview(currentRoute());
}

/** React state-navigation does not change location.hash. Track only fixed page names. */
export function captureAnalyticsVirtualPageview(pageRoute: string) {
  if (!initialized) return;
  const route = safeCustomerAnalyticsRoute("#" + pageRoute, window.location.pathname);
  emitAnalyticsPageview(route);
}

export function captureAnalyticsEvent(event: AnalyticsEventName, properties: AnalyticsProperties = {}) {
  if (!initialized) return;
  window.posthog?.capture?.(event, {
    ...environmentProperties(),
    route: currentRoute(),
    device_class: deviceClass(),
    ...sanitizeCustomerAnalyticsProperties(properties),
  });
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
    before_send: (event: unknown) => sanitizeCustomerPostHogEvent(event, currentRoute(), currentSafeUrl()),
  });

  initialized = true;
  captureAnalyticsPageview();
  window.addEventListener("hashchange", captureAnalyticsPageview);
  return true;
}

import {
  normalizeAnalyticsRoute,
  sanitizeAnalyticsProperties,
  sanitizePostHogEvent,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from "../domain/analytics";
import { supabase } from "./supabase.client";

export type { AnalyticsEventName, AnalyticsProperties } from "../domain/analytics";

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

const ANALYTICS_SCRIPT_ID = "hallo-posthog-sdk";
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

function currentRoute() {
  return typeof window === "undefined" ? "/" : normalizeAnalyticsRoute(window.location.hash || window.location.pathname);
}

function currentSafeUrl(route = currentRoute()) {
  return typeof window === "undefined" ? route : `${window.location.origin}${window.location.pathname}#${route}`;
}

export function captureAnalyticsPageview() {
  if (!initialized || typeof window === "undefined") return;
  const route = currentRoute();
  client()?.capture?.("$pageview", {
    ...environmentProperties(),
    route,
    device_class: deviceClass(),
    $pathname: route,
    $current_url: currentSafeUrl(route),
  });
}

export function captureAnalyticsEvent(event: AnalyticsEventName, properties: AnalyticsProperties = {}) {
  if (!initialized) return;
  client()?.capture?.(event, {
    ...environmentProperties(),
    route: currentRoute(),
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
    before_send: (event: unknown) => sanitizePostHogEvent(event, currentRoute(), currentSafeUrl()),
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

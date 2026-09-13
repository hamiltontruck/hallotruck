import { createClient } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const ADMIN_REALTIME_COALESCE_MS = 500;

type RealtimeHandler = (...args: unknown[]) => void;
type AdminRealtimeCoalesceMode = "channel" | "callback";

const adminRealtimeCoalesceTopics = new Map<string, AdminRealtimeCoalesceMode>([
  // The Admin shell reuses the same reload callback for several table bindings.
  // Coalesce by callback identity so section-specific handlers remain independent.
  ["admin-live-data", "callback"],

  // These legacy Admin panels use every binding only as a signal to run the same
  // expensive reload. Collapse cross-table bursts into one trailing refresh.
  ["admin-payment-review", "channel"],
  ["admin-payment-ledger-anomalies", "channel"],
  ["admin-delivery-reconciliation", "channel"],
  ["admin-payment-collection-control", "channel"],
  ["admin-driver-document-summary", "channel"],
]);

// Keep the exact inferred Supabase client type exported to the rest of the app.
// Passing the client through ReturnType<typeof createClient> widens its generated
// Database generic and turns typed tables/RPC arguments into never/undefined.
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
const rawChannel = supabaseClient.channel.bind(supabaseClient);

supabaseClient.channel = ((topic: string, params?: Parameters<typeof rawChannel>[1]) => {
  const channel = rawChannel(topic, params);
  const mode = adminRealtimeCoalesceTopics.get(topic);
  if (!mode) return channel;

  const rawOn = channel.on.bind(channel) as unknown as (
    type: string,
    filter: Record<string, unknown>,
    callback: RealtimeHandler,
  ) => RealtimeChannel;

  let channelTimer: ReturnType<typeof setTimeout> | undefined;
  let channelCallback: RealtimeHandler | undefined;
  let channelArgs: unknown[] = [];
  const callbackTimers = new Map<RealtimeHandler, ReturnType<typeof setTimeout>>();
  const callbackArgs = new Map<RealtimeHandler, unknown[]>();

  const clearPending = () => {
    if (channelTimer !== undefined) {
      globalThis.clearTimeout(channelTimer);
      channelTimer = undefined;
    }
    for (const timer of callbackTimers.values()) globalThis.clearTimeout(timer);
    callbackTimers.clear();
    callbackArgs.clear();
    channelCallback = undefined;
    channelArgs = [];
  };

  const wrap = (callback: RealtimeHandler): RealtimeHandler => {
    if (mode === "channel") {
      return (...args: unknown[]) => {
        channelCallback = callback;
        channelArgs = args;
        if (channelTimer !== undefined) globalThis.clearTimeout(channelTimer);
        channelTimer = globalThis.setTimeout(() => {
          const nextCallback = channelCallback;
          const nextArgs = channelArgs;
          channelTimer = undefined;
          channelCallback = undefined;
          channelArgs = [];
          nextCallback?.(...nextArgs);
        }, ADMIN_REALTIME_COALESCE_MS);
      };
    }

    return (...args: unknown[]) => {
      const existing = callbackTimers.get(callback);
      if (existing !== undefined) globalThis.clearTimeout(existing);
      callbackArgs.set(callback, args);
      callbackTimers.set(callback, globalThis.setTimeout(() => {
        callbackTimers.delete(callback);
        const nextArgs = callbackArgs.get(callback) ?? [];
        callbackArgs.delete(callback);
        callback(...nextArgs);
      }, ADMIN_REALTIME_COALESCE_MS));
    };
  };

  channel.on = ((type: string, filter: Record<string, unknown>, callback: RealtimeHandler) => (
    rawOn(type, filter, wrap(callback))
  )) as typeof channel.on;

  const rawUnsubscribe = channel.unsubscribe.bind(channel);
  channel.unsubscribe = ((timeout?: number) => {
    clearPending();
    return rawUnsubscribe(timeout);
  }) as typeof channel.unsubscribe;

  return channel;
}) as typeof supabaseClient.channel;

export const supabase = supabaseClient;

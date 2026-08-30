import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MyOrder } from "../../services/driver.service";
import { useLanguage } from "../../i18n/LanguageProvider";
import { Button } from "../ui/Button";

const ACTIVE_TRIP_STATUSES = new Set(["accepted", "in_transit"]);
const cancellationNeverDismissed = () => false;

type OrderStateError = "initial" | "refresh" | "not_assigned" | "inactive" | null;

const orderStateCopy = {
  en: {
    loading: "Loading your active trip…",
    loadFailed: "Your active trip could not be loaded.",
    refreshFailed: "Trip status could not be refreshed. The last confirmed trip remains visible.",
    notAssigned: "This trip is no longer assigned to your account.",
    inactive: "This trip is no longer active.",
    retry: "Retry trip status",
    retrying: "Checking trip status…",
  },
  om: {
    loading: "Trip hojii irra jiru feʼaa jira…",
    loadFailed: "Trip hojii irra jiru feʼuun hin dandaʼamne.",
    refreshFailed: "Haalli trip haaromfamuu hin dandeenye. Trip yeroo dhumaa mirkanaaʼe ammallee mulʼata.",
    notAssigned: "Trip kun account keetiif kana booda hin ramadamne.",
    inactive: "Trip kun kana booda hojii irra hin jiru.",
    retry: "Haala trip deebiʼii ilaali",
    retrying: "Haala trip ilaalaa jira…",
  },
  am: {
    loading: "ንቁ ጉዞዎን በመጫን ላይ…",
    loadFailed: "ንቁ ጉዞዎን መጫን አልተቻለም።",
    refreshFailed: "የጉዞውን ሁኔታ ማደስ አልተቻለም። መጨረሻ የተረጋገጠው ጉዞ እንደታየ ይቆያል።",
    notAssigned: "ይህ ጉዞ ከእንግዲህ ለመለያዎ አልተመደበም።",
    inactive: "ይህ ጉዞ ከእንግዲህ ንቁ አይደለም።",
    retry: "የጉዞውን ሁኔታ እንደገና ይሞክሩ",
    retrying: "የጉዞውን ሁኔታ በመፈተሽ ላይ…",
  },
} as const;

export interface DriverActiveTripOrderRenderState {
  order: MyOrder;
  onOrderChange: (order: MyOrder) => void;
}

interface DriverActiveTripOrderBoundaryProps {
  children: (state: DriverActiveTripOrderRenderState) => ReactNode;
  renderCancelled: (order: MyOrder) => ReactNode;
  renderEmpty: () => ReactNode;
  loadActiveOrders: () => Promise<MyOrder[]>;
  loadLatestCancellation: () => Promise<MyOrder | null>;
  loadAssignedOrder: (orderId: string) => Promise<MyOrder | null>;
  isCancellationDismissed?: (order: MyOrder) => boolean;
  pollIntervalMs?: number;
}

export function DriverActiveTripOrderBoundary({
  children,
  renderCancelled,
  renderEmpty,
  loadActiveOrders,
  loadLatestCancellation,
  loadAssignedOrder,
  isCancellationDismissed = cancellationNeverDismissed,
  pollIntervalMs = 5000,
}: DriverActiveTripOrderBoundaryProps) {
  const { language } = useLanguage();
  const copy = orderStateCopy[language];
  const [order, setOrder] = useState<MyOrder | null>(null);
  const [cancelledOrder, setCancelledOrder] = useState<MyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<OrderStateError>(null);
  const mountedRef = useRef(true);
  const initialRequestIdRef = useRef(0);
  const refreshRequestIdRef = useRef(0);
  const initialBusyRef = useRef(false);
  const refreshBusyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      initialRequestIdRef.current += 1;
      refreshRequestIdRef.current += 1;
      initialBusyRef.current = false;
      refreshBusyRef.current = null;
    };
  }, []);

  const loadInitial = useCallback(async () => {
    if (initialBusyRef.current) return;
    initialBusyRef.current = true;
    const requestId = ++initialRequestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const orders = await loadActiveOrders();
      if (!mountedRef.current || requestId !== initialRequestIdRef.current) return;

      const activeOrder = orders.find((candidate) => ACTIVE_TRIP_STATUSES.has(candidate.status)) ?? null;
      if (activeOrder) {
        setOrder(activeOrder);
        setCancelledOrder(null);
        setError(null);
        return;
      }

      const latestCancellation = await loadLatestCancellation();
      if (!mountedRef.current || requestId !== initialRequestIdRef.current) return;

      setOrder(null);
      setCancelledOrder(
        latestCancellation && !isCancellationDismissed(latestCancellation) ? latestCancellation : null,
      );
      setError(null);
    } catch {
      if (!mountedRef.current || requestId !== initialRequestIdRef.current) return;
      setOrder(null);
      setCancelledOrder(null);
      setError("initial");
    } finally {
      if (requestId === initialRequestIdRef.current) initialBusyRef.current = false;
      if (mountedRef.current && requestId === initialRequestIdRef.current) setLoading(false);
    }
  }, [isCancellationDismissed, loadActiveOrders, loadLatestCancellation]);

  const refreshOrder = useCallback(async (orderId: string) => {
    if (refreshBusyRef.current) return;
    refreshBusyRef.current = orderId;
    const requestId = ++refreshRequestIdRef.current;
    setRefreshing(true);

    try {
      const current = await loadAssignedOrder(orderId);
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;

      if (!current) {
        setError("not_assigned");
        setCancelledOrder(null);
        setRefreshing(false);
        refreshBusyRef.current = null;
        setOrder(null);
        return;
      }

      if (current.status === "cancelled") {
        setError(null);
        setRefreshing(false);
        refreshBusyRef.current = null;
        setOrder(null);
        setCancelledOrder(isCancellationDismissed(current) ? null : current);
        return;
      }

      if (!ACTIVE_TRIP_STATUSES.has(current.status)) {
        setError("inactive");
        setCancelledOrder(null);
        setRefreshing(false);
        refreshBusyRef.current = null;
        setOrder(null);
        return;
      }

      setOrder(current);
      setCancelledOrder(null);
      setError(null);
    } catch {
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;
      setError("refresh");
    } finally {
      if (requestId === refreshRequestIdRef.current) refreshBusyRef.current = null;
      if (mountedRef.current && requestId === refreshRequestIdRef.current) setRefreshing(false);
    }
  }, [isCancellationDismissed, loadAssignedOrder]);

  useEffect(() => {
    void loadInitial();
    return () => {
      initialRequestIdRef.current += 1;
      initialBusyRef.current = false;
    };
  }, [loadInitial]);

  useEffect(() => {
    if (!order) return;
    const orderId = order.id;
    void refreshOrder(orderId);
    const interval = window.setInterval(() => void refreshOrder(orderId), pollIntervalMs);
    return () => {
      window.clearInterval(interval);
      refreshRequestIdRef.current += 1;
      if (refreshBusyRef.current === orderId) refreshBusyRef.current = null;
    };
  }, [order?.id, pollIntervalMs, refreshOrder]);

  const retry = useCallback(() => {
    if (order) {
      void refreshOrder(order.id);
      return;
    }
    void loadInitial();
  }, [loadInitial, order, refreshOrder]);

  const onOrderChange = useCallback((nextOrder: MyOrder) => {
    setOrder(nextOrder);
    setCancelledOrder(null);
    setError(null);
  }, []);

  const errorMessage = error === "initial"
    ? copy.loadFailed
    : error === "refresh"
      ? copy.refreshFailed
      : error === "not_assigned"
        ? copy.notAssigned
        : error === "inactive"
          ? copy.inactive
          : null;

  const retrying = loading || refreshing;
  const errorNotice = errorMessage ? (
    <div
      className="mb-6 grid gap-3 border border-route/40 bg-route/5 px-4 py-4 font-body text-sm text-route sm:grid-cols-[1fr_auto] sm:items-center"
      role="alert"
      data-active-trip-order-error={error ?? undefined}
    >
      <span className="min-w-0 break-words">{errorMessage}</span>
      <Button
        type="button"
        onClick={retry}
        disabled={retrying}
        aria-describedby="driver-active-trip-order-error"
        className="min-h-11 w-full sm:w-auto"
      >
        {retrying ? copy.retrying : copy.retry}
      </Button>
      <span id="driver-active-trip-order-error" className="sr-only">{errorMessage}</span>
    </div>
  ) : null;

  if (loading && !order) {
    return (
      <div
        className="mx-auto max-w-2xl px-6 py-16 font-body text-steel"
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-active-trip-order-state="loading"
      >
        {copy.loading}
      </div>
    );
  }

  if (cancelledOrder) {
    return <div data-active-trip-order-state="cancelled">{renderCancelled(cancelledOrder)}</div>;
  }

  if (!order) {
    return (
      <section
        className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-16"
        aria-busy={retrying}
        data-active-trip-order-state={error ? "error" : "empty"}
      >
        {errorNotice}
        {renderEmpty()}
      </section>
    );
  }

  return (
    <section
      aria-busy={refreshing}
      data-active-trip-order-state={error === "refresh" ? "refresh-error" : "ready"}
    >
      <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-16">{errorNotice}</div>
      {children({ order, onOrderChange })}
    </section>
  );
}

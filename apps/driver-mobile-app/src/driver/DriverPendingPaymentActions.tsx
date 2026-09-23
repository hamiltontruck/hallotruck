import { useCallback, useEffect, useState } from "react";
import {
  confirmDriverTripPayment,
  fetchPendingDriverPaymentActions,
  reportDriverTripPaymentNotReceived,
} from "./driver-trip-payment.service";
import type { DriverPendingPaymentAction } from "./driver-trip-payment.model";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";

const REFRESH_MS = 20_000;

function money(value: number) {
  return `ETB ${Math.round(value).toLocaleString()}`;
}

export function DriverPendingPaymentActions({
  userId,
  language = "om",
}: {
  userId: string;
  language?: DriverLanguage;
}) {
  const [items, setItems] = useState<DriverPendingPaymentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const t = getDriverV4Copy(language);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      setItems(await fetchPendingDriverPaymentActions(userId));
      setError("");
    } catch (caught) {
      setError(t.pendingPayments.loadError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t.pendingPayments.loadError, userId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function confirm(item: DriverPendingPaymentAction) {
    if (busyPaymentId) return;
    setBusyPaymentId(item.paymentId);
    setError("");
    setNotice("");
    try {
      await confirmDriverTripPayment(userId, item.paymentId);
      setNotice(`${item.trackingId}: ${t.pendingPayments.confirmedNotice}`);
      await refresh(true);
    } catch (caught) {
      setError(t.pendingPayments.confirmError);
    } finally {
      setBusyPaymentId(null);
    }
  }

  async function report(item: DriverPendingPaymentAction) {
    if (busyPaymentId) return;
    if (reportingId !== item.paymentId) {
      setReportingId(item.paymentId);
      setReason("");
      return;
    }
    setBusyPaymentId(item.paymentId);
    setError("");
    setNotice("");
    try {
      await reportDriverTripPaymentNotReceived(userId, item.paymentId, reason);
      setNotice(`${item.trackingId}: ${t.pendingPayments.reportedNotice}`);
      setReportingId(null);
      setReason("");
      await refresh(true);
    } catch (caught) {
      setError(t.pendingPayments.reportError);
    } finally {
      setBusyPaymentId(null);
    }
  }

  return <section className="rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card" data-driver-pending-payments aria-busy={loading || refreshing}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{t.pendingPayments.eyebrow}</p>
        <h2 className="mt-1 text-lg font-black text-halo-navy">{t.pendingPayments.title}</h2>
        <p className="mt-1 text-[10px] leading-4 text-halo-muted">{t.pendingPayments.help}</p>
      </div>
      <button type="button" onClick={() => void refresh(true)} disabled={refreshing} className="min-h-10 shrink-0 rounded-xl bg-halo-soft px-3 text-[10px] font-black text-halo-blue disabled:opacity-50">{refreshing ? "…" : t.common.refresh}</button>
    </div>
    {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">{notice}</p>}
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{error}</p>}
    {loading && <p className="mt-4 text-xs text-halo-muted">{t.pendingPayments.loading}</p>}
    {!loading && !error && items.length === 0 && <div className="mt-4 rounded-2xl bg-halo-soft p-4 text-center">
      <p className="text-sm font-black text-halo-navy">{t.pendingPayments.noneTitle}</p>
      <p className="mt-1 text-[10px] leading-4 text-halo-muted">{t.pendingPayments.noneHelp}</p>
    </div>}
    <div className="mt-4 space-y-3">
      {items.map((item) => {
        const busy = busyPaymentId === item.paymentId;
        const reporting = reportingId === item.paymentId;
        return <article key={item.paymentId} className="rounded-[20px] border border-amber-200 bg-amber-50 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-700">{item.trackingId}</p>
              <p className="mt-1 break-words text-xs font-black text-halo-navy">{item.pickupAddress} → {item.dropoffAddress}</p>
            </div>
            <strong className="shrink-0 text-xs text-halo-blue">{money(item.amountEtb)}</strong>
          </div>
          <div className="mt-3 rounded-xl bg-white/70 p-3 text-[10px] text-halo-muted">
            <p><strong className="text-halo-navy">{t.pendingPayments.provider}:</strong> {item.provider.replaceAll("_", " ")}</p>
            <p className="mt-1"><strong className="text-halo-navy">{t.pendingPayments.reference}:</strong> {item.providerRef || "—"}</p>
          </div>
          {reporting && <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder={t.pendingPayments.reasonPlaceholder} className="mt-3 w-full rounded-xl border border-amber-200 bg-white p-3 text-xs text-halo-navy outline-none focus:border-halo-blue" />}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={Boolean(busyPaymentId) || !item.canConfirm} onClick={() => void confirm(item)} className="min-h-12 rounded-xl bg-emerald-700 px-3 text-[10px] font-black text-white disabled:opacity-40">{busy ? t.pendingPayments.saving : t.pendingPayments.received}</button>
            <button type="button" disabled={Boolean(busyPaymentId) || !item.canReportNotReceived} onClick={() => void report(item)} className="min-h-12 rounded-xl border border-red-200 bg-white px-3 text-[10px] font-black text-red-700 disabled:opacity-40">{reporting ? t.pendingPayments.report : t.pendingPayments.notReceived}</button>
          </div>
          {reporting && <button type="button" disabled={busy} onClick={() => { setReportingId(null); setReason(""); }} className="mt-2 min-h-10 w-full rounded-xl text-[10px] font-black text-halo-muted">{t.pendingPayments.cancel}</button>}
        </article>;
      })}
    </div>
  </section>;
}

import { useCallback, useEffect, useState } from "react";
import type { DriverActiveTripOrder } from "./driver-active-trip.model";
import {
  fetchAssignedCustomerContact,
  fetchDriverTripPaymentStatuses,
} from "./driver-trip-payment.service";
import type {
  DriverAssignedCustomerContact,
  DriverPaymentConfirmationType,
  DriverPaymentEvent,
  DriverTripPaymentStatus,
} from "./driver-trip-payment.model";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";

const REFRESH_MS = 20_000;

function money(value: number) {
  return `ETB ${Math.round(value).toLocaleString()}`;
}

function paymentEventLabel(event: DriverPaymentEvent, copy: ReturnType<typeof getDriverV4Copy>["customerPayment"]) {
  if (event === "released") return copy.eventReleased;
  if (event === "held_escrow") return copy.eventHeld;
  return copy.eventInitiated;
}

function confirmationLabel(
  value: DriverPaymentConfirmationType,
  copy: ReturnType<typeof getDriverV4Copy>["customerPayment"],
) {
  if (value === "payment_confirmed") return copy.driverConfirmed;
  if (value === "payment_not_received") return copy.reportedNotReceived;
  return copy.awaitingDriver;
}

export function DriverTripCustomerPaymentPanel({
  userId,
  trip,
  language = "om",
}: {
  userId: string;
  trip: DriverActiveTripOrder;
  language?: DriverLanguage;
}) {
  const [contact, setContact] = useState<DriverAssignedCustomerContact | null>(null);
  const [payments, setPayments] = useState<DriverTripPaymentStatus[]>([]);
  const [contactError, setContactError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const t = getDriverV4Copy(language);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const [contactResult, paymentResult] = await Promise.allSettled([
      fetchAssignedCustomerContact(userId, trip.id),
      fetchDriverTripPaymentStatuses(userId, trip.id),
    ]);
    if (contactResult.status === "fulfilled") {
      setContact(contactResult.value);
      setContactError("");
    } else {
      setContactError(t.customerPayment.contactLoadError);
    }
    if (paymentResult.status === "fulfilled") {
      setPayments(paymentResult.value);
      setPaymentError("");
    } else {
      setPaymentError(t.customerPayment.paymentLoadError);
    }
    setRefreshing(false);
  }, [t.customerPayment.contactLoadError, t.customerPayment.paymentLoadError, trip.id, userId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return <section className="mt-4 space-y-3" data-driver-trip-customer-payment>
    <article className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-halo-gold-dark">{t.customerPayment.assignedCustomer}</p>
          <h2 className="mt-1 text-base font-black text-halo-navy">{contact?.customerName ?? t.customerPayment.customerContact}</h2>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="min-h-10 rounded-xl bg-halo-soft px-3 text-[10px] font-black text-halo-blue disabled:opacity-50">{refreshing ? "…" : t.customerPayment.refresh}</button>
      </div>
      {contactError && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{contactError}</p>}
      {contact?.customerPhone
        ? <a href={`tel:${contact.customerPhone}`} className="mt-4 flex min-h-12 items-center justify-between rounded-2xl bg-halo-navy px-4 text-xs font-black text-white"><span>{contact.customerPhone}</span><span>{t.customerPayment.call}</span></a>
        : !contactError && <p className="mt-3 text-[11px] leading-5 text-halo-muted">{t.customerPayment.phoneProtected}</p>}
    </article>

    <article className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-halo-gold-dark">{t.customerPayment.customerPayment}</p>
        <h2 className="mt-1 text-base font-black text-halo-navy">{t.customerPayment.paymentStatus}</h2>
        <p className="mt-1 text-[11px] leading-5 text-halo-muted">{t.customerPayment.paymentHelp}</p>
      </div>
      {paymentError && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{paymentError}</p>}
      {!paymentError && payments.length === 0 && <p className="mt-3 rounded-xl bg-halo-soft px-3 py-3 text-[11px] text-halo-muted">{t.customerPayment.noPayment}</p>}
      <div className="mt-3 space-y-2">
        {payments.map((payment) => <div key={payment.paymentId} className="rounded-2xl border border-halo-line bg-halo-canvas p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-halo-navy">{payment.provider.replaceAll("_", " ")}</p>
              <p className="mt-1 text-[10px] text-halo-muted">{payment.providerRef || `${t.customerPayment.reference} —`}</p>
            </div>
            <strong className="shrink-0 text-xs text-halo-blue">{money(payment.amountEtb)}</strong>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-black">
            <span className="rounded-full bg-halo-soft px-2.5 py-1 text-halo-blue">{paymentEventLabel(payment.paymentEvent, t.customerPayment)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{confirmationLabel(payment.confirmationType, t.customerPayment)}</span>
          </div>
          {(payment.canConfirm || payment.canReportNotReceived) && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold leading-4 text-amber-800">{t.customerPayment.walletAction}</p>}
        </div>)}
      </div>
    </article>
  </section>;
}

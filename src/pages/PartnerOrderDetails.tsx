import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  getPartnerOrder,
  respondToPartnerOrderQuote,
  submitPartnerOrder,
  type PartnerOrder,
  type PartnerOrderHistory,
} from "../services/partner-order.service";

export function PartnerOrderDetails() {
  const { orderId } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState<PartnerOrder | null>(null);
  const [history, setHistory] = useState<PartnerOrderHistory[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [quoteReason, setQuoteReason] = useState("");

  async function load() {
    if (!orderId) return;
    try {
      const result = await getPartnerOrder(orderId);
      setOrder(result.order);
      setHistory(result.history);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Partner order could not be loaded.");
    }
  }

  useEffect(() => { void load(); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!order || busy) return;
    setBusy("submit");
    setError("");
    setNotice("");
    try {
      await submitPartnerOrder(order.id);
      setNotice("Order submitted for HALLO review.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Partner order could not be submitted.");
    } finally {
      setBusy("");
    }
  }

  async function respondToQuote(action: "accept" | "reject") {
    if (!order || busy) return;
    if (action === "reject" && !quoteReason.trim()) {
      setError("Add a reason before rejecting the HALLO quote.");
      return;
    }
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const updated = await respondToPartnerOrderQuote(order.id, action, quoteReason);
      if (updated.status === "expired") setNotice("This quote expired before the response and can no longer be accepted.");
      else setNotice(action === "accept" ? "HALLO quote accepted. The order is approved for Admin canonical placement." : "HALLO quote rejected and recorded in the order history.");
      setQuoteReason("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Quote response could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  const organization = params.get("organization");
  const back = organization ? `/partner/orders?organization=${encodeURIComponent(organization)}` : "/partner/orders";
  const quoteVisible = Boolean(order?.quote_amount_etb) && Boolean(order && ["quoted", "approved", "placed", "rejected", "expired"].includes(order.status));

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
      <header className="bg-asphalt px-4 py-7 text-white sm:px-7">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] text-amber">{order?.reference ?? "PARTNER ORDER"}</p>
            <h1 className="mt-2 font-display text-3xl font-bold">Order details</h1>
            <p className="mt-2 text-sm text-white/55">Tenant-isolated order record, HALLO quote decision, canonical placement, and immutable lifecycle history.</p>
          </div>
          <Link to={back} className="min-h-11 border border-white/20 px-4 py-3 text-center text-xs font-semibold">Back to orders</Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-7">
        {error && <p role="alert" className="border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
        {notice && <p role="status" className="border border-emerald-700/25 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
        {!order && !error && <p className="bg-white p-10 text-center text-sm text-steel">Loading order…</p>}

        {order && <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Route">
              <p>{order.pickup_location.city}, {order.pickup_location.country}</p>
              <p className="text-steel">{order.pickup_location.address}</p>
              <p className="my-3 text-amber-dim">↓</p>
              <p>{order.dropoff_location.city}, {order.dropoff_location.country}</p>
              <p className="text-steel">{order.dropoff_location.address}</p>
            </Card>
            <Card title="Cargo & vehicle">
              <p className="font-semibold">{order.cargo.description}</p>
              <p className="mt-2 text-sm text-steel">{order.cargo.weight_tons} tons · {order.cargo.quantity} units</p>
              <p className="mt-2 text-sm text-steel">{order.vehicle_requirements.truck_type} · {order.vehicle_requirements.required_capacity_tons} tons required</p>
            </Card>
            <Card title="Schedule">
              <p>Pickup {order.schedule.pickup_date} {order.schedule.pickup_time}</p>
              <p className="mt-2 text-sm text-steel">Priority: {order.schedule.priority}</p>
            </Card>
            <Card title="Contacts">
              <p>{order.pickup_contact.name} · {order.pickup_contact.phone}</p>
              <p className="mt-2">{order.delivery_contact.name} · {order.delivery_contact.phone}</p>
            </Card>
          </div>

          <div className="border border-asphalt/10 bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-steel">Current state</p>
                <p className="mt-1 font-display text-2xl font-bold capitalize">{order.status.replaceAll("_", " ")}</p>
              </div>
              {order.status === "draft" && <button onClick={() => void submit()} disabled={Boolean(busy)} className="min-h-12 bg-asphalt px-5 text-sm font-bold text-white disabled:opacity-40">{busy === "submit" ? "Submitting…" : "Submit for HALLO review"}</button>}
            </div>
            {order.status === "submitted" && <p className="mt-4 text-sm text-steel">Submitted successfully. HALLO Admin/CEO review is pending.</p>}
            {order.status === "under_review" && <p className="mt-4 text-sm text-steel">HALLO is reviewing route, cargo, vehicle requirements, schedule, and pricing.</p>}
          </div>

          {quoteVisible && (
            <section className="border border-amber/35 bg-white p-5" data-testid="partner-order-quote-card">
              <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">HALLO QUOTE</p>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-display text-3xl font-bold">ETB {Number(order.quote_amount_etb).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  <p className="mt-2 text-xs text-steel">Quote version {order.quote_version} · expires {order.quote_expires_at ? new Date(order.quote_expires_at).toLocaleString() : "not recorded"}</p>
                </div>
                <span className="self-start bg-asphalt px-3 py-2 text-[10px] font-semibold uppercase text-white sm:self-auto">{order.status.replaceAll("_", " ")}</span>
              </div>
              {order.admin_notes && <p className="mt-4 border-l-2 border-amber pl-3 text-sm leading-6 text-steel">HALLO note: {order.admin_notes}</p>}

              {order.status === "quoted" && (
                <div className="mt-5 space-y-3 border-t border-asphalt/10 pt-4">
                  <p className="text-sm leading-6 text-steel">Only an active Partner owner/admin can accept or reject this quote. Acceptance moves the Partner order to Approved; canonical placement is then an Admin/CEO-controlled action.</p>
                  <label className="block text-xs font-semibold">Response note / rejection reason
                    <textarea value={quoteReason} onChange={(event) => setQuoteReason(event.target.value)} rows={3} maxLength={2000} className="mt-2 w-full border border-asphalt/15 bg-white px-3 py-3 font-normal" placeholder="Optional when accepting; required when rejecting" />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={Boolean(busy)} onClick={() => void respondToQuote("accept")} className="min-h-12 bg-emerald-700 px-4 text-xs font-bold text-white disabled:opacity-40">{busy === "accept" ? "Accepting…" : "Accept HALLO quote"}</button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => void respondToQuote("reject")} className="min-h-12 border border-route/35 px-4 text-xs font-bold text-route disabled:opacity-40">{busy === "reject" ? "Rejecting…" : "Reject quote"}</button>
                  </div>
                </div>
              )}

              {order.status === "approved" && <p className="mt-5 border-t border-emerald-700/20 pt-4 text-sm font-semibold text-emerald-800">Quote accepted. HALLO Admin/CEO must place the canonical order before dispatch begins.</p>}
              {order.status === "placed" && (
                <div className="mt-5 border-t border-emerald-700/20 pt-4">
                  <p className="text-sm font-semibold text-emerald-800">Canonical HALLO order placed successfully.</p>
                  <p className="mt-2 break-all font-mono text-xs text-asphalt">{order.pricing.canonical_tracking_id ?? "Tracking pending refresh"}</p>
                  <p className="mt-1 break-all text-xs text-steel">{order.canonical_order_id}</p>
                  <p className="mt-3 text-sm text-steel">Dispatch, truck selection, and driver confirmation continue through the existing controlled workflow.</p>
                </div>
              )}
              {order.status === "rejected" && <p className="mt-5 border-t border-route/20 pt-4 text-sm font-semibold text-route">Quote rejected. The decision is preserved in lifecycle history.</p>}
              {order.status === "expired" && <p className="mt-5 border-t border-asphalt/10 pt-4 text-sm font-semibold text-steel">Quote expired. HALLO must review and issue a new quote through a later controlled revision flow.</p>}
            </section>
          )}

          <Card title="Lifecycle history">
            {history.map((event) => <div key={event.id} className="border-b border-asphalt/10 py-3 last:border-0"><p className="font-semibold capitalize">{event.to_status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-steel">{event.reason} · {new Date(event.created_at).toLocaleString()}</p></div>)}
          </Card>
        </>}
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="min-w-0 border border-asphalt/10 bg-white p-5"><h2 className="mb-4 font-display text-xl font-bold">{title}</h2>{children}</section>;
}

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelPartnerJob,
  confirmPartnerJob,
  loadAdminPartnerDispatchData,
  offerPartnerJob,
  type AdminPartnerDispatchData,
  type PartnerJobRequest,
} from "../services/partner-dispatch.service";

const empty: AdminPartnerDispatchData = { requests: [], orders: [], organizations: [] };

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminPartnerDispatch() {
  const [data, setData] = useState<AdminPartnerDispatchData>(empty);
  const [orderId, setOrderId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadAdminPartnerDispatchData();
      setData(next);
      setOrderId((current) => next.orders.some((order) => order.id === current) ? current : next.orders[0]?.id ?? "");
      setPartnerId((current) => next.organizations.some((organization) => organization.id === current) ? current : next.organizations[0]?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Partner dispatch could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openOrderIds = useMemo(
    () => new Set(data.requests.filter((request) => request.status === "pending" || request.status === "accepted").map((request) => request.order_id)),
    [data.requests],
  );
  const offerableOrders = data.orders.filter((order) => !openOrderIds.has(order.id));

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    if (busyKey) return;
    setBusyKey(key);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Partner dispatch action failed.");
    } finally {
      setBusyKey("");
    }
  }

  function submitOffer(event: FormEvent) {
    event.preventDefault();
    if (!orderId || !partnerId) return;
    void run("offer", () => offerPartnerJob(orderId, partnerId, note), "Partner job request sent.");
  }

  return (
    <main className="mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-6 sm:px-8 sm:py-10" data-testid="admin-partner-dispatch-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">ADMIN / PARTNER DISPATCH</p>
          <h1 className="mt-2 break-words font-display text-3xl font-bold">Partner job requests</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">Offer an unassigned placed order to one active Partner. The Partner selects a compliant driver-bound truck; Admin or CEO performs the final assignment.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || Boolean(busyKey)} className="min-h-11 shrink-0 border border-asphalt/20 px-4 py-3 text-xs font-semibold disabled:opacity-40">Refresh</button>
      </div>

      {error && <p role="alert" className="mt-5 break-words border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
      {notice && <p role="status" className="mt-5 break-words border border-emerald-700/25 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Offerable orders" value={offerableOrders.length} />
        <Metric label="Pending Partner" value={data.requests.filter((request) => request.status === "pending").length} />
        <Metric label="Awaiting confirmation" value={data.requests.filter((request) => request.status === "accepted").length} />
        <Metric label="Confirmed" value={data.requests.filter((request) => request.status === "confirmed").length} />
        <Metric label="Active Partners" value={data.organizations.length} />
      </div>

      <form onSubmit={submitOffer} className="mt-6 grid gap-4 border border-asphalt/10 bg-white p-4 sm:p-6 lg:grid-cols-2">
        <div className="lg:col-span-2"><h2 className="font-display text-xl font-bold">Offer order to Partner</h2><p className="mt-1 text-xs leading-5 text-steel">This does not assign the order. It creates an auditable request only.</p></div>
        <label className="text-xs font-semibold">Unassigned placed order
          <select required value={orderId} onChange={(event) => setOrderId(event.target.value)} className="mt-2 min-h-12 w-full border border-asphalt/15 bg-white px-3 font-normal">
            <option value="">Choose order</option>
            {offerableOrders.map((order) => <option key={order.id} value={order.id}>{order.tracking_id} · {order.pickup_address} → {order.dropoff_address}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Active Partner organization
          <select required value={partnerId} onChange={(event) => setPartnerId(event.target.value)} className="mt-2 min-h-12 w-full border border-asphalt/15 bg-white px-3 font-normal">
            <option value="">Choose Partner</option>
            {data.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.code}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold lg:col-span-2">Dispatch note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} className="mt-2 w-full border border-asphalt/15 px-3 py-3 font-normal" placeholder="Pickup timing, cargo handling or operational instructions" />
        </label>
        <button disabled={Boolean(busyKey) || !orderId || !partnerId} className="min-h-12 bg-asphalt px-5 text-sm font-semibold text-white disabled:opacity-40 lg:col-span-2">{busyKey === "offer" ? "Sending request…" : "Send Partner job request"}</button>
      </form>

      <section className="mt-6 overflow-hidden border border-asphalt/10 bg-white">
        <div className="border-b border-asphalt/10 p-4 sm:p-6"><h2 className="font-display text-xl font-bold">Request lifecycle</h2><p className="mt-1 text-xs text-steel">Pending → Partner accepted/rejected → Admin confirmed. Confirming writes the canonical order, truck and driver assignment.</p></div>
        {loading ? <p className="p-10 text-center font-mono text-xs text-steel">Loading Partner requests…</p> : data.requests.length === 0 ? <p className="p-10 text-center text-sm text-steel">No Partner job requests yet.</p> : (
          <div className="divide-y divide-asphalt/10">
            {data.requests.map((request) => <RequestRow key={request.id} request={request} busyKey={busyKey} cancelReason={cancelReason[request.id] ?? ""} setCancelReason={(value) => setCancelReason((current) => ({ ...current, [request.id]: value }))} run={run} />)}
          </div>
        )}
      </section>
    </main>
  );
}

function RequestRow({ request, busyKey, cancelReason, setCancelReason, run }: {
  request: PartnerJobRequest;
  busyKey: string;
  cancelReason: string;
  setCancelReason: (value: string) => void;
  run: (key: string, action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const order = request.order;
  const canConfirm = request.status === "accepted";
  const canCancel = request.status === "pending" || request.status === "accepted";
  return (
    <article className="min-w-0 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="bg-asphalt px-3 py-2 text-[10px] font-semibold uppercase text-white">{title(request.status)}</span><span className="break-all font-mono text-xs text-amber-dim">{order?.tracking_id ?? request.order_id}</span></div>
          <h3 className="mt-3 break-words font-display text-xl font-bold">{request.organization?.name ?? request.partner_id}</h3>
          <p className="mt-2 break-words text-sm text-steel">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "Order details unavailable"}</p>
          <p className="mt-1 break-words text-xs text-steel">{order?.vehicle_type ?? "Truck type unavailable"}{order?.cargo_weight_tons ? ` · ${Number(order.cargo_weight_tons)} ton` : ""}</p>
          {request.offer_note && <p className="mt-3 break-words border-l-2 border-amber pl-3 text-xs text-steel">{request.offer_note}</p>}
          {request.selected_truck_id && <p className="mt-3 rounded-xl bg-bone p-3 text-xs font-semibold">{request.truck_label} · {request.driver_label}</p>}
          {request.response_note && <p className="mt-2 break-words text-xs text-steel">Partner note: {request.response_note}</p>}
          {request.cancellation_reason && <p className="mt-2 break-words text-xs text-route">Cancelled: {request.cancellation_reason}</p>}
        </div>
        <div className="w-full shrink-0 space-y-2 lg:w-80">
          {canConfirm && <button type="button" disabled={Boolean(busyKey)} onClick={() => void run(`confirm:${request.id}`, () => confirmPartnerJob(request.id), "Partner truck and driver assigned to the order.")} className="min-h-12 w-full bg-emerald-700 px-4 text-xs font-semibold text-white disabled:opacity-40">{busyKey === `confirm:${request.id}` ? "Confirming assignment…" : "Confirm truck & driver assignment"}</button>}
          {canCancel && <>
            <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} placeholder="Cancellation reason" className="min-h-12 w-full border border-asphalt/15 px-3 text-sm" />
            <button type="button" disabled={Boolean(busyKey) || cancelReason.trim().length < 5} onClick={() => void run(`cancel:${request.id}`, () => cancelPartnerJob(request.id, cancelReason), "Partner job request cancelled.")} className="min-h-12 w-full border border-route/35 px-4 text-xs font-semibold text-route disabled:opacity-40">{busyKey === `cancel:${request.id}` ? "Cancelling…" : "Cancel request"}</button>
          </>}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 border border-asphalt/10 bg-white p-4"><p className="break-words font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 font-display text-2xl font-bold">{value}</p></div>;
}

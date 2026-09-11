import { useCallback, useEffect, useState } from "react";
import { PaymentCorrectionForm } from "./PaymentCorrectionForm";
import { openPaymentReceipt, type AdminOrder } from "../../services/admin.service";
import {
  ADMIN_PAYMENT_EVENTS,
  ADMIN_PAYMENT_PAGE_SIZES,
  getAdminPaymentLedgerPage,
  type AdminPaymentLedgerItem,
  type AdminPaymentLedgerPage,
} from "../../services/admin-payments.service";
import { supabase } from "../../services/supabase.client";

const EMPTY_PAGE: AdminPaymentLedgerPage = {
  items: [],
  page: 1,
  pageSize: 100,
  total: 0,
  totalPages: 1,
  allCount: 0,
  statusCounts: { all: 0 },
  summary: {
    releasedGross: 0,
    refunded: 0,
    releasedNet: 0,
    heldEscrow: 0,
    initiated: 0,
    paymentCount: 0,
    deliveryProofCount: 0,
  },
};

function compactMoney(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value.toLocaleString();
}

function SummaryCard({ label, value, money = true }: { label: string; value: number; money?: boolean }) {
  return <div className="border border-asphalt/10 bg-white p-4 sm:p-5"><p className="font-mono text-[10px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 font-display text-xl font-bold text-asphalt">{money ? `ETB ${compactMoney(value)}` : value.toLocaleString()}</p></div>;
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index).filter((value) => value <= totalPages);
  return <nav aria-label="Payment ledger pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-asphalt/10 bg-white p-3"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold disabled:opacity-35">Previous</button><div className="flex flex-wrap justify-center gap-2">{pages.map((value) => <button key={value} type="button" aria-current={value === page ? "page" : undefined} onClick={() => onPage(value)} className={`min-h-11 min-w-11 px-3 text-xs font-semibold ${value === page ? "bg-asphalt text-white" : "border border-asphalt/15 bg-white"}`}>{value}</button>)}</div><button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold disabled:opacity-35">Next</button></nav>;
}

function LedgerRow({ item, onManage, onRefresh }: { item: AdminPaymentLedgerItem; onManage: (order: AdminOrder) => void; onRefresh: () => Promise<void> }) {
  const { payment, order, driver } = item;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const nextEvent = payment.event === "initiated" ? "held_escrow" : payment.event === "held_escrow" ? "released" : null;
  const paymentAmount = Number(payment.amount_etb || 0);
  const deliveryLocked = nextEvent === "released" && order?.status !== "delivered";
  const canCorrect = payment.event === "held_escrow" || payment.event === "released";

  async function advance() {
    if (!nextEvent) return;
    setSaving(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("admin_update_payment_event", { p_payment_id: payment.id, p_event: nextEvent });
    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }
    await onRefresh();
    setSaving(false);
  }

  async function receipt() {
    if (!payment.receipt_path) return;
    setError("");
    try {
      await openPaymentReceipt(payment.receipt_path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receipt could not be opened.");
    }
  }

  return <div className="border-b border-asphalt/10 p-4 last:border-0 sm:px-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-base">ETB {paymentAmount.toLocaleString()}</p><span className="bg-amber/15 px-2.5 py-1.5 text-[10px] font-semibold capitalize text-amber-dim">{payment.event.replace("_", " ")}</span></div>
        <p className="mt-2 break-words font-mono text-xs text-asphalt">{order?.tracking_id ?? payment.order_id}</p>
        <p className="mt-1 break-words text-xs text-steel">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "Linked order is not visible."}</p>
        {order && <p className="mt-1 break-words text-xs text-steel">Customer: <span className="font-semibold text-asphalt">{order.customer_name ?? "Customer"}</span>{order.customer_phone ? ` · ${order.customer_phone}` : ""}</p>}
        <p className="mt-1 break-words text-xs text-steel">Driver: {driver?.full_name ?? driver?.phone ?? (order?.driver_id ? "Driver profile unavailable" : "Unassigned")}</p>
        <p className="mt-1 break-words text-xs text-steel">{payment.provider}{payment.provider_ref ? ` · Transaction ID: ${payment.provider_ref}` : " · No transaction ID"}</p>
        <p className={`mt-2 text-xs font-semibold ${payment.receipt_path ? "text-emerald-700" : "text-steel"}`}>{payment.receipt_path ? "Customer receipt attached" : "No customer receipt attached"}</p>
        {payment.event === "initiated" && <p className="mt-2 text-xs font-semibold text-amber-dim">Verification required — confirm this payment before holding it in escrow.</p>}
        {deliveryLocked && <p className="mt-2 text-xs text-route">Release is locked until this order is delivered.</p>}
        {error && <p className="mt-2 text-xs text-route">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
        {order && <button type="button" onClick={() => onManage(order)} className="min-h-11 border border-asphalt/20 px-3 py-2 text-xs font-semibold">Open order</button>}
        {payment.receipt_path && <button type="button" onClick={receipt} className="min-h-11 border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Open receipt</button>}
        {nextEvent && <button type="button" disabled={saving || deliveryLocked} onClick={advance} className="min-h-11 bg-asphalt px-3 py-2 text-xs font-semibold text-white disabled:opacity-35">{saving ? "Saving…" : nextEvent === "held_escrow" ? "Verify payment" : "Release payment"}</button>}
        {canCorrect && <button type="button" disabled={saving} onClick={() => setCorrecting((value) => !value)} className="min-h-11 bg-route px-3 py-2 text-xs font-semibold text-white disabled:opacity-35">{correcting ? "Cancel correction" : "Correct / refund"}</button>}
      </div>
    </div>
    {correcting && <PaymentCorrectionForm paymentId={payment.id} paymentAmountEtb={paymentAmount} onCancel={() => setCorrecting(false)} onSubmitted={onRefresh} />}
  </div>;
}

export function AdminPaymentLedgerPanel({
  searchQuery,
  paymentStatus,
  page,
  pageSize,
  onPage,
  onPageSize,
  onStatus,
  onClearFilters,
  onManage,
  onParentReload,
}: {
  searchQuery: string;
  paymentStatus: string;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onStatus: (status: string) => void;
  onClearFilters: () => void;
  onManage: (order: AdminOrder) => void;
  onParentReload: () => Promise<void>;
}) {
  const [data, setData] = useState<AdminPaymentLedgerPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminPaymentLedgerPage({ page, pageSize, event: paymentStatus, search: searchQuery });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payment ledger.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, paymentStatus, searchQuery]);

  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    await load();
    await onParentReload();
  }, [load, onParentReload]);

  return <>
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4"><SummaryCard label="Released customer funds" value={data.summary.releasedNet}/><SummaryCard label="Held in escrow" value={data.summary.heldEscrow}/><SummaryCard label="Needs verification" value={data.summary.initiated}/><SummaryCard label="Payment records" value={data.summary.paymentCount} money={false}/></div>

    <fieldset className="mb-4 min-w-0 border border-asphalt/10 bg-white p-3 min-[360px]:p-4"><legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-steel">Payment status</legend><div className="flex min-w-0 flex-wrap gap-2" aria-label="Payment status">{ADMIN_PAYMENT_EVENTS.map((event) => <button key={event} type="button" aria-pressed={paymentStatus === event} onClick={() => onStatus(event)} className={`min-h-11 min-w-[5rem] flex-1 border px-3 py-2 text-[11px] font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber min-[430px]:flex-none ${paymentStatus === event ? "border-asphalt bg-asphalt text-white" : "border-asphalt/10 bg-white text-steel"}`}>{event === "all" ? `All ${data.statusCounts.all ?? 0}` : `${event.replace(/_/g, " ")} ${data.statusCounts[event] ?? 0}`}</button>)}</div></fieldset>

    {paymentStatus !== "all" && <button type="button" onClick={onClearFilters} className="mb-4 text-xs font-semibold text-route underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-route">Clear Finance filters</button>}

    <div className="mb-4 flex flex-col gap-3 border border-asphalt/10 bg-white p-3 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between"><div className="text-xs text-steel"><span className="font-semibold text-asphalt">{data.total.toLocaleString()}</span> matching payments · Page {data.page} of {data.totalPages}</div><label className="flex items-center gap-2 text-xs font-semibold text-asphalt">Rows<select aria-label="Payments per page" value={data.pageSize} onChange={(event) => onPageSize(Number(event.target.value))} className="min-h-11 border border-asphalt/15 bg-white px-3">{ADMIN_PAYMENT_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div>

    {error && <p role="alert" className="mb-4 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}
    {loading ? <div role="status" className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">Loading payment ledger…</div> : <div className="min-w-0 overflow-hidden border border-asphalt/10 bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-asphalt/10 p-4 min-[360px]:p-5 sm:px-6"><h2 className="min-w-0 break-words font-display text-lg font-semibold">{searchQuery || paymentStatus !== "all" ? "Matching payments" : "Payment ledger"}</h2><span className="shrink-0 font-mono text-xs text-steel">{data.items.length} on page</span></div>{data.items.length ? data.items.map((item) => <LedgerRow key={item.payment.id} item={item} onManage={onManage} onRefresh={refresh}/>) : <p className="p-8 text-center text-sm text-steel">No matching payments.</p>}</div>}

    {data.totalPages > 1 && <Pagination page={data.page} totalPages={data.totalPages} onPage={onPage}/>} 
  </>;
}

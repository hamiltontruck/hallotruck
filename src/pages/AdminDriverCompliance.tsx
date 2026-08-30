import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase.client";
import type { DriverVerificationFile } from "../services/driver.service";
import { formatEtb } from "../utils/currency";
import { HALLO_SMART_COMMISSION_PERCENT, splitHalloCommission } from "../utils/commission";
import {
  DRIVER_IDENTITY_DOCUMENT_KEYS,
  DRIVER_VEHICLE_DOCUMENT_KEYS,
} from "../domain/driver-onboarding";

type DriverRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  home_address: string | null;
  driver_status: string | null;
};

type TruckRow = {
  id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  status: string;
  driver_id: string | null;
};

type DriverOrderRow = {
  id: string;
  tracking_id: string;
  driver_id: string | null;
  truck_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  price_etb: number | null;
  status: string;
  payment_status: string;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

type PaymentRow = {
  order_id: string;
  provider: string;
  amount_etb: number | null;
  event: string;
};

type DriverVerificationHistoryRow = {
  id: string;
  source_document_id: string;
  driver_id: string;
  truck_id: string | null;
  document_key: string;
  file_path: string;
  original_name: string;
  mime_type: string;
  expiry_date: string | null;
  status: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  archive_reason: string;
  archived_at: string;
};

type AdminDriverComplianceFixture = {
  drivers: DriverRow[];
  trucks: TruckRow[];
  documents: DriverVerificationFile[];
  history?: DriverVerificationHistoryRow[];
  orders?: DriverOrderRow[];
  payments?: PaymentRow[];
  historyAvailable?: boolean;
};

const identityRequired = DRIVER_IDENTITY_DOCUMENT_KEYS;
const vehicleRequired = DRIVER_VEHICLE_DOCUMENT_KEYS;

const labels: Record<string, string> = {
  driver_photo: "Driver photo",
  license_front: "Driving license · front",
  license_back: "Driving license · back",
  national_id_front: "National ID · front",
  national_id_back: "National ID · back",
  vehicle_registration: "Vehicle registration",
  insurance: "Insurance certificate",
  transport_permit: "Transport permit",
  truck_front: "Truck photo · front",
  truck_back: "Truck photo · back",
  truck_side: "Truck photo · side",
  truck_loading_area: "Loading area photo",
};

function money(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function releasedForOrder(order: DriverOrderRow, payments: PaymentRow[]) {
  const rows = payments.filter((payment) => payment.order_id === order.id);
  const released = rows
    .filter((payment) => payment.event === "released")
    .reduce((sum, payment) => sum + money(payment.amount_etb), 0);
  const refunded = rows
    .filter((payment) => payment.event === "refunded")
    .reduce((sum, payment) => sum + money(payment.amount_etb), 0);
  return Math.min(money(order.price_etb), Math.max(0, released - refunded));
}

function statusBadge(status: string | null | undefined) {
  if (status === "approved" || status === "verified" || status === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "rejected" || status === "suspended" || status === "failed") return "border-route/30 bg-route/5 text-route";
  return "border-amber/30 bg-amber/10 text-amber-dim";
}

export function AdminDriverCompliance({ fixture }: { fixture?: AdminDriverComplianceFixture } = {}) {
  const [drivers, setDrivers] = useState<DriverRow[]>(fixture?.drivers ?? []);
  const [trucks, setTrucks] = useState<TruckRow[]>(fixture?.trucks ?? []);
  const [documents, setDocuments] = useState<DriverVerificationFile[]>(fixture?.documents ?? []);
  const [history, setHistory] = useState<DriverVerificationHistoryRow[]>(fixture?.history ?? []);
  const [orders, setOrders] = useState<DriverOrderRow[]>(fixture?.orders ?? []);
  const [payments, setPayments] = useState<PaymentRow[]>(fixture?.payments ?? []);
  const [historyAvailable, setHistoryAvailable] = useState(fixture?.historyAvailable ?? true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const [driverResult, truckResult, documentResult, orderResult, paymentResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,phone,email,home_address,driver_status").eq("role", "driver").order("full_name"),
      supabase.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,status,driver_id").order("plate_number"),
      supabase.from("driver_verification_files").select("id,driver_id,truck_id,document_key,file_path,original_name,mime_type,expiry_date,status,rejection_reason,reviewed_at,created_at,updated_at").order("updated_at", { ascending: false }),
      supabase.from("orders").select("id,tracking_id,driver_id,truck_id,pickup_address,dropoff_address,vehicle_type,price_etb,status,payment_status,accepted_at,delivered_at,created_at").not("driver_id", "is", null).order("created_at", { ascending: false }).limit(1000),
      supabase.from("payments").select("order_id,provider,amount_etb,event").order("created_at", { ascending: false }).limit(2000),
    ]);

    const queryError = driverResult.error || truckResult.error || documentResult.error || orderResult.error || paymentResult.error;
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setDrivers((driverResult.data ?? []) as DriverRow[]);
    setTrucks((truckResult.data ?? []) as TruckRow[]);
    setDocuments((documentResult.data ?? []) as DriverVerificationFile[]);
    setOrders((orderResult.data ?? []) as DriverOrderRow[]);
    setPayments((paymentResult.data ?? []) as PaymentRow[]);
    setError("");

    const historyResult = await supabase
      .from("driver_verification_history")
      .select("id,source_document_id,driver_id,truck_id,document_key,file_path,original_name,mime_type,expiry_date,status,rejection_reason,reviewed_at,source_created_at,source_updated_at,archive_reason,archived_at")
      .order("archived_at", { ascending: false })
      .limit(2000);

    if (historyResult.error) {
      setHistory([]);
      setHistoryAvailable(false);
    } else {
      setHistory((historyResult.data ?? []) as DriverVerificationHistoryRow[]);
      setHistoryAvailable(true);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (fixture) {
      setDrivers(fixture.drivers);
      setTrucks(fixture.trucks);
      setDocuments(fixture.documents);
      setHistory(fixture.history ?? []);
      setOrders(fixture.orders ?? []);
      setPayments(fixture.payments ?? []);
      setHistoryAvailable(fixture.historyAvailable ?? true);
      setLoading(false);
      setError("");
      return;
    }
    void load();
  }, [fixture]);

  const visibleDrivers = useMemo(
    () => filter === "all"
      ? drivers
      : drivers.filter((driver) => driver.driver_status !== "approved" && driver.driver_status !== "suspended"),
    [drivers, filter],
  );

  const pendingDriverCount = useMemo(
    () => drivers.filter((driver) => driver.driver_status !== "approved" && driver.driver_status !== "suspended").length,
    [drivers],
  );

  const globalReleased = useMemo(
    () => orders.reduce((sum, order) => sum + releasedForOrder(order, payments), 0),
    [orders, payments],
  );
  const globalCommission = splitHalloCommission(globalReleased);

  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from("driver-verification").createSignedUrl(path, 300);
    if (error) { setError(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function review(doc: DriverVerificationFile, status: "verified" | "rejected") {
    const reason = status === "rejected" ? window.prompt("Rejection / correction note for the driver:", "Please upload a clearer valid document.") : null;
    if (status === "rejected" && reason === null) return;
    setBusy(doc.id); setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("driver_verification_files").update({
      status,
      rejection_reason: status === "rejected" ? reason?.trim() || "Document rejected by reviewer." : null,
      reviewed_by: auth.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", doc.id);
    if (error) setError(error.message);
    else await load();
    setBusy("");
  }

  async function approveDriver(driver: DriverRow) {
    setBusy(driver.id); setError("");
    const { error } = await supabase.rpc("admin_approve_driver_onboarding", { p_driver_id: driver.id });
    if (error) setError(error.message); else await load();
    setBusy("");
  }

  async function removeDriver(driver: DriverRow) {
    const activeTrip = orders.find((order) => order.driver_id === driver.id && ["accepted", "in_transit"].includes(order.status));
    if (activeTrip) {
      setError(`Cannot remove ${driver.full_name} while ${activeTrip.tracking_id} is ${activeTrip.status.replace("_", " ")}.`);
      return;
    }
    const confirmed = window.confirm(`Remove ${driver.full_name} from the active driver roster?\n\nThe account will be suspended, idle truck assignment released, and all trip/payment/document history preserved.`);
    if (!confirmed) return;
    setBusy(driver.id); setError("");
    const { error } = await supabase.rpc("admin_suspend_driver", { p_driver_id: driver.id });
    if (error) setError(error.message); else await load();
    setBusy("");
  }

  async function restoreDriver(driver: DriverRow) {
    const confirmed = window.confirm(`Restore ${driver.full_name} to pending review? The driver must be approved again before accepting loads.`);
    if (!confirmed) return;
    setBusy(driver.id); setError("");
    const { error } = await supabase.rpc("admin_restore_driver", { p_driver_id: driver.id });
    if (error) setError(error.message); else await load();
    setBusy("");
  }

  return <main className="min-h-screen bg-[#f5f3ed] p-4 text-asphalt sm:p-7 lg:p-10">
    <div className="mx-auto max-w-7xl">
      <section className="bg-asphalt p-6 text-white sm:p-8">
        <p className="font-mono text-[10px] tracking-[.2em] text-amber">COMPLIANCE CONTROL</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">Driver operations & verification</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">Review private documents, full trip history, driver lifecycle and HALLO Smart commission from one audit-safe workspace.</p>
          </div>
          <Link to="/admin" className="border border-white/20 px-4 py-3 text-sm font-semibold">← Operations</Link>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Active drivers" value={String(drivers.filter((driver) => driver.driver_status !== "suspended").length)} />
        <Summary label="Completed trips" value={String(orders.filter((order) => order.status === "delivered").length)} />
        <Summary label="Released customer payment" value={formatEtb(globalReleased)} />
        <Summary label={`HALLO Smart ${HALLO_SMART_COMMISSION_PERCENT}%`} value={formatEtb(globalCommission.commissionEtb)} accent />
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setFilter("pending")} className={`px-4 py-2 text-xs font-semibold ${filter === "pending" ? "bg-asphalt text-white" : "border border-asphalt/15 bg-white"}`}>Pending review</button>
          <button onClick={() => setFilter("all")} className={`px-4 py-2 text-xs font-semibold ${filter === "all" ? "bg-asphalt text-white" : "border border-asphalt/15 bg-white"}`}>All drivers</button>
        </div>
        <span className="font-mono text-xs text-steel">{pendingDriverCount} drivers awaiting · {documents.filter((doc) => doc.status === "pending").length} files pending</span>
      </div>

      {!historyAvailable && <p className="mt-4 border border-amber/30 bg-amber/10 p-3 text-xs text-amber-dim">Document version history is waiting for the new Supabase audit migration. Current verification files still work normally.</p>}
      {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}

      {loading ? <p className="py-16 text-center font-mono text-sm text-steel">Loading driver operations…</p> : visibleDrivers.length === 0 ? <div className="mt-5 border border-asphalt/10 bg-white p-10 text-center"><p className="font-display text-xl font-semibold">No drivers in this view</p><p className="mt-2 text-sm text-steel">New driver registrations and pending verification work will appear here.</p></div> : <div className="mt-5 grid gap-5">
        {visibleDrivers.map((driver) => {
          const driverDocs = documents.filter((doc) => doc.driver_id === driver.id);
          const identityDocs = driverDocs.filter((doc) => !doc.truck_id);
          const assignedTruck = trucks.find((truck) => truck.driver_id === driver.id) ?? (driverDocs.find((doc) => doc.truck_id)?.truck_id ? trucks.find((truck) => truck.id === driverDocs.find((doc) => doc.truck_id)?.truck_id) : undefined);
          const vehicleDocs = assignedTruck ? driverDocs.filter((doc) => doc.truck_id === assignedTruck.id) : [];
          const historyRows = history.filter((item) => item.driver_id === driver.id);
          const driverOrders = orders.filter((order) => order.driver_id === driver.id);
          const deliveredOrders = driverOrders.filter((order) => order.status === "delivered");
          const submittedIdentity = identityRequired.filter((key) => identityDocs.some((doc) => doc.document_key === key)).length;
          const verifiedIdentity = identityRequired.filter((key) => identityDocs.some((doc) => doc.document_key === key && doc.status === "verified")).length;
          const pendingIdentity = identityRequired.filter((key) => identityDocs.some((doc) => doc.document_key === key && doc.status === "pending")).length;
          const rejectedIdentity = identityRequired.filter((key) => identityDocs.some((doc) => doc.document_key === key && doc.status === "rejected")).length;
          const submittedVehicle = vehicleRequired.filter((key) => vehicleDocs.some((doc) => doc.document_key === key)).length;
          const verifiedVehicle = vehicleRequired.filter((key) => vehicleDocs.some((doc) => doc.document_key === key && doc.status === "verified")).length;
          const pendingVehicle = vehicleRequired.filter((key) => vehicleDocs.some((doc) => doc.document_key === key && doc.status === "pending")).length;
          const rejectedVehicle = vehicleRequired.filter((key) => vehicleDocs.some((doc) => doc.document_key === key && doc.status === "rejected")).length;
          const onboardingReady = verifiedIdentity === identityRequired.length && Boolean(assignedTruck) && verifiedVehicle === vehicleRequired.length;
          const onboardingStage = onboardingReady
            ? "Ready for approval"
            : rejectedIdentity > 0 || rejectedVehicle > 0
              ? "Corrections required"
              : verifiedIdentity < identityRequired.length && submittedIdentity === 0
                ? "Waiting for driver documents"
                : pendingIdentity > 0 || pendingVehicle > 0
                  ? "Documents under review"
                  : !assignedTruck
                    ? "Waiting for vehicle details"
                    : submittedVehicle < vehicleRequired.length
                      ? "Waiting for vehicle documents"
                      : "Onboarding incomplete";
          const releasedGross = driverOrders.reduce((sum, order) => sum + releasedForOrder(order, payments), 0);
          const split = splitHalloCommission(releasedGross);
          const expanded = expandedDriverId === driver.id;
          const activeTrip = driverOrders.find((order) => ["accepted", "in_transit"].includes(order.status));
          const approvalVisible = driver.driver_status !== "approved" && driver.driver_status !== "suspended";
          const actionBusy = busy === driver.id;
          const activeTripLabel = activeTrip ? `${activeTrip.tracking_id} is ${activeTrip.status.replace("_", " ")}` : "";
          const approvalDisabledReason = approvalVisible
            ? actionBusy
              ? "Saving driver action."
              : !onboardingReady
                ? `Cannot approve yet: ${onboardingStage}.`
                : ""
            : "";
          const removalDisabledReason = driver.driver_status !== "suspended"
            ? actionBusy
              ? "Saving driver action."
              : activeTrip
                ? `Cannot remove while active trip ${activeTripLabel}.`
                : ""
            : "";
          const restoreDisabledReason = driver.driver_status === "suspended" && actionBusy ? "Saving driver action." : "";
          const actionGuidanceMessages = Array.from(new Set([approvalDisabledReason, removalDisabledReason, restoreDisabledReason].filter(Boolean)));
          const actionGuidance = actionGuidanceMessages.join(" ") || "Driver actions are available when verification and trip locks allow them.";
          const actionGuidanceId = `driver-compliance-action-${driver.id}`;

          return <article key={driver.id} className="border border-asphalt/10 bg-white">
            <div className="grid gap-5 border-b border-asphalt/10 p-5 sm:p-6 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-2xl font-semibold">{driver.full_name}</h2><span className={`border px-2.5 py-1 text-[10px] font-semibold uppercase ${statusBadge(driver.driver_status)}`}>{driver.driver_status ?? "pending"}</span></div>
                <p className="mt-2 text-sm text-steel">{driver.phone}{driver.email ? ` · ${driver.email}` : ""}</p>
                <p className="mt-1 text-xs text-steel">{driver.home_address || "Home address not supplied"}</p>
                {driver.driver_status !== "approved" && driver.driver_status !== "suspended" && <p className="mt-3 text-xs font-semibold text-amber-dim">Onboarding: {onboardingStage} · driver {submittedIdentity}/{identityRequired.length} · vehicle {submittedVehicle}/{vehicleRequired.length}</p>}
                {activeTrip && <p className="mt-3 text-xs font-semibold text-amber-dim">Active trip: {activeTrip.tracking_id} · {activeTrip.status.replace("_", " ")}</p>}
              </div>
              <div className="flex min-w-52 flex-col gap-2">
                <div className="bg-[#f5f3ed] p-4"><p className="font-mono text-[10px] text-steel">VERIFICATION PROGRESS</p><p className="mt-1 font-display text-2xl font-bold">{verifiedIdentity + verifiedVehicle} / {identityRequired.length + vehicleRequired.length}</p><p className="mt-1 text-[11px] font-semibold text-steel">{onboardingStage}</p>{approvalVisible && <button type="button" disabled={Boolean(approvalDisabledReason)} title={approvalDisabledReason || "Approve verified driver"} aria-describedby={actionGuidanceId} onClick={() => void approveDriver(driver)} className="mt-3 w-full bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-35">Approve driver</button>}</div>
                {driver.driver_status === "suspended" ? <button type="button" disabled={Boolean(restoreDisabledReason)} title={restoreDisabledReason || "Restore driver to pending review"} aria-describedby={actionGuidanceId} onClick={() => void restoreDriver(driver)} className="border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-40">Restore driver</button> : <button type="button" disabled={Boolean(removalDisabledReason)} title={removalDisabledReason || "Remove driver after confirming no active trip"} aria-describedby={actionGuidanceId} onClick={() => void removeDriver(driver)} className="border border-route/40 px-3 py-2 text-xs font-semibold text-route disabled:opacity-35">Remove driver</button>}
                <p id={actionGuidanceId} className={`text-[11px] leading-5 ${actionGuidanceMessages.length ? "text-route" : "text-steel"}`}>{actionGuidance}</p>
              </div>
            </div>

            <div className="grid gap-px bg-asphalt/10 sm:grid-cols-2 lg:grid-cols-4">
              <Mini label="Total trips" value={String(driverOrders.length)} />
              <Mini label="Delivered" value={String(deliveredOrders.length)} />
              <Mini label="HALLO 2% commission" value={formatEtb(split.commissionEtb)} />
              <Mini label="Driver net released" value={formatEtb(split.driverNetEtb)} strong />
            </div>

            {assignedTruck && <div className="border-t border-asphalt/10 bg-emerald-50/40 px-5 py-4 text-sm sm:px-6"><strong>{assignedTruck.plate_number}</strong> · {assignedTruck.vehicle_type} · {assignedTruck.capacity_tons ?? "—"} tons · <span className="capitalize">{assignedTruck.status}</span></div>}

            <div className="border-t border-asphalt/10 px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">CURRENT DOCUMENTS</p><p className="mt-1 text-sm text-steel">{driverDocs.length} current verification records · {historyRows.length} archived versions</p></div><button onClick={() => setExpandedDriverId(expanded ? null : driver.id)} className="border border-asphalt px-4 py-2 text-xs font-semibold">{expanded ? "Hide full history" : "View full driver history"}</button></div>
            </div>

            <div className="grid gap-3 bg-[#f8f7f2] p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
              {driverDocs.length === 0 ? <div className="col-span-full rounded-2xl border border-dashed border-asphalt/15 bg-white p-7 text-center text-sm text-steel">No verification files submitted yet. This driver remains visible here while completing onboarding.</div> : driverDocs.map((doc) => <DocumentCard key={doc.id} doc={doc} busy={busy === doc.id} onOpen={openFile} onReview={review} />)}
            </div>

            {expanded && <div className="border-t-4 border-[#f5f3ed] bg-[#faf9f5] p-5 sm:p-6">
              <section>
                <div className="flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">TRIP AUDIT</p><h3 className="mt-1 font-display text-xl font-semibold">Full trip history</h3></div><span className="font-mono text-xs text-steel">{driverOrders.length} trips</span></div>
                <div className="mt-4 grid gap-3">
                  {driverOrders.length === 0 ? <p className="border border-asphalt/10 bg-white p-5 text-sm text-steel">No trips recorded for this driver.</p> : driverOrders.map((order) => {
                    const released = releasedForOrder(order, payments);
                    const payout = splitHalloCommission(released);
                    return <div key={order.id} className="border border-asphalt/10 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold">{order.tracking_id}</p><p className="mt-2 text-sm">{order.pickup_address} → {order.dropoff_address}</p></div><span className={`border px-2.5 py-1 text-[10px] font-semibold uppercase ${statusBadge(order.status)}`}>{order.status.replace("_", " ")}</span></div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><AuditValue label="Invoice" value={formatEtb(money(order.price_etb))} /><AuditValue label="Payment" value={order.payment_status.replace("_", " ")} /><AuditValue label="HALLO 2%" value={formatEtb(payout.commissionEtb)} /><AuditValue label="Driver net" value={formatEtb(payout.driverNetEtb)} strong /></div>
                      <p className="mt-3 text-[11px] text-steel">Accepted: {when(order.accepted_at)} · Delivered: {when(order.delivered_at)}</p>
                    </div>;
                  })}
                </div>
              </section>

              <section className="mt-7">
                <div className="flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">DOCUMENT AUDIT</p><h3 className="mt-1 font-display text-xl font-semibold">Document version history</h3></div><span className="font-mono text-xs text-steel">{historyRows.length} versions</span></div>
                {!historyAvailable ? <p className="mt-4 border border-amber/30 bg-amber/10 p-4 text-sm text-amber-dim">Apply the driver audit migration to start preserving every future replacement and review-state version.</p> : historyRows.length === 0 ? <p className="mt-4 border border-asphalt/10 bg-white p-5 text-sm text-steel">No archived versions yet. Future replacements and review changes will be preserved here.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{historyRows.map((item) => <div key={item.id} className="rounded-2xl border border-asphalt/10 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><DocumentGlyph muted /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{labels[item.document_key] ?? item.document_key}</p><span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase ${statusBadge(item.status)}`}>{item.status}</span></div><p className="mt-1 truncate text-xs text-steel">{item.original_name}</p></div></div><div className="mt-4 rounded-xl bg-[#f5f3ed] px-3 py-2 text-[11px] text-steel">Archived {when(item.archived_at)} · <span className="capitalize">{item.archive_reason.replace("_", " ")}</span></div>{item.rejection_reason && <p className="mt-3 rounded-xl bg-route/5 px-3 py-2 text-xs text-route">{item.rejection_reason}</p>}<button onClick={() => void openFile(item.file_path)} className="mt-4 min-h-10 w-full rounded-xl border border-asphalt/15 px-3 py-2 text-xs font-semibold transition hover:bg-asphalt hover:text-white">Open archived file</button></div>)}</div>}
              </section>
            </div>}
          </article>;
        })}
      </div>}
    </div>
  </main>;
}

function DocumentCard({
  doc,
  busy,
  onOpen,
  onReview,
}: {
  doc: DriverVerificationFile;
  busy: boolean;
  onOpen: (path: string) => Promise<void>;
  onReview: (doc: DriverVerificationFile, status: "verified" | "rejected") => Promise<void>;
}) {
  const isPdf = doc.mime_type === "application/pdf";
  const updatedLabel = new Date(doc.updated_at).toLocaleDateString();
  const expiryDate = doc.expiry_date ? new Date(`${doc.expiry_date}T00:00:00`) : null;
  const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000) : null;
  const expiryClass = daysUntilExpiry !== null && daysUntilExpiry < 0
    ? "bg-route/5 text-route"
    : daysUntilExpiry !== null && daysUntilExpiry <= 30
      ? "bg-amber/10 text-amber-dim"
      : "bg-[#f5f3ed] text-steel";
  const expiryLabel = !doc.expiry_date
    ? "No expiry"
    : daysUntilExpiry !== null && daysUntilExpiry < 0
      ? `Expired ${doc.expiry_date}`
      : `Expires ${doc.expiry_date}`;

  return <article className="flex min-h-56 flex-col rounded-2xl border border-asphalt/10 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-asphalt/20 hover:shadow-md sm:p-5">
    <div className="flex items-start gap-3">
      <DocumentGlyph verified={doc.status === "verified"} rejected={doc.status === "rejected"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-display font-semibold leading-tight">{labels[doc.document_key] ?? doc.document_key}</p>
          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${statusBadge(doc.status)}`}>{doc.status}</span>
        </div>
        <p className="mt-1 truncate text-xs text-steel" title={doc.original_name}>{doc.original_name}</p>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
      <div className="rounded-xl bg-[#f5f3ed] px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-wide text-steel">File</p>
        <p className="mt-1 font-semibold text-asphalt">{isPdf ? "PDF document" : "Image file"}</p>
      </div>
      <div className={`rounded-xl px-3 py-2 ${expiryClass}`}>
        <p className="font-mono text-[9px] uppercase tracking-wide opacity-70">Validity</p>
        <p className="mt-1 font-semibold">{expiryLabel}</p>
      </div>
    </div>

    <p className="mt-3 text-[11px] text-steel">Updated {updatedLabel}{doc.reviewed_at ? ` · Reviewed ${new Date(doc.reviewed_at).toLocaleDateString()}` : ""}</p>
    {doc.rejection_reason && <p className="mt-3 rounded-xl border border-route/15 bg-route/5 px-3 py-2 text-xs leading-relaxed text-route">{doc.rejection_reason}</p>}

    <div className="mt-auto flex flex-wrap gap-2 pt-4">
      <button onClick={() => void onOpen(doc.file_path)} className="min-h-10 flex-1 rounded-xl border border-asphalt/15 px-3 py-2 text-xs font-semibold transition hover:bg-asphalt hover:text-white">Open file</button>
      {doc.status === "pending" && <>
        <button disabled={busy} onClick={() => void onReview(doc, "verified")} className="min-h-10 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-40">Verify</button>
        <button disabled={busy} onClick={() => void onReview(doc, "rejected")} className="min-h-10 rounded-xl border border-route/30 px-4 py-2 text-xs font-semibold text-route transition hover:bg-route/5 disabled:opacity-40">Reject</button>
      </>}
    </div>
  </article>;
}

function DocumentGlyph({ verified = false, rejected = false, muted = false }: { verified?: boolean; rejected?: boolean; muted?: boolean }) {
  const tone = verified
    ? "bg-emerald-50 text-emerald-800"
    : rejected
      ? "bg-route/5 text-route"
      : muted
        ? "bg-[#f5f3ed] text-steel"
        : "bg-amber/10 text-amber-dim";

  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3.75h7l3 3V20.25H7z" />
      <path d="M14 3.75v3h3M9.5 11h5M9.5 14.5h5" />
    </svg>
  </span>;
}

function Summary({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`border p-4 sm:p-5 ${accent ? "border-amber bg-amber/10" : "border-asphalt/10 bg-white"}`}><p className="font-mono text-[9px] uppercase tracking-[.12em] text-steel">{label}</p><p className="mt-2 font-display text-xl font-bold sm:text-2xl">{value}</p></div>;
}

function Mini({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="bg-white p-4 sm:p-5"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-steel">{label}</p><p className={`mt-2 text-sm ${strong ? "font-bold text-emerald-800" : "font-semibold text-asphalt"}`}>{value}</p></div>;
}

function AuditValue({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="font-mono text-[9px] uppercase tracking-[.12em] text-steel">{label}</p><p className={`mt-1 capitalize ${strong ? "font-bold text-emerald-800" : "font-semibold text-asphalt"}`}>{value}</p></div>;
}

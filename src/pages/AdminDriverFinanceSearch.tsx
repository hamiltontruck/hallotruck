import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.client";
import { formatEtb } from "../utils/currency";
import {
  isDriverDepositAmountAllowed,
  MAX_DRIVER_DEPOSIT_ETB,
  MIN_DRIVER_DEPOSIT_ETB,
} from "../domain/driver-deposit";
import {
  DriverDepositHistory,
  type DriverDepositHistoryItem,
} from "../components/admin/DriverDepositHistory";

const QUICK_DEPOSITS = [5_000, 10_000, 25_000, 50_000, 100_000];

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  driver_status: string | null;
};

type TruckRow = {
  id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  driver_id: string | null;
};

type OrderRow = {
  id: string;
  tracking_id: string;
  customer_id: string | null;
  driver_id: string | null;
  truck_id: string | null;
  pickup_address: string;
  dropoff_address: string;
  cargo_description: string | null;
  price_etb: number | string | null;
  status: string;
  payment_status: string;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

type DriverFinancialSummary = {
  completed_trips: number | string;
  gross_released_etb: number | string;
  commission_charged_etb: number | string;
  commission_paid_etb: number | string;
  admin_deposit_etb: number | string;
  available_deposit_etb: number | string;
  commission_due_etb: number | string;
};

type SummaryMap = Record<string, DriverFinancialSummary>;

function numberOf(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nameOf(profile: ProfileRow | undefined, fallback: string) {
  return profile?.full_name?.trim() || profile?.phone?.trim() || profile?.email?.trim() || fallback;
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function AdminDriverFinanceSearch() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [deposits, setDeposits] = useState<DriverDepositHistoryItem[]>([]);
  const [summaries, setSummaries] = useState<SummaryMap>({});
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"drivers" | "orders">("drivers");
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [busyDepositId, setBusyDepositId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const drivers = useMemo(() => profiles.filter((profile) => profile.role === "driver"), [profiles]);

  const load = useCallback(async () => {
    setLoading(true);
    const [profileResult, truckResult, orderResult, depositResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,phone,email,role,driver_status").order("full_name"),
      supabase.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,driver_id").order("plate_number"),
      supabase.from("orders").select("id,tracking_id,customer_id,driver_id,truck_id,pickup_address,dropoff_address,cargo_description,price_etb,status,payment_status,accepted_at,delivered_at,created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("driver_commission_deposits").select("id,driver_id,amount_etb,reference,note,status,created_at").order("created_at", { ascending: false }).limit(500),
    ]);

    const queryError = profileResult.error || truckResult.error || orderResult.error || depositResult.error;
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const nextProfiles = (profileResult.data ?? []) as ProfileRow[];
    const nextDrivers = nextProfiles.filter((profile) => profile.role === "driver");
    const summaryEntries = await Promise.all(nextDrivers.map(async (driver) => {
      const result = await supabase.rpc("driver_financial_summary", { p_driver_id: driver.id });
      if (result.error) return [driver.id, null] as const;
      return [driver.id, ((result.data?.[0] ?? null) as DriverFinancialSummary | null)] as const;
    }));

    const nextSummaries: SummaryMap = {};
    for (const [driverId, summary] of summaryEntries) {
      if (summary) nextSummaries[driverId] = summary;
    }

    setProfiles(nextProfiles);
    setTrucks((truckResult.data ?? []) as TruckRow[]);
    setOrders((orderResult.data ?? []) as OrderRow[]);
    setDeposits((depositResult.data ?? []) as DriverDepositHistoryItem[]);
    setSummaries(nextSummaries);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const truckById = useMemo(() => new Map(trucks.map((truck) => [truck.id, truck])), [trucks]);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleDrivers = useMemo(() => drivers.filter((driver) => {
    const driverOrders = orders.filter((order) => order.driver_id === driver.id);
    const assignedTruck = trucks.find((truck) => truck.driver_id === driver.id);
    return !normalizedQuery || [
      driver.full_name,
      driver.phone,
      driver.email,
      driver.driver_status,
      assignedTruck?.plate_number,
      ...driverOrders.flatMap((order) => [order.tracking_id, order.pickup_address, order.dropoff_address]),
    ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
  }), [drivers, normalizedQuery, orders, trucks]);

  const visibleOrders = useMemo(() => orders.filter((order) => {
    const driver = order.driver_id ? profileById.get(order.driver_id) : undefined;
    const customer = order.customer_id ? profileById.get(order.customer_id) : undefined;
    const truck = order.truck_id ? truckById.get(order.truck_id) : undefined;
    return !normalizedQuery || [
      order.tracking_id,
      order.pickup_address,
      order.dropoff_address,
      order.cargo_description,
      order.status,
      order.payment_status,
      driver?.full_name,
      driver?.phone,
      customer?.full_name,
      customer?.phone,
      customer?.email,
      truck?.plate_number,
    ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
  }), [normalizedQuery, orders, profileById, truckById]);

  const totals = useMemo(() => Object.values(summaries).reduce((acc, item) => ({
    trips: acc.trips + numberOf(item.completed_trips),
    gross: acc.gross + numberOf(item.gross_released_etb),
    deposits: acc.deposits + numberOf(item.admin_deposit_etb),
    available: acc.available + numberOf(item.available_deposit_etb),
    due: acc.due + numberOf(item.commission_due_etb),
  }), { trips: 0, gross: 0, deposits: 0, available: 0, due: 0 }), [summaries]);

  async function recordDeposit(event: FormEvent<HTMLFormElement>, driver: ProfileRow) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amountEtb = Number(form.get("amountEtb") ?? 0);
    const reference = String(form.get("reference") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();

    if (!isDriverDepositAmountAllowed(amountEtb)) {
      setError(`Deposit must be between ETB ${MIN_DRIVER_DEPOSIT_ETB.toLocaleString()} and ETB ${MAX_DRIVER_DEPOSIT_ETB.toLocaleString()}.`);
      return;
    }

    setBusy(driver.id);
    setError("");
    setSuccess("");
    try {
      const result = await supabase.rpc("admin_record_driver_deposit", {
        p_driver_id: driver.id,
        p_amount_etb: amountEtb,
        p_reference: reference || null,
        p_note: note || null,
      });

      if (result.error) {
        setError(result.error.message);
      } else {
        formElement.reset();
        setSuccess(`${formatEtb(amountEtb)} deposit recorded for ${nameOf(driver, "driver")}. The driver was notified.`);
        await load();
      }
    } catch (depositError) {
      setError(depositError instanceof Error ? depositError.message : "Deposit could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  async function reverseDeposit(depositId: string, reason: string, driver: ProfileRow) {
    setBusyDepositId(depositId);
    setError("");
    setSuccess("");
    try {
      const result = await supabase.rpc("admin_reverse_driver_commission_deposit", {
        p_deposit_id: depositId,
        p_reason: reason,
      });

      if (result.error) throw new Error(result.error.message);
      setSuccess(`Deposit reversed for ${nameOf(driver, "driver")}. The driver was notified and the audit history was updated.`);
      await load();
    } finally {
      setBusyDepositId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ed] p-4 text-asphalt sm:p-7 lg:p-10">
      <div className="mx-auto max-w-7xl">
        <section className="bg-asphalt p-6 text-white sm:p-8">
          <p className="font-mono text-[10px] tracking-[.2em] text-amber">OPERATIONS & DRIVER FINANCE</p>
          <div className="mt-3 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="font-display text-3xl font-bold sm:text-4xl">Search every order, customer and driver</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">See which driver accepted each order, review trips and released earnings, and manage commission deposits from ETB 5,000 to ETB 100,000.</p>
            </div>
            <a href="#/admin" className="border border-white/20 px-4 py-3 text-sm font-semibold">← Operations</a>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-px bg-asphalt/10 md:grid-cols-5">
          <Metric label="Completed trips" value={String(totals.trips)} />
          <Metric label="Gross released" value={formatEtb(totals.gross)} />
          <Metric label="Deposits received" value={formatEtb(totals.deposits)} />
          <Metric label="Available deposit" value={formatEtb(totals.available)} strong />
          <Metric label="Commission due" value={formatEtb(totals.due)} danger={totals.due > 0} />
        </section>

        <section className="mt-5 border border-asphalt/10 bg-white p-4 sm:p-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-steel">Global search</label>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Driver, customer, phone, tracking ID, route or truck plate…" className="mt-2 w-full border border-asphalt/20 px-4 py-4 text-sm outline-none focus:border-amber" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setView("drivers")} className={`px-4 py-2 text-xs font-semibold ${view === "drivers" ? "bg-asphalt text-white" : "border border-asphalt/15"}`}>Drivers {visibleDrivers.length}</button>
            <button onClick={() => setView("orders")} className={`px-4 py-2 text-xs font-semibold ${view === "orders" ? "bg-asphalt text-white" : "border border-asphalt/15"}`}>Orders {visibleOrders.length}</button>
            {query && <button onClick={() => setQuery("")} className="px-4 py-2 text-xs font-semibold text-route">Clear search</button>}
          </div>
        </section>

        {error && <p className="mt-4 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
        {success && <p className="mt-4 border border-emerald-700/30 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}

        {loading ? <p className="py-20 text-center font-mono text-sm text-steel">Loading operations and finance…</p> : view === "orders" ? (
          <section className="mt-5 border border-asphalt/10 bg-white">
            <div className="border-b border-asphalt/10 p-5"><h2 className="font-display text-xl font-semibold">Order assignment search</h2><p className="mt-1 text-xs text-steel">Every result shows the customer, assigned driver and truck.</p></div>
            {visibleOrders.length === 0 ? <p className="p-10 text-center text-sm text-steel">No matching orders.</p> : visibleOrders.map((order) => {
              const driver = order.driver_id ? profileById.get(order.driver_id) : undefined;
              const customer = order.customer_id ? profileById.get(order.customer_id) : undefined;
              const truck = order.truck_id ? truckById.get(order.truck_id) : undefined;
              return <article key={order.id} className="border-b border-asphalt/10 p-5 last:border-0 sm:p-6">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-semibold">{order.tracking_id}</p><span className="bg-amber/15 px-2.5 py-1 text-[10px] font-semibold capitalize text-amber-dim">{order.status.replace("_", " ")}</span><span className="bg-[#f5f3ed] px-2.5 py-1 text-[10px] capitalize text-steel">{order.payment_status.replace("_", " ")}</span></div>
                    <p className="mt-3 text-sm font-medium">{order.pickup_address} → {order.dropoff_address}</p>
                    <p className="mt-2 text-xs text-steel">Customer: <strong className="text-asphalt">{nameOf(customer, "Customer profile unavailable")}</strong>{customer?.phone ? ` · ${customer.phone}` : ""}</p>
                    <p className="mt-1 text-xs text-steel">Driver: <strong className={driver ? "text-emerald-800" : "text-route"}>{nameOf(driver, order.driver_id ? "Driver profile unavailable" : "Unassigned")}</strong>{driver?.phone ? ` · ${driver.phone}` : ""}</p>
                    <p className="mt-1 text-xs text-steel">Truck: <strong className="text-asphalt">{truck?.plate_number ?? "Unassigned"}</strong>{truck ? ` · ${truck.vehicle_type} · ${truck.capacity_tons ?? "—"} tons` : ""}</p>
                  </div>
                  <div className="shrink-0 text-left md:text-right"><p className="font-display text-2xl font-bold">{formatEtb(numberOf(order.price_etb))}</p><p className="mt-2 text-[11px] text-steel">Accepted: {dateTime(order.accepted_at)}</p><p className="mt-1 text-[11px] text-steel">Delivered: {dateTime(order.delivered_at)}</p></div>
                </div>
              </article>;
            })}
          </section>
        ) : (
          <section className="mt-5 grid gap-5">
            {visibleDrivers.length === 0 ? <p className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">No matching drivers.</p> : visibleDrivers.map((driver) => {
              const summary = summaries[driver.id];
              const driverOrders = orders.filter((order) => order.driver_id === driver.id);
              const driverDeposits = deposits.filter((deposit) => deposit.driver_id === driver.id);
              const assignedTruck = trucks.find((truck) => truck.driver_id === driver.id);
              const expanded = expandedDriver === driver.id;
              return <article key={driver.id} className="border border-asphalt/10 bg-white">
                <div className="flex flex-col justify-between gap-4 border-b border-asphalt/10 p-5 sm:p-6 lg:flex-row">
                  <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-2xl font-semibold">{nameOf(driver, "Driver")}</h2><span className="border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-emerald-800">{driver.driver_status ?? "pending"}</span></div><p className="mt-2 text-sm text-steel">{driver.phone ?? "No phone"}{driver.email ? ` · ${driver.email}` : ""}</p>{assignedTruck && <p className="mt-2 text-xs font-semibold text-amber-dim">{assignedTruck.plate_number} · {assignedTruck.vehicle_type} · {assignedTruck.capacity_tons ?? "—"} tons</p>}</div>
                  <button onClick={() => setExpandedDriver(expanded ? null : driver.id)} className="self-start border border-asphalt px-4 py-3 text-xs font-semibold">{expanded ? "Hide trips & deposit" : "Open trips & deposit"}</button>
                </div>

                <div className="grid grid-cols-2 gap-px bg-asphalt/10 lg:grid-cols-4 xl:grid-cols-7">
                  <Metric label="Completed trips" value={String(numberOf(summary?.completed_trips))} />
                  <Metric label="Gross released" value={formatEtb(numberOf(summary?.gross_released_etb))} />
                  <Metric label="Commission charged" value={formatEtb(numberOf(summary?.commission_charged_etb))} />
                  <Metric label="Commission paid" value={formatEtb(numberOf(summary?.commission_paid_etb))} />
                  <Metric label="Admin deposit" value={formatEtb(numberOf(summary?.admin_deposit_etb))} />
                  <Metric label="Available deposit" value={formatEtb(numberOf(summary?.available_deposit_etb))} strong />
                  <Metric label="Commission due" value={formatEtb(numberOf(summary?.commission_due_etb))} danger={numberOf(summary?.commission_due_etb) > 0} />
                </div>

                {expanded && <div className="grid gap-5 bg-[#faf9f5] p-5 sm:p-6 xl:grid-cols-[.7fr_1.3fr]">
                  <div className="space-y-5">
                    <form onSubmit={(event) => void recordDeposit(event, driver)} className="border border-asphalt/10 bg-white p-5">
                      <p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">ADMIN DEPOSIT</p>
                      <h3 className="mt-2 font-display text-xl font-semibold">Fund commission wallet</h3>
                      <p className="mt-2 text-xs leading-5 text-steel">Allowed deposit: ETB 5,000–100,000. Verified 2% commission charges consume this balance automatically.</p>
                      <div className="mt-4 flex flex-wrap gap-2">{QUICK_DEPOSITS.map((amount) => <button key={amount} type="button" onClick={(event) => { const form = event.currentTarget.closest("form"); const input = form?.elements.namedItem("amountEtb") as HTMLInputElement | null; if (input) input.value = String(amount); }} className="border border-asphalt/15 px-3 py-2 text-[11px] font-semibold">{amount.toLocaleString()}</button>)}</div>
                      <label className="mt-5 block text-xs font-semibold">Amount ETB<input name="amountEtb" type="number" min={MIN_DRIVER_DEPOSIT_ETB} max={MAX_DRIVER_DEPOSIT_ETB} step="0.01" required className="mt-2 w-full border border-asphalt/20 p-3 text-sm" /></label>
                      <label className="mt-4 block text-xs font-semibold">Reference<input name="reference" maxLength={120} placeholder="Cash receipt or internal reference" className="mt-2 w-full border border-asphalt/20 p-3 text-sm" /></label>
                      <label className="mt-4 block text-xs font-semibold">Note<textarea name="note" maxLength={500} rows={3} placeholder="Who received it and where" className="mt-2 w-full border border-asphalt/20 p-3 text-sm" /></label>
                      <button disabled={busy === driver.id} className="mt-5 w-full bg-asphalt px-4 py-4 text-sm font-semibold text-white disabled:opacity-40">{busy === driver.id ? "Recording…" : "Record driver deposit"}</button>
                    </form>

                    <div className="border border-asphalt/10 bg-white p-5">
                      <p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">DEPOSIT HISTORY</p>
                      <DriverDepositHistory
                        deposits={driverDeposits}
                        busyDepositId={busyDepositId}
                        onReverse={(depositId, reason) => reverseDeposit(depositId, reason, driver)}
                      />
                    </div>
                  </div>

                  <div className="border border-asphalt/10 bg-white p-5">
                    <div className="flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">TRIP HISTORY</p><h3 className="mt-2 font-display text-xl font-semibold">All assigned orders</h3></div><span className="font-mono text-xs text-steel">{driverOrders.length} trips</span></div>
                    <div className="mt-4 max-h-[48rem] space-y-3 overflow-y-auto pr-1">{driverOrders.length === 0 ? <p className="border border-asphalt/10 p-5 text-sm text-steel">No trips assigned to this driver.</p> : driverOrders.map((order) => { const customer = order.customer_id ? profileById.get(order.customer_id) : undefined; const truck = order.truck_id ? truckById.get(order.truck_id) : undefined; return <div key={order.id} className="border border-asphalt/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold">{order.tracking_id}</p><p className="mt-2 text-sm">{order.pickup_address} → {order.dropoff_address}</p></div><span className="bg-[#f5f3ed] px-2.5 py-1 text-[10px] font-semibold capitalize text-steel">{order.status.replace("_", " ")}</span></div><p className="mt-3 text-xs text-steel">Customer: {nameOf(customer, "Customer")}{truck ? ` · Truck ${truck.plate_number}` : ""}</p><p className="mt-2 font-semibold">{formatEtb(numberOf(order.price_etb))}</p></div>; })}</div>
                  </div>
                </div>}
              </article>;
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, strong = false, danger = false }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return <div className={`min-h-28 bg-white p-4 ${danger ? "text-route" : ""}`}><p className="font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 break-words font-display text-lg ${strong || danger ? "font-bold" : "font-semibold"}`}>{value}</p></div>;
}

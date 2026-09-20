import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminCustomerRegistry,
  getAdminDriverRegistry,
  setAdminCustomerLevel,
  type AdminCustomerRegistryReport,
  type AdminCustomerRegistryRow,
  type AdminDriverRegistryReport,
  type CustomerLevel,
} from "../services/admin-crm-registry.service";
import { supabase } from "../services/supabase.client";

type Tab = "customers" | "drivers";
const LEVELS: CustomerLevel[] = ["standard", "silver", "gold", "vip"];

function money(value: number) {
  return `ETB ${Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function when(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function levelClass(level: CustomerLevel) {
  if (level === "vip") return "border-amber bg-amber/15 text-asphalt";
  if (level === "gold") return "border-amber/50 bg-amber/10 text-amber-dim";
  if (level === "silver") return "border-steel/30 bg-steel/10 text-steel";
  return "border-asphalt/10 bg-[#f5f3ed] text-steel";
}

export function AdminCrmRegistry() {
  const [tab, setTab] = useState<Tab>("customers");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<AdminCustomerRegistryReport | null>(null);
  const [drivers, setDrivers] = useState<AdminDriverRegistryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ customer: AdminCustomerRegistryRow; level: CustomerLevel } | null>(null);
  const [reason, setReason] = useState("");
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelError, setLevelError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [customerReport, driverReport] = await Promise.all([
        getAdminCustomerRegistry(),
        getAdminDriverRegistry(),
      ]);
      setCustomers(customerReport);
      setDrivers(driverReport);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Customer and Driver registry could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let timer: number | undefined;
    const queue = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 650);
    };
    const channel = supabase.channel("admin-crm-registry")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_verification_files" }, queue)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, queue)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const customerRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers?.customers ?? [];
    return (customers?.customers ?? []).filter((customer) => [
      customer.customerCode,
      customer.fullName,
      customer.phone,
      customer.email ?? "",
      customer.companyName ?? "",
      customer.level,
    ].some((value) => value.toLowerCase().includes(needle)));
  }, [customers, query]);

  const driverRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return drivers?.drivers ?? [];
    return (drivers?.drivers ?? []).filter((driver) => [
      driver.driverCode ?? "",
      driver.fullName ?? "",
      driver.phone ?? "",
      driver.email ?? "",
      driver.status ?? "",
      driver.plateNumber ?? "",
      driver.vehicleType ?? "",
      driver.model ?? "",
    ].some((value) => value.toLowerCase().includes(needle)));
  }, [drivers, query]);

  function openLevel(customer: AdminCustomerRegistryRow) {
    setEditing({ customer, level: customer.level });
    setReason("");
    setLevelError("");
  }

  async function saveLevel(event: FormEvent) {
    event.preventDefault();
    if (!editing || savingLevel) return;
    if (reason.trim().length < 3) {
      setLevelError("Add a short reason so this leadership change is auditable.");
      return;
    }
    setSavingLevel(true);
    setLevelError("");
    try {
      await setAdminCustomerLevel(editing.customer.id, editing.level, reason);
      setEditing(null);
      setReason("");
      await load();
    } catch (reason) {
      setLevelError(reason instanceof Error ? reason.message : "Customer level could not be updated.");
    } finally {
      setSavingLevel(false);
    }
  }

  const totalCustomers = customers?.totalCustomers ?? 0;
  const vipCustomers = customers?.vipCustomers ?? 0;
  const totalDrivers = drivers?.totalDrivers ?? 0;
  const pendingDrivers = drivers?.pendingDrivers ?? 0;

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3 pb-24 text-asphalt sm:p-6 lg:p-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="relative overflow-hidden bg-asphalt p-5 text-white sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border-[54px] border-amber/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="font-mono text-[10px] tracking-[.22em] text-amber">CUSTOMER + DRIVER CRM</span>
              <span className="border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] text-emerald-300">● DATABASE CONTROLLED</span>
            </div>
            <h1 className="mt-4 font-display text-[clamp(2rem,8vw,3.4rem)] font-bold leading-[1.02]">Know every Customer.<br className="hidden sm:block" /> Control every Driver.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/60">Stable HALLO IDs, Customer value and VIP levels, plus Driver vehicle and verification readiness in one Admin/CEO workspace.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 self-start border border-white/20 px-4 text-sm font-semibold disabled:opacity-50 lg:self-auto">↻ Refresh registry</button>
        </div>
      </header>

      {error && <p role="alert" className="mt-4 border border-route/30 bg-route/10 p-4 text-sm text-route">{error}</p>}

      <section className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi label="Customers" value={totalCustomers} detail="Canonical CRM records" />
        <Kpi label="VIP Customers" value={vipCustomers} detail="Leadership-assigned level" />
        <Kpi label="New 30 days" value={customers?.newCustomers30d ?? 0} detail="Recent Customer accounts" />
        <Kpi label="Drivers" value={totalDrivers} detail={`${drivers?.approvedDrivers ?? 0} approved`} />
        <Kpi label="Pending Drivers" value={pendingDrivers} detail="Need onboarding review" alert={pendingDrivers > 0} />
      </section>

      <section className="mt-5 border border-asphalt/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-asphalt/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 gap-2">
            <TabButton active={tab === "customers"} onClick={() => setTab("customers")}>Customers <span>{totalCustomers}</span></TabButton>
            <TabButton active={tab === "drivers"} onClick={() => setTab("drivers")}>Drivers <span>{totalDrivers}</span></TabButton>
          </div>
          <label className="min-w-0 sm:w-[360px]">
            <span className="sr-only">Search registry</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "customers" ? "Search ID, name, phone, company, level…" : "Search ID, name, phone, plate, status…"} className="min-h-12 w-full min-w-0 border border-asphalt/15 bg-[#fbfaf6] px-4 text-sm outline-none focus:border-amber" />
          </label>
        </div>

        {loading && !customers && !drivers
          ? <div className="p-16 text-center font-mono text-sm text-steel">Loading CRM registry…</div>
          : tab === "customers"
            ? <CustomerRegistry rows={customerRows} onLevel={openLevel} />
            : <DriverRegistry rows={driverRows} />}
      </section>
    </div>

    {editing && <div className="fixed inset-0 z-[80] grid place-items-end bg-asphalt/55 p-0 sm:place-items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !savingLevel) setEditing(null); }}>
      <form onSubmit={saveLevel} className="w-full max-w-lg bg-white p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="customer-level-title">
        <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">AUDITED LEADERSHIP ACTION</p>
        <h2 id="customer-level-title" className="mt-2 font-display text-2xl font-bold">Set Customer level</h2>
        <p className="mt-2 break-words text-sm text-steel">{editing.customer.customerCode} · {editing.customer.fullName}</p>
        <label className="mt-5 block text-xs font-semibold">Level
          <select value={editing.level} onChange={(event) => setEditing({ ...editing, level: event.target.value as CustomerLevel })} disabled={savingLevel} className="mt-2 min-h-12 w-full border border-asphalt/20 bg-white px-3">
            {LEVELS.map((level) => <option key={level} value={level}>{level.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="mt-4 block text-xs font-semibold">Reason
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={savingLevel} maxLength={500} rows={3} placeholder="Example: high-value repeat Customer with strong delivery history" className="mt-2 w-full resize-none border border-asphalt/20 p-3 text-sm outline-none focus:border-amber" />
        </label>
        {levelError && <p role="alert" className="mt-3 text-sm text-route">{levelError}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" disabled={savingLevel} onClick={() => setEditing(null)} className="min-h-12 flex-1 border border-asphalt/15 px-4 text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={savingLevel} className="min-h-12 flex-1 bg-asphalt px-4 text-sm font-semibold text-white disabled:opacity-50">{savingLevel ? "Saving…" : "Save level"}</button>
        </div>
      </form>
    </div>}
  </main>;
}

function Kpi({ label, value, detail, alert = false }: { label: string; value: number; detail: string; alert?: boolean }) {
  return <article className={`min-w-0 border bg-white p-4 sm:p-5 ${alert ? "border-route/30" : "border-asphalt/10"}`}>
    <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-steel">{label}</p>
    <p className={`mt-2 font-display text-3xl font-bold ${alert ? "text-route" : "text-asphalt"}`}>{value.toLocaleString()}</p>
    <p className="mt-2 text-[11px] leading-4 text-steel">{detail}</p>
  </article>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`min-h-11 px-4 text-sm font-semibold ${active ? "bg-asphalt text-white" : "bg-[#f5f3ed] text-steel"}`}>{children}</button>;
}

function CustomerRegistry({ rows, onLevel }: { rows: AdminCustomerRegistryRow[]; onLevel: (customer: AdminCustomerRegistryRow) => void }) {
  if (!rows.length) return <Empty>No Customers match this filter.</Empty>;
  return <div>
    <div className="hidden grid-cols-[130px_minmax(180px,1.4fr)_110px_90px_120px_130px_120px] gap-3 border-b border-asphalt/10 bg-[#fbfaf6] px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-steel xl:grid">
      <span>Customer ID</span><span>Customer</span><span>Level</span><span>Orders</span><span>Lifetime</span><span>Largest order</span><span>Last order</span>
    </div>
    <div className="divide-y divide-asphalt/10">{rows.map((customer) => <article key={customer.id} className="p-4 sm:p-5">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[130px_minmax(180px,1.4fr)_110px_90px_120px_130px_120px] xl:items-center xl:gap-3">
        <div><p className="xl:hidden text-[9px] uppercase tracking-wider text-steel">Customer ID</p><p className="break-all font-mono text-xs font-bold">{customer.customerCode}</p></div>
        <div className="min-w-0"><p className="break-words text-sm font-semibold">{customer.fullName}</p><p className="mt-1 break-words text-xs text-steel">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</p>{customer.companyName && <p className="mt-1 text-[11px] text-steel">{customer.companyName}</p>}</div>
        <button type="button" onClick={() => onLevel(customer)} className={`min-h-10 w-fit border px-3 font-mono text-[10px] font-bold uppercase ${levelClass(customer.level)}`}>{customer.level} ✎</button>
        <Data label="Orders" value={String(customer.orderCount)} detail={`${customer.deliveredCount} delivered`} />
        <Data label="Lifetime" value={money(customer.lifetimeOrderEtb)} />
        <Data label="Largest order" value={money(customer.largestOrderEtb)} />
        <Data label="Last order" value={when(customer.lastOrderAt)} />
      </div>
    </article>)}</div>
  </div>;
}

function DriverRegistry({ rows }: { rows: AdminDriverRegistryReport["drivers"] }) {
  if (!rows.length) return <Empty>No Drivers match this filter.</Empty>;
  return <div>
    <div className="hidden grid-cols-[130px_minmax(170px,1.3fr)_110px_150px_100px_100px_110px] gap-3 border-b border-asphalt/10 bg-[#fbfaf6] px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-steel xl:grid">
      <span>Driver ID</span><span>Driver</span><span>Status</span><span>Vehicle / plate</span><span>Docs</span><span>Orders</span><span>Last order</span>
    </div>
    <div className="divide-y divide-asphalt/10">{rows.map((driver) => {
      const ready = driver.requiredDocumentsVerified >= 8 && Boolean(driver.plateNumber);
      return <article key={driver.id} className="p-4 sm:p-5">
        <div className="grid min-w-0 gap-4 xl:grid-cols-[130px_minmax(170px,1.3fr)_110px_150px_100px_100px_110px] xl:items-center xl:gap-3">
          <div><p className="xl:hidden text-[9px] uppercase tracking-wider text-steel">Driver ID</p><p className="break-all font-mono text-xs font-bold">{driver.driverCode ?? "ID pending"}</p></div>
          <div className="min-w-0"><p className="break-words text-sm font-semibold">{driver.fullName || "Driver"}</p><p className="mt-1 break-words text-xs text-steel">{driver.phone || "No phone"}{driver.email ? ` · ${driver.email}` : ""}</p></div>
          <span className={`w-fit px-2.5 py-1 font-mono text-[9px] font-bold uppercase ${driver.status === "approved" ? "bg-emerald-100 text-emerald-800" : driver.status === "suspended" ? "bg-route/10 text-route" : "bg-amber/15 text-amber-dim"}`}>{driver.status || "pending"}</span>
          <div><p className="text-sm font-semibold">{driver.plateNumber || "Plate required"}</p><p className="mt-1 text-[11px] text-steel">{[driver.vehicleType, driver.model].filter(Boolean).join(" · ") || "Vehicle details pending"}</p></div>
          <div><p className={`font-mono text-sm font-bold ${ready ? "text-emerald-800" : "text-amber-dim"}`}>{driver.requiredDocumentsVerified}/8</p><p className="mt-1 text-[10px] text-steel">{driver.requiredDocumentsSubmitted}/8 submitted</p></div>
          <Data label="Orders" value={String(driver.orderCount)} />
          <Data label="Last order" value={when(driver.lastOrderAt)} />
        </div>
      </article>;
    })}</div>
  </div>;
}

function Data({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="min-w-0"><p className="xl:hidden text-[9px] uppercase tracking-wider text-steel">{label}</p><p className="break-words text-xs font-semibold">{value}</p>{detail && <p className="mt-1 text-[10px] text-steel">{detail}</p>}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-14 text-center text-sm text-steel">{children}</div>;
}

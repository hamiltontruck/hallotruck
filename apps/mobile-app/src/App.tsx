import { ReactNode, useEffect, useMemo, useState } from "react";
import { MobileAuthBoundary, type MobileIdentity } from "./auth/MobileAuthBoundary";
import {
  emptyCustomerMobileWorkspaceData,
  findCustomerAssignment,
  formatEtb,
  formatShortEtb,
  loadCustomerMobileWorkspace,
  orderRouteLabel,
  summarizeCustomerMobileData,
  type CustomerMobileOrder,
  type CustomerMobilePayment,
  type CustomerMobileWorkspaceData,
} from "./customer/customer-workspace.service";
import { DriverActiveTripView } from "./driver/DriverActiveTripView";
import { DriverJobsBoard } from "./driver/DriverJobsBoard";
import { DriverProfileView } from "./driver/DriverProfileView";
import { DriverWalletView } from "./driver/DriverWalletView";

type Role = "driver" | "customer";
type Tab = "home" | "jobs" | "map" | "wallet" | "profile";

type IconName =
  | "home"
  | "briefcase"
  | "map"
  | "wallet"
  | "user"
  | "bell"
  | "truck"
  | "pin"
  | "clock"
  | "arrow"
  | "filter"
  | "shield"
  | "plus"
  | "phone"
  | "message"
  | "chevron"
  | "check"
  | "box"
  | "search"
  | "receipt";

type CustomerDataState = {
  data: CustomerMobileWorkspaceData;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const customerActiveStatuses = new Set(["assigned", "accepted", "in_transit"]);
const customerTrackableStatuses = new Set(["accepted", "in_transit", "delivered"]);
const customerVehicleImages = {
  pickup: new URL("../../../public/vehicles/pickup-3-ton.webp", import.meta.url).href,
  van: new URL("../../../public/vehicles/cargo-van-5-ton.webp", import.meta.url).href,
  isuzu: new URL("../../../public/vehicles/cab-over-box-truck-5-ton.webp", import.meta.url).href,
  dryCargo: new URL("../../../public/vehicles/dry-cargo-truck-10-ton.webp", import.meta.url).href,
};

const customerTruckOptions = [
  { key: "pickup", label: "Pickup", capacity: "Max load: 3 Ton", image: customerVehicleImages.pickup, alt: "White light-duty pickup truck" },
  { key: "van", label: "Van", capacity: "Max load: 5 Ton", image: customerVehicleImages.van, alt: "White high-roof cargo van" },
  { key: "isuzu", label: "Isuzu 5 Ton", capacity: "Max load: 5 Ton", image: customerVehicleImages.isuzu, alt: "White Isuzu five ton box truck" },
  { key: "dryCargo", label: "Dry Cargo", capacity: "Max load: 10 Ton", image: customerVehicleImages.dryCargo, alt: "White dry-cargo box truck", selected: true },
] as const;

const iconPaths: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9 20v-6h6v6" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
  map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" /><path d="M8 3v15M16 6v15" /></>,
  wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v14H6.5A2.5 2.5 0 0 1 4 16.5Z" /><path d="M4 7h15M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  truck: <><path d="M3 5h11v11H3Z" /><path d="M14 9h4l3 3v4h-7Z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.8 3 8 7 10 4-2 7-5.2 7-10V6Z" /><path d="m9 12 2 2 4-4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  phone: <><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-2-2 2c-3.7-1.6-6.4-4.3-8-8l2-2Z" /></>,
  message: <><path d="M4 5h16v11H8l-4 4Z" /><path d="M8 9h8M8 12h5" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  box: <><path d="m4 7 8-4 8 4-8 4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
};

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {iconPaths[name]}
    </svg>
  );
}

function HaloLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label="HALO Smart Logistics">
      <div className={`flex items-end font-black leading-none text-halo-blue ${compact ? "text-[22px]" : "text-[28px]"}`}>
        <span>HAL</span>
        <span className="relative ml-0.5 inline-grid h-[0.9em] w-[0.78em] place-items-center rounded-[55%] bg-halo-gold text-transparent after:absolute after:bottom-[-0.14em] after:left-1/2 after:h-[0.32em] after:w-[0.32em] after:-translate-x-1/2 after:rotate-45 after:bg-halo-gold after:content-['']">
          <span className="relative z-10 h-[0.3em] w-[0.3em] rounded-full bg-white" />
        </span>
      </div>
      {!compact && (
        <div className="border-l border-halo-line pl-2">
          <p className="text-[10px] font-bold uppercase text-halo-navy">Smart</p>
          <p className="text-[10px] font-semibold uppercase text-halo-muted">Logistics</p>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase text-halo-gold-dark">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-extrabold text-halo-navy">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  icon: IconName;
  tone?: "blue" | "gold" | "green";
}) {
  const toneClass = tone === "gold" ? "bg-halo-gold-soft text-halo-gold-dark" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-halo-soft text-halo-blue";
  return (
    <div className="rounded-[20px] border border-halo-line bg-white p-3 shadow-halo-card">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${toneClass}`}>
        <Icon name={icon} className="h-4.5 w-4.5" />
      </span>
      <p className="mt-3 text-lg font-black text-halo-navy">{value}</p>
      <p className="mt-1 text-[11px] font-medium leading-4 text-halo-muted">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const value = normalizedStatus(status);
  const isLive = value === "in_transit" || value === "accepted" || value === "assigned";
  const isDone = value === "delivered";
  const isCancelled = value === "cancelled";
  const tone = isCancelled
    ? "bg-red-50 text-red-700"
    : isDone
      ? "bg-emerald-50 text-emerald-700"
      : isLive
        ? "bg-blue-50 text-halo-blue"
        : "bg-halo-gold-soft text-halo-gold-dark";
  return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${tone}`}>{readableStatus(value)}</span>;
}

function RouteCard({ role }: { role: Role }) {
  return (
    <section className="overflow-hidden rounded-[24px] bg-halo-navy text-white shadow-halo-float">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-white/50">{role === "driver" ? "Trip hojii amma" : "Ajaja amma"}</p>
            <h3 className="mt-2 text-xl font-extrabold">Finfinnee <span className="text-halo-gold">-&gt;</span> Hawassa</h3>
          </div>
          <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-[10px] font-bold text-emerald-300">IN TRANSIT</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
          <RouteMetric icon="clock" label="ETA" value="4:30 PM" />
          <RouteMetric icon="map" label="Hafe" value="128 km" />
          <RouteMetric icon="wallet" label="Gatii" value="ETB 45K" />
        </div>
      </div>
      <div className="flex items-center justify-between bg-white/8 px-5 py-3 text-xs">
        <span className="text-white/60">Fuso · 10 Ton · ABC-12345</span>
        <span className="flex items-center gap-1 font-bold text-halo-gold">Bani <Icon name="chevron" className="h-4 w-4" /></span>
      </div>
    </section>
  );
}

function RouteMetric({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-white/45">
        <Icon name={icon} className="h-3.5 w-3.5" />
        <span className="text-[9px] font-bold uppercase">{label}</span>
      </div>
      <p className="mt-1.5 text-sm font-bold">{value}</p>
    </div>
  );
}

function QuickAction({ icon, label, detail, onClick }: { icon: IconName; label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-[88px] items-center gap-3 rounded-[20px] border border-halo-line bg-white p-3 text-left shadow-halo-card transition active:scale-[0.98]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-halo-soft text-halo-blue transition group-active:bg-halo-blue group-active:text-white">
        <Icon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold text-halo-navy">{label}</span>
        <span className="mt-1 block text-[10px] leading-4 text-halo-muted">{detail}</span>
      </span>
    </button>
  );
}

function DriverHome({ setTab }: { setTab: (tab: Tab) => void }) {
  return (
    <div className="space-y-6 px-4 pb-6 pt-5 sm:px-6">
      <section className="rounded-[28px] bg-gradient-to-br from-halo-blue to-halo-blue-dark p-5 text-white shadow-halo-float">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-white/65">Baga nagaan dhuftan</p>
            <h1 className="mt-1 text-2xl font-black">Akkam jirta, Abdi!</h1>
            <p className="mt-2 text-xs text-white/60">Hojii kee har'aa sirnaan hordofi.</p>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/12">
            <Icon name="truck" />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 p-3">
          <div>
            <p className="text-[10px] uppercase text-white/50">Sadarkaa driver</p>
            <p className="mt-1 text-sm font-bold">Verified Professional</p>
          </div>
          <span className="flex items-center gap-1 rounded-xl bg-halo-gold px-3 py-2 text-xs font-black text-halo-navy">4.8</span>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard icon="briefcase" label="Hojii xumurame" value="24" />
        <MetricCard icon="wallet" label="Har'a argame" value="12.4K" tone="green" />
        <MetricCard icon="clock" label="Sa'a imalaa" value="6.5h" tone="gold" />
      </div>

      <RouteCard role="driver" />

      <section className="space-y-3">
        <SectionTitle eyebrow="Quick actions" title="Hojii saffisaan raawwadhu" />
        <div className="grid grid-cols-2 gap-3">
          <QuickAction icon="briefcase" label="Hojii argadhu" detail="Fe'umsa haaraa ilaali" onClick={() => setTab("jobs")} />
          <QuickAction icon="map" label="Trip hordofi" detail="Kaartaa yeroo dhugaa" onClick={() => setTab("map")} />
          <QuickAction icon="wallet" label="Wallet" detail="Galii fi payout" onClick={() => setTab("wallet")} />
          <QuickAction icon="shield" label="Documents" detail="Compliance ilaali" onClick={() => setTab("profile")} />
        </div>
      </section>
    </div>
  );
}

function useCustomerWorkspace(userId: string | null): CustomerDataState {
  const [data, setData] = useState<CustomerMobileWorkspaceData>(emptyCustomerMobileWorkspaceData);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setData(emptyCustomerMobileWorkspaceData);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const scopedUserId = userId;

    async function load() {
      setLoading(true);
      try {
        const nextData = await loadCustomerMobileWorkspace(scopedUserId);
        if (cancelled) return;
        setData(nextData);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Customer data fe'uun hin danda'amne.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [reloadKey, userId]);

  return {
    data,
    loading,
    error,
    refresh: () => setReloadKey((key) => key + 1),
  };
}

function normalizedStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() || "pending";
}

function readableStatus(status: string) {
  if (status === "in_transit") return "In transit";
  if (status === "accepted") return "Accepted";
  if (status === "assigned") return "Assigned";
  if (status === "delivered") return "Delivered";
  if (status === "cancelled") return "Cancelled";
  if (status === "placed") return "Placed";
  return status.replace(/_/g, " ");
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "Maamila";
}

function formatDistance(value: number | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "Distance pending";
  return `${Math.round(number)} km`;
}

function formatOrderDate(value: string | null | undefined) {
  if (!value) return "Guyyaa hin jiru";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function CustomerDataNotice({ state }: { state: CustomerDataState }) {
  if (state.loading && state.data.orders.length === 0) {
    return (
      <div className="rounded-2xl border border-halo-line bg-white px-4 py-3 text-xs font-bold text-halo-muted shadow-halo-card">
        Customer orders fe'amaa jiru...
      </div>
    );
  }

  if (!state.error) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700" role="alert">
      <span className="min-w-0 flex-1">{state.error}</span>
      <button type="button" onClick={state.refresh} className="shrink-0 rounded-xl bg-white px-3 py-2 font-black text-red-700">
        Retry
      </button>
    </div>
  );
}

function CustomerRoadArt() {
  return (
    <div className="customer-road-art" aria-hidden="true">
      <svg viewBox="0 0 260 150" className="h-full w-full">
        <path d="M-8 137 C48 88 82 84 125 34 C154 2 202 17 272 70" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="34" />
        <path d="M-8 137 C48 88 82 84 125 34 C154 2 202 17 272 70" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="12" />
        <path d="M32 118 C82 81 107 70 139 37 C165 9 201 27 238 61" fill="none" stroke="#f5b400" strokeWidth="3" strokeDasharray="9 10" />
        <g transform="translate(100 71)">
          <rect x="0" y="15" width="64" height="31" rx="6" fill="#0759c7" />
          <rect x="44" y="24" width="31" height="22" rx="4" fill="#063b84" />
          <rect x="9" y="21" width="20" height="10" rx="2" fill="#ffffff" opacity="0.9" />
          <circle cx="15" cy="51" r="7" fill="#10213d" />
          <circle cx="57" cy="51" r="7" fill="#10213d" />
        </g>
        <g transform="translate(182 20)">
          <path d="M20 43s20-18 20-31A20 20 0 0 0 0 12c0 13 20 31 20 31Z" fill="#f5b400" />
          <circle cx="20" cy="13" r="7" fill="white" />
        </g>
      </svg>
    </div>
  );
}

function CustomerMapCanvas({ tracking = false }: { tracking?: boolean }) {
  return (
    <>
      <div className="absolute inset-0 halo-map-grid" />
      <svg viewBox="0 0 420 720" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M-30 138 C70 92 130 148 225 114 S335 78 450 132" stroke="#d6e0da" strokeWidth="18" fill="none" />
        <path d="M-20 354 C74 298 138 392 222 350 S318 300 450 390" stroke="#d6e0da" strokeWidth="15" fill="none" />
        <path d="M40 612 C92 556 88 485 158 425 S242 352 258 272 S320 198 370 108" stroke="#ffffff" strokeWidth="18" fill="none" strokeLinecap="round" />
        <path d="M40 612 C92 556 88 485 158 425 S242 352 258 272 S320 198 370 108" stroke="#0759c7" strokeWidth={tracking ? "7" : "5"} fill="none" strokeLinecap="round" />
        <path d="M72 188 C145 205 188 180 255 214 S345 262 438 234" stroke="#ffffff" strokeWidth="9" fill="none" />
        <path d="M72 188 C145 205 188 180 255 214 S345 262 438 234" stroke="#f1c84b" strokeWidth="3" fill="none" strokeDasharray="10 13" />
        <circle cx="40" cy="612" r="12" fill="#21a56f" stroke="white" strokeWidth="5" />
        <circle cx="370" cy="108" r="12" fill="#f5b400" stroke="white" strokeWidth="5" />
        <text x="72" y="608" className="fill-halo-navy text-[20px] font-black">Adama</text>
        <text x="250" y="105" className="fill-halo-navy text-[20px] font-black">Addis Ababa</text>
        <text x="180" y="300" className="fill-halo-muted text-[13px] font-bold">Mojo</text>
        <text x="88" y="288" className="fill-halo-muted text-[12px] font-bold">A2</text>
        <text x="290" y="205" className="fill-halo-muted text-[12px] font-bold">A1</text>
        {tracking && (
          <g transform="translate(210 366) rotate(-18)" className="customer-map-truck">
            <rect x="-18" y="-12" width="28" height="21" rx="5" fill="#ffffff" stroke="#d7dde8" strokeWidth="2" />
            <rect x="8" y="-8" width="18" height="17" rx="4" fill="#ffffff" stroke="#d7dde8" strokeWidth="2" />
            <path d="M-10-5H4" stroke="#0759c7" strokeWidth="3" strokeLinecap="round" />
            <circle cx="-9" cy="13" r="4" fill="#10213d" />
            <circle cx="16" cy="13" r="4" fill="#10213d" />
          </g>
        )}
      </svg>
    </>
  );
}

function CustomerLocationPanel({ pickup, dropoff }: { pickup: string; dropoff: string }) {
  return (
    <section className="absolute inset-x-3 top-3 z-10 rounded-[22px] border border-white/75 bg-white/95 p-3 shadow-halo-float backdrop-blur-xl">
      <div className="flex items-center gap-3 rounded-2xl px-1 py-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-halo-muted">Pickup place</p>
          <p className="mt-1 truncate text-xs font-black text-halo-navy">{pickup}</p>
        </div>
        <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-halo-line bg-halo-canvas text-halo-navy" aria-label="Add pickup point">
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      <div className="mx-4 border-t border-halo-line" />
      <div className="flex items-center gap-3 rounded-2xl px-1 py-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-halo-gold" />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-halo-muted">Drop-off place</p>
          <p className="mt-1 truncate text-xs font-black text-halo-navy">{dropoff}</p>
        </div>
        <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-halo-line bg-halo-canvas text-halo-navy" aria-label="Add drop-off point">
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function CustomerMapControls() {
  return (
    <>
      <div className="absolute right-3 top-[176px] z-10 grid gap-2">
        <span className="rounded-full bg-white px-3 py-2 text-[10px] font-black text-halo-blue shadow-halo-card">My Location</span>
      </div>
      <div className="absolute right-3 top-[312px] z-10 overflow-hidden rounded-2xl bg-white shadow-halo-card">
        <button type="button" className="grid h-11 w-11 place-items-center text-halo-navy" aria-label="Zoom in">
          <Icon name="plus" className="h-4.5 w-4.5" />
        </button>
        <div className="h-px bg-halo-line" />
        <button type="button" className="grid h-11 w-11 place-items-center text-halo-navy" aria-label="Zoom out">
          <span className="h-0.5 w-4 rounded-full bg-current" />
        </button>
      </div>
    </>
  );
}

function CustomerHome({
  identity,
  state,
  setTab,
}: {
  identity: MobileIdentity;
  state: CustomerDataState;
  setTab: (tab: Tab) => void;
}) {
  const summary = summarizeCustomerMobileData(state.data);
  const currentOrder = state.data.orders.find((order) => customerActiveStatuses.has(normalizedStatus(order.status))) ?? state.data.orders[0] ?? null;
  const pickup = currentOrder?.pickup_address || "Colonel Abdisa Aga Street, Adama";
  const dropoff = currentOrder?.dropoff_address || "Bole Road, Addis Ababa";

  return (
    <div className="relative min-h-[calc(100dvh-137px)] overflow-hidden bg-[#e9f1ec]">
      <CustomerMapCanvas />
      <CustomerLocationPanel pickup={pickup} dropoff={dropoff} />
      <CustomerMapControls />

      <div className="absolute inset-x-3 bottom-3 z-10 rounded-[28px] border border-white/80 bg-white/96 p-4 shadow-[0_-18px_48px_rgba(16,33,61,0.16)] backdrop-blur-xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-halo-line" />
        <CustomerDataNotice state={state} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-halo-muted">Akkam jirta, {firstName(identity.fullName)}!</p>
            <h1 className="mt-1 text-xl font-black text-halo-navy">Start your booking</h1>
            <p className="mt-1 text-xs leading-5 text-halo-muted">Choose truck, cargo and get a quote.</p>
          </div>
          <button type="button" onClick={() => setTab("jobs")} className="min-h-12 shrink-0 rounded-2xl bg-halo-blue px-4 text-xs font-black text-white shadow-halo-button">
            Book Now <span aria-hidden="true">-&gt;</span>
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-halo-line rounded-2xl bg-halo-canvas py-3 text-center">
          <div><p className="text-lg font-black text-halo-navy">{state.loading && !summary.totalOrders ? "..." : summary.totalOrders}</p><p className="mt-1 text-[9px] font-bold text-halo-muted">Orders</p></div>
          <div><p className="text-lg font-black text-halo-navy">{state.loading && !summary.activeOrders ? "..." : summary.activeOrders}</p><p className="mt-1 text-[9px] font-bold text-halo-muted">Active</p></div>
          <div><p className="text-lg font-black text-halo-navy">{state.loading && !summary.remainingEtb ? "..." : formatShortEtb(summary.remainingEtb).replace("ETB ", "")}</p><p className="mt-1 text-[9px] font-bold text-halo-muted">Due</p></div>
        </div>
        {currentOrder && (
          <button type="button" onClick={() => setTab("map")} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-halo-soft px-4 py-3 text-left">
            <span className="min-w-0">
              <span className="block text-[10px] font-black uppercase text-halo-blue">Live trip ready</span>
              <span className="mt-1 block truncate text-xs font-black text-halo-navy">{currentOrder.tracking_id ?? orderRouteLabel(currentOrder)}</span>
            </span>
            <Icon name="chevron" className="h-4 w-4 shrink-0 text-halo-blue" />
          </button>
        )}
      </div>
    </div>
  );
}

function CustomerTile({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-[18px] border border-halo-line bg-white p-2 text-center shadow-halo-card active:scale-[0.98]">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-halo-soft text-halo-blue">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="text-[10px] font-black text-halo-navy">{label}</span>
    </button>
  );
}

function CustomerCurrentTripCard({
  order,
  data,
  setTab,
}: {
  order: CustomerMobileOrder | null;
  data: CustomerMobileWorkspaceData;
  setTab: (tab: Tab) => void;
}) {
  if (!order) {
    return (
      <section className="rounded-[24px] border border-dashed border-halo-line bg-white p-5 text-center shadow-halo-card">
        <Icon name="box" className="mx-auto h-9 w-9 text-halo-blue" />
        <h2 className="mt-3 text-lg font-black text-halo-navy">Geejjibni kee amma hin jiru</h2>
        <p className="mt-2 text-xs leading-5 text-halo-muted">Ajaja haaraa uumuu jalqabuuf booking workspace bani.</p>
        <button type="button" onClick={() => setTab("jobs")} className="mt-4 min-h-11 rounded-2xl bg-halo-blue px-5 text-sm font-black text-white">
          Booking bani
        </button>
      </section>
    );
  }

  const assignment = findCustomerAssignment(data, order.id);
  const live = customerTrackableStatuses.has(normalizedStatus(order.status));

  return (
    <section className="overflow-hidden rounded-[24px] border border-halo-line bg-white shadow-halo-card">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-halo-muted">Geejjiba keeka jira</p>
          <h2 className="mt-1 truncate text-lg font-black text-halo-navy">{orderRouteLabel(order)}</h2>
          <p className="mt-1 text-xs text-halo-muted">{order.tracking_id ?? "Tracking ID pending"} · {formatDistance(order.distance_km)}</p>
        </div>
        <StatusPill status={order.status} />
      </div>
      <div className="grid grid-cols-3 border-y border-halo-line bg-halo-canvas px-2 py-3 text-center">
        <div><p className="text-[10px] font-bold text-halo-muted">Driver</p><p className="mt-1 truncate text-xs font-black text-halo-navy">{assignment?.driver_name ?? "Pending"}</p></div>
        <div><p className="text-[10px] font-bold text-halo-muted">Truck</p><p className="mt-1 truncate text-xs font-black text-halo-navy">{assignment?.vehicle_type ?? order.vehicle_type ?? "Pending"}</p></div>
        <div><p className="text-[10px] font-bold text-halo-muted">Kaffaltii</p><p className="mt-1 truncate text-xs font-black text-halo-navy">{formatShortEtb(order.price_etb)}</p></div>
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <p className="text-xs leading-5 text-halo-muted">{live ? "Live tracking qophaa'eera; driver fi route haala amma agarsiisa." : "Dispatch assignment mirkaneessaa jira."}</p>
        <button type="button" onClick={() => setTab(live ? "map" : "jobs")} className="shrink-0 rounded-2xl bg-halo-soft px-4 py-3 text-xs font-black text-halo-blue">
          {live ? "Hordofi" : "Ilaali"}
        </button>
      </div>
    </section>
  );
}

function CustomerHowItWorks() {
  const steps = [
    ["1", "Fe'umsa Galcha", "box" as IconName],
    ["2", "Konkolaataa", "truck" as IconName],
    ["3", "Geejjiba Eegala", "pin" as IconName],
    ["4", "Hordofaa", "map" as IconName],
    ["5", "Kaffaltii", "wallet" as IconName],
  ];

  return (
    <section className="space-y-3">
      <SectionTitle eyebrow="Akkamitti hojjetaa?" title="Tartiiba salphaa" />
      <div className="grid grid-cols-5 gap-2 rounded-[22px] bg-white p-3 shadow-halo-card">
        {steps.map(([step, label, icon]) => (
          <div key={step} className="text-center">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-halo-soft text-halo-blue">
              <Icon name={icon as IconName} className="h-5 w-5" />
            </span>
            <p className="mt-2 text-[9px] font-black text-halo-navy">{step}. {label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function JobsView({
  role,
  identity,
  customerState,
}: {
  role: Role;
  identity: MobileIdentity;
  customerState: CustomerDataState;
}) {
  if (role === "customer") return <CustomerShipmentsView state={customerState} />;
  return <DriverJobsBoard userId={identity.userId} fullName={identity.fullName} />;
}

type CustomerFilter = "all" | "active" | "payment" | "delivered";

function CustomerShipmentsView({ state }: { state: CustomerDataState }) {
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const orders = useMemo(() => {
    return state.data.orders.filter((order) => {
      const status = normalizedStatus(order.status);
      const matchesFilter =
        filter === "all"
        || (filter === "active" && customerActiveStatuses.has(status))
        || (filter === "delivered" && status === "delivered")
        || (filter === "payment" && normalizedStatus(order.payment_status) !== "paid");
      const matchesQuery = !normalizedQuery || orderRouteLabel(order).toLowerCase().includes(normalizedQuery) || (order.tracking_id ?? "").toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, normalizedQuery, state.data.orders]);

  return (
    <div className="space-y-5 px-4 pb-7 pt-5 sm:px-6">
      <div>
        <p className="text-[10px] font-black uppercase text-emerald-600">02 · Book your trip</p>
        <h1 className="mt-1 text-2xl font-black text-halo-navy">Choose truck & cargo</h1>
        <p className="mt-2 text-xs leading-5 text-halo-muted">Select the best option for your delivery, then review your active orders.</p>
      </div>

      <CustomerDataNotice state={state} />

      <CustomerBookingPreview />

      <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-halo-line bg-white px-4 shadow-halo-card">
        <Icon name="search" className="h-4.5 w-4.5 shrink-0 text-halo-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Bakka ykn tracking ID barbaadi"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-halo-navy outline-none placeholder:text-halo-muted"
        />
      </label>

      <div className="grid grid-cols-4 gap-2 rounded-2xl bg-white p-1.5 shadow-halo-card" role="tablist" aria-label="Customer order filters">
        {[
          ["all", "Hundaa"],
          ["active", "Hojii"],
          ["payment", "Kaffaltii"],
          ["delivered", "Geessame"],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value as CustomerFilter)} className={`min-h-10 rounded-xl px-2 text-[10px] font-black ${filter === value ? "bg-halo-blue text-white" : "text-halo-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      <section className="space-y-3">
        <SectionTitle eyebrow="Galmee" title="Fe'umsa dhihoo" action={<button type="button" onClick={state.refresh} className="text-xs font-black text-halo-blue">Refresh</button>} />
        {orders.length > 0 ? (
          orders.map((order) => <CustomerShipmentCard key={order.id} order={order} data={state.data} />)
        ) : (
          <CustomerEmptyOrders loading={state.loading} />
        )}
      </section>
    </div>
  );
}

function CustomerBookingPreview() {
  const steps = [
    ["Route", true],
    ["Truck", true],
    ["Cargo", false],
    ["Load", false],
    ["Quote", false],
  ] as const;

  return (
    <section className="space-y-4 rounded-[26px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase text-emerald-600">Route selected</p>
          <h2 className="mt-1 text-lg font-black text-halo-navy">Choose truck type</h2>
          <p className="mt-1 text-xs leading-5 text-halo-muted">Finfinnee to Adama route, customer quote preview.</p>
        </div>
        <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-halo-line text-halo-muted" aria-label="Collapse booking options">
          <Icon name="chevron" className="h-4 w-4 rotate-90" />
        </button>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Booking steps">
        {steps.map(([label, complete], index) => (
          <CustomerStepPill key={label} label={label} complete={complete} active={index === 1} />
        ))}
      </div>

      <div>
        <p className="mb-3 text-xs font-black text-halo-navy">Choose truck type</p>
        <div className="grid grid-cols-2 gap-3">
          {customerTruckOptions.map((option) => (
            <CustomerTruckOptionCard key={option.key} option={option} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CustomerSelectPreview icon="box" label="Cargo category" value="General goods" tone="blue" />
        <CustomerSelectPreview icon="briefcase" label="Packaging / load type" value="Loose / bulk" tone="gold" />
      </div>

      <button type="button" className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-halo-line bg-white px-4 text-left">
        <span className="truncate text-xs font-bold text-halo-muted">Additional cargo details (optional)</span>
        <Icon name="chevron" className="h-4 w-4 rotate-90 text-halo-muted" />
      </button>

      <div className="flex items-center justify-between gap-3 rounded-[22px] border border-halo-line bg-white p-3 shadow-halo-card">
        <div>
          <p className="text-[10px] font-black uppercase text-halo-muted">Estimated quote</p>
          <p className="mt-1 text-[10px] font-bold text-halo-muted">From</p>
          <p className="text-lg font-black text-halo-blue">ETB 28,500</p>
        </div>
        <button type="button" className="min-h-12 rounded-2xl bg-halo-blue px-6 text-sm font-black text-white shadow-halo-button">
          Continue <span aria-hidden="true">-&gt;</span>
        </button>
      </div>
    </section>
  );
}

function CustomerStepPill({ label, complete, active }: { label: string; complete: boolean; active: boolean }) {
  return (
    <span className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-2xl border px-3 text-[11px] font-black ${active ? "border-halo-blue bg-halo-soft text-halo-blue" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-halo-line bg-halo-canvas text-halo-muted"}`}>
      {complete ? <Icon name="check" className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />}
      {label}
    </span>
  );
}

function CustomerTruckOptionCard({ option }: { option: (typeof customerTruckOptions)[number] }) {
  const selected = Boolean("selected" in option && option.selected);
  return (
    <button type="button" className={`relative overflow-hidden rounded-2xl border bg-white text-left shadow-halo-card transition active:scale-[0.98] ${selected ? "border-halo-blue ring-1 ring-halo-blue" : "border-halo-line"}`}>
      <div className="customer-truck-photo flex h-24 items-center justify-center bg-[#f7f4ef]">
        <img src={option.image} alt={option.alt} className="h-full w-full object-contain p-2" loading="lazy" />
      </div>
      <div className="p-3">
        <p className="text-sm font-black text-halo-navy">{option.label}</p>
        <p className="mt-1 text-xs font-semibold text-halo-muted">{option.capacity}</p>
      </div>
      {selected && (
        <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-halo-blue text-white">
          <Icon name="check" className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

function CustomerSelectPreview({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone: "blue" | "gold" }) {
  const iconTone = tone === "gold" ? "bg-halo-gold-soft text-halo-gold-dark" : "bg-halo-soft text-halo-blue";
  return (
    <button type="button" className="min-w-0 rounded-2xl border border-halo-line bg-white p-3 text-left shadow-halo-card">
      <p className="truncate text-[9px] font-black uppercase text-halo-muted">{label}</p>
      <span className="mt-2 flex items-center gap-2">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconTone}`}>
          <Icon name={icon} className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-black text-halo-navy">{value}</span>
        <Icon name="chevron" className="h-4 w-4 rotate-90 text-halo-muted" />
      </span>
    </button>
  );
}

function PreviewField({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div className="rounded-2xl border border-halo-line bg-halo-canvas p-3">
      <div className="flex items-center gap-2 text-halo-muted">
        <Icon name={icon} className="h-4 w-4" />
        <span className="text-[10px] font-black uppercase">{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-black text-halo-navy">{value}</p>
    </div>
  );
}

function CustomerShipmentCard({ order, data }: { order: CustomerMobileOrder; data: CustomerMobileWorkspaceData }) {
  const assignment = findCustomerAssignment(data, order.id);
  return (
    <article className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-black text-halo-navy">{order.pickup_address || "Pickup pending"} <span className="text-halo-gold">-&gt;</span> {order.dropoff_address || "Drop-off pending"}</h2>
          <p className="mt-1 text-xs text-halo-muted">{order.tracking_id ?? "Tracking pending"} · {formatOrderDate(order.created_at)}</p>
        </div>
        <p className="shrink-0 text-sm font-black text-halo-blue">{formatShortEtb(order.price_etb)}</p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <SmallFact label="Truck" value={assignment?.vehicle_type ?? order.vehicle_type ?? "Pending"} />
        <SmallFact label="Distance" value={formatDistance(order.distance_km)} />
        <SmallFact label="Payment" value={readableStatus(normalizedStatus(order.payment_status))} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-halo-line pt-3">
        <StatusPill status={order.status} />
        <p className="truncate text-xs font-semibold text-halo-muted">{assignment?.driver_name ? `Driver: ${assignment.driver_name}` : "Driver assignment pending"}</p>
      </div>
    </article>
  );
}

function SmallFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-halo-canvas p-3">
      <p className="text-[9px] font-black uppercase text-halo-muted">{label}</p>
      <p className="mt-1 truncate text-[11px] font-black text-halo-navy">{value}</p>
    </div>
  );
}

function CustomerEmptyOrders({ loading }: { loading: boolean }) {
  return (
    <div className="rounded-[22px] border border-dashed border-halo-line bg-white p-5 text-center shadow-halo-card">
      <Icon name={loading ? "clock" : "box"} className="mx-auto h-8 w-8 text-halo-blue" />
      <h2 className="mt-3 text-base font-black text-halo-navy">{loading ? "Ajajoota fe'amaa jiru" : "Ajajni filter kana keessatti hin jiru"}</h2>
      <p className="mt-2 text-xs leading-5 text-halo-muted">Customer order data database irraa yoo argame asitti mul'ata.</p>
    </div>
  );
}

function customerVehicleImageFor(vehicleType: string | null | undefined) {
  const value = vehicleType?.toLowerCase() ?? "";
  if (value.includes("pickup")) return customerVehicleImages.pickup;
  if (value.includes("van")) return customerVehicleImages.van;
  if (value.includes("isuzu") || value.includes("5")) return customerVehicleImages.isuzu;
  return customerVehicleImages.dryCargo;
}

function CustomerTrackingTimeline({ pickup, dropoff }: { pickup: string; dropoff: string }) {
  return (
    <div className="rounded-[22px] bg-white p-4 shadow-halo-card">
      <div className="grid grid-cols-[18px_1fr_auto] gap-x-3 gap-y-1">
        <span className="mt-1 h-3.5 w-3.5 rounded-full border-4 border-emerald-100 bg-emerald-600" />
        <div className="min-w-0">
          <p className="text-xs font-black text-halo-navy">Pickup</p>
          <p className="mt-1 truncate text-xs text-halo-muted">{pickup}</p>
        </div>
        <p className="text-[10px] font-black text-emerald-700">Completed 9:10 AM</p>
        <span className="ml-[6px] h-8 w-px bg-halo-line" />
        <span />
        <span />
        <span className="mt-1 h-3.5 w-3.5 rounded-full border-4 border-halo-gold-soft bg-halo-gold" />
        <div className="min-w-0">
          <p className="text-xs font-black text-halo-navy">Drop-off</p>
          <p className="mt-1 truncate text-xs text-halo-muted">{dropoff}</p>
        </div>
        <p className="text-[10px] font-black text-halo-blue">ETA 10:45 AM</p>
      </div>
    </div>
  );
}

function CustomerLiveMapView({ state, setTab }: { state: CustomerDataState; setTab: (tab: Tab) => void }) {
  const order = state.data.orders.find((item) => customerTrackableStatuses.has(normalizedStatus(item.status))) ?? null;
  const assignment = findCustomerAssignment(state.data, order?.id);
  const pickup = order?.pickup_address || "Colonel Abdisa Aga Street, Adama";
  const dropoff = order?.dropoff_address || "Bole Road, Addis Ababa";
  const vehicleType = assignment?.vehicle_type ?? order?.vehicle_type ?? "Isuzu 5 Ton";
  const vehicleImage = customerVehicleImageFor(vehicleType);
  const driverName = assignment?.driver_name ?? "Abdi D.";
  const plate = assignment?.plate_number ?? "AB 12345";
  const trackingId = order?.tracking_id ?? "HALO-7852";

  return (
    <div className="relative min-h-[calc(100dvh-137px)] overflow-hidden bg-[#e9f1ec]">
      <CustomerMapCanvas tracking />

      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setTab("home")} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-halo-navy shadow-halo-card" aria-label="Back to customer home">
          <Icon name="arrow" className="h-5 w-5 rotate-180" />
        </button>
        <div className="flex min-h-12 items-center gap-2 rounded-full bg-white px-4 text-sm font-black text-halo-navy shadow-halo-card">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Trip in progress
        </div>
        <button type="button" className="min-h-12 shrink-0 rounded-full bg-white px-4 text-xs font-black text-halo-navy shadow-halo-card">
          Help
        </button>
      </div>

      <div className="absolute inset-x-3 top-20 z-20">
        <CustomerDataNotice state={state} />
      </div>

      <div className="absolute right-3 top-[220px] z-10 grid gap-2">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-halo-navy shadow-halo-card"><Icon name="pin" className="h-5 w-5" /></span>
        <div className="overflow-hidden rounded-2xl bg-white shadow-halo-card">
          <button type="button" className="grid h-10 w-10 place-items-center text-halo-navy" aria-label="Zoom in">
            <Icon name="plus" className="h-4 w-4" />
          </button>
          <div className="h-px bg-halo-line" />
          <button type="button" className="grid h-10 w-10 place-items-center text-halo-navy" aria-label="Zoom out">
            <span className="h-0.5 w-4 rounded-full bg-current" />
          </button>
        </div>
      </div>

      <section className="absolute inset-x-3 bottom-3 z-10 space-y-3">
        <div className="rounded-[24px] border border-white/80 bg-white/96 p-4 shadow-halo-float backdrop-blur-xl">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-halo-line" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase text-halo-muted">ETA</p>
              <p className="mt-1 text-3xl font-black text-halo-blue">10:45 AM</p>
              <p className="mt-1 text-xs font-semibold text-halo-muted">1 h 15 min · {formatDistance(order?.distance_km) === "Distance pending" ? "82 km to go" : `${formatDistance(order?.distance_km)} to go`}</p>
              <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">On time</span>
            </div>
            <img src={vehicleImage} alt={`${vehicleType} assigned to customer order`} className="h-24 w-36 object-contain" />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-[22px] bg-white p-3 shadow-halo-card">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-halo-gold-soft to-halo-soft text-base font-black text-halo-blue">
            {driverName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-halo-navy">{driverName}</p>
            <p className="mt-0.5 text-[10px] font-black text-halo-gold-dark">4.9 rating</p>
            <p className="mt-0.5 truncate text-[10px] text-halo-muted">{vehicleType} · {plate}</p>
          </div>
          {assignment?.driver_phone ? (
            <a href={`tel:${assignment.driver_phone}`} className="grid h-11 w-11 place-items-center rounded-2xl bg-halo-soft text-halo-blue" aria-label="Call driver">
              <Icon name="phone" className="h-4.5 w-4.5" />
            </a>
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-halo-soft text-halo-blue" aria-hidden="true">
              <Icon name="phone" className="h-4.5 w-4.5" />
            </span>
          )}
          <button type="button" className="grid h-11 w-11 place-items-center rounded-2xl bg-halo-soft text-halo-blue" aria-label="Chat with driver">
            <Icon name="message" className="h-4.5 w-4.5" />
          </button>
        </div>

        <CustomerTrackingTimeline pickup={pickup} dropoff={dropoff} />

        <div className="flex items-center justify-between rounded-[18px] bg-white px-4 py-3 text-xs font-black text-halo-muted shadow-halo-card">
          <span>Order #{trackingId}</span>
          <button type="button" className="flex items-center gap-1 text-halo-blue">View details <Icon name="chevron" className="h-4 w-4" /></button>
        </div>
      </section>
    </div>
  );
}

function LiveMapView({
  role,
  identity,
  customerState,
  setTab,
}: {
  role: Role;
  identity: MobileIdentity;
  customerState: CustomerDataState;
  setTab: (tab: Tab) => void;
}) {
  if (role === "driver") return <DriverActiveTripView userId={identity.userId} fullName={identity.fullName} />;
  return <CustomerLiveMapView state={customerState} setTab={setTab} />;
}

function CustomerPaymentsView({ state }: { state: CustomerDataState }) {
  const summary = summarizeCustomerMobileData(state.data);
  const recentPayments = state.data.payments.slice(0, 6);

  return (
    <div className="space-y-5 px-4 pb-7 pt-5 sm:px-6">
      <div>
        <p className="text-[10px] font-black uppercase text-halo-gold-dark">Kaasa</p>
        <h1 className="mt-1 text-2xl font-black text-halo-navy">Kaffaltii fi seenaa</h1>
      </div>

      <CustomerDataNotice state={state} />

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-halo-blue to-halo-blue-dark p-5 text-white shadow-halo-float">
        <div className="relative">
          <p className="text-xs text-white/65">Kaffaltii galmaa'e</p>
          <p className="mt-2 text-3xl font-black">{state.loading && !summary.confirmedPaidEtb ? "..." : formatEtb(summary.confirmedPaidEtb)}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-white/55">Pending</p><p className="mt-1 font-black">{formatShortEtb(summary.pendingVerificationEtb)}</p></div>
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-white/55">Remaining</p><p className="mt-1 font-black">{formatShortEtb(summary.remainingEtb)}</p></div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-2">
        {[
          ["Galcha", "plus" as IconName],
          ["Ergaa", "receipt" as IconName],
          ["Baafachuu", "wallet" as IconName],
          ["Galmee", "briefcase" as IconName],
        ].map(([label, icon]) => (
          <div key={label} className="rounded-[18px] bg-white p-3 text-center shadow-halo-card">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-halo-soft text-halo-blue">
              <Icon name={icon as IconName} className="h-5 w-5" />
            </span>
            <p className="mt-2 text-[9px] font-black text-halo-navy">{label}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <SectionTitle eyebrow="Galmee dameewwan" title="Sochii kaffaltii" />
        {recentPayments.length > 0 ? (
          recentPayments.map((payment) => <CustomerPaymentRow key={payment.id} payment={payment} />)
        ) : (
          <div className="rounded-[22px] border border-dashed border-halo-line bg-white p-5 text-center shadow-halo-card">
            <Icon name="wallet" className="mx-auto h-8 w-8 text-halo-blue" />
            <h2 className="mt-3 text-base font-black text-halo-navy">Kaffaltiin amma hin jiru</h2>
            <p className="mt-2 text-xs leading-5 text-halo-muted">Payment proof ykn receipt yeroo customer account irratti argamu asitti mul'ata.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function CustomerPaymentRow({ payment }: { payment: CustomerMobilePayment }) {
  const event = normalizedStatus(payment.event);
  const pending = event.includes("pending") || event.includes("submitted");
  const rejected = event.includes("reject");
  const tone = rejected ? "text-red-600" : pending ? "text-halo-gold-dark" : "text-emerald-700";
  const sign = rejected ? "-" : "+";

  return (
    <article className="flex items-center gap-3 rounded-[20px] border border-halo-line bg-white p-3.5 shadow-halo-card">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-halo-soft text-halo-blue">
        <Icon name="receipt" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-halo-navy">{payment.provider ?? "Payment"}</p>
        <p className="mt-1 truncate text-[10px] text-halo-muted">{payment.provider_ref ?? payment.id} · {readableStatus(event)}</p>
      </div>
      <p className={`text-xs font-black ${tone}`}>{sign} {formatEtb(payment.amount_etb)}</p>
    </article>
  );
}

function CustomerProfileView({
  identity,
  state,
}: {
  identity: MobileIdentity;
  state: CustomerDataState;
}) {
  const summary = summarizeCustomerMobileData(state.data);
  return (
    <div className="space-y-5 px-4 pb-7 pt-5 sm:px-6">
      <section className="flex items-center gap-4 rounded-[26px] border border-halo-line bg-white p-4 shadow-halo-card">
        <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-halo-blue text-white">
          <Icon name="user" className="h-8 w-8" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black text-halo-navy">{identity.fullName}</h1>
          <p className="mt-1 text-xs text-halo-muted">Customer account · Verified role</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">
            <Icon name="check" className="h-3 w-3" /> ACTIVE
          </span>
        </div>
      </section>

      <CustomerDataNotice state={state} />

      <section className="grid grid-cols-3 gap-3">
        <MetricCard icon="briefcase" label="Orders" value={String(summary.totalOrders)} />
        <MetricCard icon="map" label="Active" value={String(summary.activeOrders)} tone="green" />
        <MetricCard icon="check" label="Delivered" value={String(summary.deliveredOrders)} tone="gold" />
      </section>

      <section className="overflow-hidden rounded-[24px] border border-halo-line bg-white shadow-halo-card">
        {[
          ["Account details", "shield" as IconName, "Database profile irraa mirkanaa'e"],
          ["Saved locations", "pin" as IconName, "Pickup fi drop-off filannoo"],
          ["Language · Afaan Oromoo", "message" as IconName, "Oromoo-first mobile copy"],
          ["Support & help", "phone" as IconName, "HALO operations waliin haasa'i"],
        ].map(([label, icon, detail], index) => (
          <div key={label} className={`flex min-h-16 w-full items-center gap-3 px-4 text-left ${index ? "border-t border-halo-line" : ""}`}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-halo-soft text-halo-blue">
              <Icon name={icon as IconName} className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-halo-navy">{label}</span>
              <span className="mt-0.5 block truncate text-[10px] text-halo-muted">{detail}</span>
            </span>
            <Icon name="chevron" className="h-4 w-4 text-halo-muted" />
          </div>
        ))}
      </section>

      <div className="rounded-2xl bg-halo-gold-soft p-4 text-xs leading-5 text-halo-gold-dark">
        Customer mobile app qofa. Admin, CEO, Finance, Partner fi root web theme hin jijjiiramne.
      </div>
    </div>
  );
}

function BottomNav({ role, tab, setTab }: { role: Role; tab: Tab; setTab: (tab: Tab) => void }) {
  const items: { tab: Tab; icon: IconName; label: string }[] = [
    { tab: "home", icon: "home", label: "Mana" },
    { tab: "jobs", icon: role === "driver" ? "briefcase" : "plus", label: role === "driver" ? "Hojii" : "Fe'umsa" },
    { tab: "map", icon: "map", label: "Geejjiba" },
    { tab: "wallet", icon: "wallet", label: "Kaasa" },
    { tab: "profile", icon: "user", label: "Profile" },
  ];
  return (
    <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-halo-line bg-white/96 px-1 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl" aria-label={`${role} navigation`}>
      {items.map((item) => (
        <button key={item.tab} type="button" onClick={() => setTab(item.tab)} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-bold transition ${tab === item.tab ? "text-halo-blue" : "text-halo-muted"}`}>
          <span className={`grid h-8 w-10 place-items-center rounded-xl ${tab === item.tab ? "bg-halo-soft" : ""}`}>
            <Icon name={item.icon} className="h-5 w-5" />
          </span>
          {item.label}
          {tab === item.tab && <span className="absolute bottom-0 h-1 w-5 rounded-full bg-halo-gold" />}
        </button>
      ))}
    </nav>
  );
}

function MobileWorkspace({
  identity,
  onSignOut,
  signingOut,
}: {
  identity: MobileIdentity;
  onSignOut: () => Promise<void>;
  signingOut: boolean;
}) {
  const role: Role = identity.role;
  const [tab, setTab] = useState<Tab>("home");
  const customerState = useCustomerWorkspace(role === "customer" ? identity.userId : null);
  const content = useMemo(() => {
    if (tab === "home") return role === "driver" ? <DriverHome setTab={setTab} /> : <CustomerHome identity={identity} state={customerState} setTab={setTab} />;
    if (tab === "jobs") return <JobsView role={role} identity={identity} customerState={customerState} />;
    if (tab === "map") return <LiveMapView role={role} identity={identity} customerState={customerState} setTab={setTab} />;
    if (tab === "wallet") return role === "driver" ? <DriverWalletView userId={identity.userId} /> : <CustomerPaymentsView state={customerState} />;
    return role === "driver" ? <DriverProfileView userId={identity.userId} fallbackName={identity.fullName} /> : <CustomerProfileView identity={identity} state={customerState} />;
  }, [customerState, identity, role, tab]);

  useEffect(() => {
    setTab("home");
  }, [role]);

  return (
    <div className="halo-mobile-app min-h-screen bg-halo-canvas text-halo-navy">
      <div className="mx-auto min-h-screen w-full max-w-[520px] bg-halo-canvas shadow-[0_0_70px_rgba(16,33,61,0.10)]">
        <header className="sticky top-0 z-40 flex min-h-[72px] items-center justify-between gap-3 border-b border-halo-line bg-white/95 px-4 backdrop-blur-xl sm:px-6">
          <HaloLogo />
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden max-w-28 truncate rounded-xl bg-halo-soft px-3 py-2 text-[10px] font-black uppercase text-halo-blue sm:block">{identity.fullName}</span>
            <button type="button" onClick={() => void onSignOut()} disabled={signingOut} aria-label={`Sign out ${identity.fullName}`} className="min-h-10 shrink-0 rounded-xl border border-halo-line px-3 text-xs font-black text-halo-navy disabled:opacity-60">{signingOut ? "..." : "Ba'i"}</button>
            <button type="button" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-halo-soft text-halo-blue" aria-label="Notifications">
              <Icon name="bell" className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-halo-soft bg-red-500" />
            </button>
          </div>
        </header>
        <main>{content}</main>
        <BottomNav role={role} tab={tab} setTab={setTab} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MobileAuthBoundary>
      {({ identity, signOut, signingOut }) => (
        <MobileWorkspace
          key={`${identity.userId}:${identity.role}`}
          identity={identity}
          onSignOut={signOut}
          signingOut={signingOut}
        />
      )}
    </MobileAuthBoundary>
  );
}

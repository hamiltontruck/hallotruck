import { ReactNode, useEffect, useMemo, useState } from "react";
import { MobileAuthBoundary, type MobileIdentity } from "./auth/MobileAuthBoundary";

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
  | "box";

const iconPaths: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
  briefcase: <><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>,
  map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
  wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v14H6.5A2.5 2.5 0 0 1 4 16.5Z"/><path d="M4 7h15M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  truck: <><path d="M3 5h11v11H3Z"/><path d="M14 9h4l3 3v4h-7Z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
  shield: <><path d="M12 3 5 6v5c0 4.8 3 8 7 10 4-2 7-5.2 7-10V6Z"/><path d="m9 12 2 2 4-4"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  phone: <><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-2-2 2c-3.7-1.6-6.4-4.3-8-8l2-2Z"/></>,
  message: <><path d="M4 5h16v11H8l-4 4Z"/><path d="M8 9h8M8 12h5"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  box: <><path d="m4 7 8-4 8 4-8 4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
};

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{iconPaths[name]}</svg>;
}

function HaloLogo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2" aria-label="HALO Smart Logistics">
    <div className="relative font-black tracking-[-0.08em] text-halo-blue" style={{ fontSize: compact ? 22 : 29 }}>
      HAL<span className="relative ml-0.5 inline-flex h-[0.95em] w-[0.78em] translate-y-[0.12em] items-center justify-center rounded-[55%_55%_60%_60%] bg-halo-gold text-transparent after:absolute after:bottom-[-0.18em] after:left-1/2 after:h-[0.38em] after:w-[0.38em] after:-translate-x-1/2 after:rotate-45 after:bg-halo-gold after:content-['']"><span className="relative z-10 h-[0.34em] w-[0.34em] rounded-full bg-white" /></span>
    </div>
    {!compact && <div className="border-l border-halo-line pl-2"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-halo-navy">Smart</p><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-halo-muted">Logistics</p></div>}
  </div>;
}


function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) {
  return <div className="flex items-end justify-between gap-3">
    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">{eyebrow}</p><h2 className="mt-1 text-xl font-extrabold tracking-tight text-halo-navy">{title}</h2></div>
    {action && <button type="button" className="text-xs font-bold text-halo-blue">{action}</button>}
  </div>;
}

function MetricCard({ label, value, icon, tone = "blue" }: { label: string; value: string; icon: IconName; tone?: "blue" | "gold" | "green" }) {
  const toneClass = tone === "gold" ? "bg-halo-gold-soft text-halo-gold-dark" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-halo-soft text-halo-blue";
  return <div className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card">
    <span className={`grid h-9 w-9 place-items-center rounded-xl ${toneClass}`}><Icon name={icon} className="h-4.5 w-4.5" /></span>
    <p className="mt-4 text-lg font-black tracking-tight text-halo-navy">{value}</p>
    <p className="mt-1 text-[11px] font-medium text-halo-muted">{label}</p>
  </div>;
}

function RouteCard({ role }: { role: Role }) {
  return <section className="overflow-hidden rounded-[26px] bg-halo-navy text-white shadow-halo-float">
    <div className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">{role === "driver" ? "Trip hojii amma" : "Ajaja amma"}</p><h3 className="mt-2 text-xl font-extrabold">Finfinnee <span className="text-halo-gold">→</span> Hawassa</h3></div>
        <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-[10px] font-bold text-emerald-300">IN TRANSIT</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
        <RouteMetric icon="clock" label="ETA" value="4:30 PM" />
        <RouteMetric icon="map" label="Hafe" value="128 km" />
        <RouteMetric icon="wallet" label="Gatii" value="ETB 45K" />
      </div>
    </div>
    <div className="flex items-center justify-between bg-white/8 px-5 py-3 text-xs"><span className="text-white/60">Fuso · 10 Ton · ABC-12345</span><button type="button" className="flex items-center gap-1 font-bold text-halo-gold">Bani <Icon name="chevron" className="h-4 w-4" /></button></div>
  </section>;
}

function RouteMetric({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return <div><div className="flex items-center gap-1.5 text-white/45"><Icon name={icon} className="h-3.5 w-3.5" /><span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div><p className="mt-1.5 text-sm font-bold">{value}</p></div>;
}

function QuickAction({ icon, label, detail, onClick }: { icon: IconName; label: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex min-h-[88px] items-center gap-3 rounded-[20px] border border-halo-line bg-white p-3 text-left shadow-halo-card transition active:scale-[0.98]">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-halo-soft text-halo-blue transition group-active:bg-halo-blue group-active:text-white"><Icon name={icon} /></span>
    <span className="min-w-0"><span className="block text-sm font-extrabold text-halo-navy">{label}</span><span className="mt-1 block text-[10px] leading-4 text-halo-muted">{detail}</span></span>
  </button>;
}

function DriverHome({ setTab }: { setTab: (tab: Tab) => void }) {
  return <div className="space-y-6 px-4 pb-6 pt-5 sm:px-6">
    <section className="rounded-[28px] bg-gradient-to-br from-halo-blue to-halo-blue-dark p-5 text-white shadow-halo-float">
      <div className="flex items-start justify-between"><div><p className="text-xs font-medium text-white/65">Baga nagaan dhuftan</p><h1 className="mt-1 text-2xl font-black">Akkam jirta, Abdi!</h1><p className="mt-2 text-xs text-white/60">Hojii kee har'aa sirnaan hordofi.</p></div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/12"><Icon name="truck" /></div></div>
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 p-3"><div><p className="text-[10px] uppercase tracking-widest text-white/50">Sadarkaa driver</p><p className="mt-1 text-sm font-bold">Verified Professional</p></div><span className="flex items-center gap-1 rounded-xl bg-halo-gold px-3 py-2 text-xs font-black text-halo-navy">4.8 ★</span></div>
    </section>

    <div className="grid grid-cols-3 gap-3"><MetricCard icon="briefcase" label="Hojii xumurame" value="24" /><MetricCard icon="wallet" label="Har'a argame" value="12.4K" tone="green" /><MetricCard icon="clock" label="Sa'a imalaa" value="6.5h" tone="gold" /></div>

    <RouteCard role="driver" />

    <section className="space-y-3"><SectionTitle eyebrow="Quick actions" title="Hojii saffisaan raawwadhu" /><div className="grid grid-cols-2 gap-3"><QuickAction icon="briefcase" label="Hojii argadhu" detail="Fe'umsa haaraa ilaali" onClick={() => setTab("jobs")} /><QuickAction icon="map" label="Trip hordofi" detail="Kaartaa yeroo dhugaa" onClick={() => setTab("map")} /><QuickAction icon="wallet" label="Wallet" detail="Galii fi payout" onClick={() => setTab("wallet")} /><QuickAction icon="shield" label="Documents" detail="Compliance ilaali" onClick={() => setTab("profile")} /></div></section>
  </div>;
}

function CustomerHome({ setTab }: { setTab: (tab: Tab) => void }) {
  return <div className="space-y-6 px-4 pb-6 pt-5 sm:px-6">
    <section className="relative overflow-hidden rounded-[28px] bg-halo-navy p-5 text-white shadow-halo-float">
      <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full border-[28px] border-white/5" />
      <div className="relative"><p className="text-xs font-medium text-white/65">Baga nagaan dhuftan</p><h1 className="mt-1 text-2xl font-black">Geejjiba haaraa karoorsi</h1><p className="mt-2 max-w-[260px] text-xs leading-5 text-white/60">Quote argadhu, driver assign godhi, geejjiba kee yeroo dhugaa hordofi.</p><button type="button" onClick={() => setTab("jobs")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-halo-gold px-4 text-sm font-black text-halo-navy">Ajaja haaraa <Icon name="arrow" className="h-4 w-4" /></button></div>
    </section>

    <div className="grid grid-cols-3 gap-3"><MetricCard icon="truck" label="Active orders" value="2" /><MetricCard icon="check" label="Delivered" value="7" tone="green" /><MetricCard icon="wallet" label="Total paid" value="57K" tone="gold" /></div>

    <RouteCard role="customer" />

    <section className="space-y-3"><SectionTitle eyebrow="Tajaajila" title="Waan barbaaddu hunda" /><div className="grid grid-cols-2 gap-3"><QuickAction icon="plus" label="Shipment uumi" detail="Pickup fi destination" onClick={() => setTab("jobs")} /><QuickAction icon="map" label="Live tracking" detail="Driver kaartaa irratti" onClick={() => setTab("map")} /><QuickAction icon="wallet" label="Payments" detail="Invoice fi receipt" onClick={() => setTab("wallet")} /><QuickAction icon="message" label="Support" detail="HALO waliin haasa'i" onClick={() => setTab("profile")} /></div></section>
  </div>;
}

const jobs = [
  { route: "Finfinnee → Dire Dawa", cargo: "General cargo · 22 Ton", distance: "515 km", price: "ETB 440,000", status: "Haaraa" },
  { route: "Adama → Hawassa", cargo: "Construction · 25 Ton", distance: "275 km", price: "ETB 285,000", status: "Dhihoo" },
  { route: "Finfinnee → Bahir Dar", cargo: "Food products · 18 Ton", distance: "565 km", price: "ETB 390,000", status: "Bor" },
];

function JobsView({ role }: { role: Role }) {
  if (role === "customer") return <ShipmentForm />;
  return <div className="space-y-5 px-4 pb-6 pt-5 sm:px-6">
    <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">Marketplace</p><h1 className="mt-1 text-2xl font-black text-halo-navy">Hojii argaman</h1></div><button type="button" className="grid h-11 w-11 place-items-center rounded-2xl border border-halo-line bg-white text-halo-blue"><Icon name="filter" /></button></div>
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-halo-soft p-1 text-xs font-bold"><button type="button" className="rounded-xl bg-white px-3 py-2.5 text-halo-blue shadow-sm">Hundaa</button><button type="button" className="px-3 py-2.5 text-halo-muted">Dhihoo</button><button type="button" className="px-3 py-2.5 text-halo-muted">Gatii olaanaa</button></div>
    <div className="space-y-3">{jobs.map((job, index) => <article key={job.route} className="rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${index === 0 ? "bg-emerald-50 text-emerald-700" : "bg-halo-soft text-halo-blue"}`}>{job.status}</span><h2 className="mt-3 text-base font-black text-halo-navy">{job.route}</h2><p className="mt-1 text-xs text-halo-muted">{job.cargo}</p></div><button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-halo-soft text-halo-blue"><Icon name="plus" className="h-4 w-4" /></button></div>
      <div className="mt-4 flex items-end justify-between border-t border-halo-line pt-3"><div className="flex items-center gap-1.5 text-xs text-halo-muted"><Icon name="map" className="h-4 w-4" />{job.distance}</div><p className="text-sm font-black text-halo-blue">{job.price}</p></div>
    </article>)}</div>
  </div>;
}

function Field({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-halo-muted">{label}</span><span className="flex min-h-13 items-center gap-3 rounded-2xl border border-halo-line bg-white px-4 shadow-halo-card"><Icon name={icon} className="h-4.5 w-4.5 shrink-0 text-halo-blue" /><span className="text-sm font-bold text-halo-navy">{value}</span><Icon name="chevron" className="ml-auto h-4 w-4 text-halo-muted" /></span></label>;
}

function ShipmentForm() {
  return <div className="space-y-5 px-4 pb-7 pt-5 sm:px-6">
    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">Booking</p><h1 className="mt-1 text-2xl font-black text-halo-navy">Geejjiba haaraa</h1><p className="mt-2 text-xs leading-5 text-halo-muted">Odeeffannoo fe'umsaa guuti; quote sirrii argatta.</p></div>
    <section className="space-y-4 rounded-[26px] border border-halo-line bg-halo-surface p-4 shadow-halo-card"><Field label="Pickup" value="Finfinnee, Bole" icon="pin" /><Field label="Destination" value="Hawassa, Sidama" icon="pin" /><div className="grid grid-cols-2 gap-3"><Field label="Truck" value="Fuso 10T" icon="truck" /><Field label="Tonnage" value="12.5 Ton" icon="box" /></div><Field label="Cargo" value="General cargo" icon="briefcase" /></section>
    <section className="rounded-[24px] bg-halo-soft p-4"><div className="flex items-end justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-halo-muted">Estimated price</p><p className="mt-2 text-2xl font-black text-halo-blue">ETB 18,750</p></div><span className="rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-emerald-700">TAX INCLUDED</span></div></section>
    <button type="button" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-halo-blue px-5 text-sm font-black text-white shadow-halo-button active:scale-[0.99]">Quote mirkaneessi <Icon name="arrow" className="h-4 w-4" /></button>
  </div>;
}

function LiveMapView({ role }: { role: Role }) {
  return <div className="relative min-h-[calc(100dvh-137px)] overflow-hidden bg-[#e9f1ec]">
    <div className="absolute inset-0 halo-map-grid" />
    <svg viewBox="0 0 420 720" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Live route map">
      <path d="M25 112 C120 86 118 210 215 220 S300 150 390 190" stroke="#d5dfd9" strokeWidth="15" fill="none" />
      <path d="M-20 345 C70 300 130 390 210 350 S315 300 450 390" stroke="#d5dfd9" strokeWidth="12" fill="none" />
      <path d="M65 670 C100 565 80 500 155 430 S235 360 252 272 S315 205 358 98" stroke="#ffffff" strokeWidth="14" fill="none" />
      <path d="M65 670 C100 565 80 500 155 430 S235 360 252 272 S315 205 358 98" stroke="#0759c7" strokeWidth="7" fill="none" strokeLinecap="round" />
      <circle cx="65" cy="670" r="13" fill="#16a36a" stroke="white" strokeWidth="5" />
      <circle cx="358" cy="98" r="13" fill="#ef4444" stroke="white" strokeWidth="5" />
      <g transform="translate(198 382)"><circle cx="0" cy="0" r="23" fill="#0759c7" stroke="white" strokeWidth="5"/><path d="M-11-5h13v10h-13zM2-2h7l5 5v2H2z" fill="white"/><circle cx="-6" cy="8" r="3" fill="white"/><circle cx="8" cy="8" r="3" fill="white"/></g>
    </svg>

    <div className="absolute inset-x-3 top-3 z-10 rounded-[22px] border border-white/70 bg-white/94 p-4 shadow-halo-float backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-muted">{role === "driver" ? "Active trip" : "Live order"}</p><h1 className="mt-1 text-lg font-black text-halo-navy">Finfinnee → Hawassa</h1></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-black text-emerald-700">LIVE</span></div>
      <div className="mt-3 flex items-center gap-3 text-xs text-halo-muted"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Pickup</span><span className="h-px flex-1 bg-halo-line"/><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Destination</span></div>
    </div>

    <div className="absolute right-3 top-36 z-10 grid gap-2"><button type="button" className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-halo-blue shadow-halo-card"><Icon name="pin" className="h-5 w-5" /></button><button type="button" className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-halo-navy shadow-halo-card"><Icon name="plus" className="h-5 w-5" /></button></div>

    <section className="absolute inset-x-0 bottom-0 z-10 rounded-t-[30px] border-t border-white bg-white/96 px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_50px_rgba(16,33,61,0.16)] backdrop-blur-xl sm:px-6">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-halo-line" />
      <div className="grid grid-cols-3 divide-x divide-halo-line text-center"><div><p className="text-[10px] font-bold text-halo-muted">ETA</p><p className="mt-1 text-sm font-black text-halo-navy">4:30 PM</p></div><div><p className="text-[10px] font-bold text-halo-muted">Fageenya</p><p className="mt-1 text-sm font-black text-halo-navy">128 km</p></div><div><p className="text-[10px] font-bold text-halo-muted">Yeroo hafe</p><p className="mt-1 text-sm font-black text-halo-navy">1h 45m</p></div></div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-halo-soft p-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-halo-blue text-white"><Icon name={role === "driver" ? "truck" : "user"} /></span><div className="min-w-0 flex-1"><p className="text-sm font-black text-halo-navy">{role === "driver" ? "Fuso · ABC-12345" : "Abdi D. · Driver"}</p><p className="mt-0.5 text-[10px] text-halo-muted">{role === "driver" ? "GPS active · Signal gaarii" : "★ 4.8 · Fuso 10 Ton"}</p></div><button type="button" className="grid h-10 w-10 place-items-center rounded-xl bg-white text-halo-blue"><Icon name="phone" className="h-4.5 w-4.5" /></button></div>
    </section>
  </div>;
}

function WalletView({ role }: { role: Role }) {
  const transactions = role === "driver"
    ? [["Finfinnee → Hawassa", "+ ETB 45,000", "Xumurame"], ["Adama → Finfinnee", "+ ETB 30,000", "Xumurame"], ["Payout", "- ETB 50,000", "Baafame"]]
    : [["ORD-2026-0789", "ETB 18,750", "In transit"], ["ORD-2026-0756", "ETB 24,500", "Delivered"], ["ORD-2026-0741", "ETB 14,000", "Delivered"]];
  return <div className="space-y-5 px-4 pb-7 pt-5 sm:px-6">
    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">{role === "driver" ? "Wallet" : "Payments"}</p><h1 className="mt-1 text-2xl font-black text-halo-navy">{role === "driver" ? "Maallaqa kee" : "Kaffaltii fi invoice"}</h1></div>
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-halo-blue to-halo-blue-dark p-5 text-white shadow-halo-float"><div className="absolute -right-9 -top-9 h-32 w-32 rounded-full border-[24px] border-white/5"/><div className="relative"><p className="text-xs text-white/60">{role === "driver" ? "Available balance" : "Total paid"}</p><p className="mt-2 text-3xl font-black tracking-tight">ETB {role === "driver" ? "126,450" : "57,250"}</p><div className="mt-5 flex gap-2"><button type="button" className="min-h-11 flex-1 rounded-2xl bg-halo-gold px-4 text-xs font-black text-halo-navy">{role === "driver" ? "Payout" : "Invoice ilaali"}</button><button type="button" className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12"><Icon name="arrow" className="h-4 w-4" /></button></div></div></section>
    <section className="space-y-3"><SectionTitle eyebrow="Recent activity" title="Galmee dhihoo" action="Hundaa" />{transactions.map(([title, amount, status]) => <article key={title} className="flex items-center gap-3 rounded-[20px] border border-halo-line bg-white p-3.5 shadow-halo-card"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-halo-soft text-halo-blue"><Icon name={title === "Payout" ? "wallet" : "truck"} className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-halo-navy">{title}</p><p className="mt-1 text-[10px] text-halo-muted">Har'a · {status}</p></div><p className={`text-xs font-black ${amount.startsWith("+") ? "text-emerald-700" : "text-halo-navy"}`}>{amount}</p></article>)}</section>
  </div>;
}

function ProfileView({ role }: { role: Role }) {
  return <div className="space-y-5 px-4 pb-7 pt-5 sm:px-6">
    <section className="flex items-center gap-4 rounded-[26px] border border-halo-line bg-white p-4 shadow-halo-card"><span className="grid h-16 w-16 place-items-center rounded-[22px] bg-halo-blue text-white"><Icon name="user" className="h-8 w-8" /></span><div><h1 className="text-xl font-black text-halo-navy">{role === "driver" ? "Abdi Driver" : "Moha Customer"}</h1><p className="mt-1 text-xs text-halo-muted">{role === "driver" ? "Verified driver · Active" : "Customer account · Verified"}</p><span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700"><Icon name="check" className="h-3 w-3" /> ACTIVE</span></div></section>
    <section className="overflow-hidden rounded-[24px] border border-halo-line bg-white shadow-halo-card">{[
      [role === "driver" ? "Driver documents" : "Account details", "shield" as IconName],
      [role === "driver" ? "Vehicle information" : "Saved locations", role === "driver" ? "truck" as IconName : "pin" as IconName],
      ["Language · Afaan Oromoo", "message" as IconName],
      ["Support & help", "phone" as IconName],
    ].map(([label, icon], index) => <button key={label} type="button" className={`flex min-h-15 w-full items-center gap-3 px-4 text-left ${index ? "border-t border-halo-line" : ""}`}><span className="grid h-9 w-9 place-items-center rounded-xl bg-halo-soft text-halo-blue"><Icon name={icon as IconName} className="h-4 w-4" /></span><span className="flex-1 text-sm font-bold text-halo-navy">{label}</span><Icon name="chevron" className="h-4 w-4 text-halo-muted" /></button>)}</section>
    <div className="rounded-2xl bg-halo-gold-soft p-4 text-xs leading-5 text-halo-gold-dark"><strong>Isolated mobile workspace:</strong> Admin, CEO, Finance, Partner fi web production theme hin jijjiiru.</div>
  </div>;
}

function BottomNav({ role, tab, setTab }: { role: Role; tab: Tab; setTab: (tab: Tab) => void }) {
  const items: { tab: Tab; icon: IconName; label: string }[] = [
    { tab: "home", icon: "home", label: "Home" },
    { tab: "jobs", icon: role === "driver" ? "briefcase" : "plus", label: role === "driver" ? "Hojii" : "Ajaja" },
    { tab: "map", icon: "map", label: "Track" },
    { tab: "wallet", icon: "wallet", label: role === "driver" ? "Wallet" : "Pay" },
    { tab: "profile", icon: "user", label: "Profile" },
  ];
  return <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-halo-line bg-white/96 px-1 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl" aria-label={`${role} navigation`}>
    {items.map((item) => <button key={item.tab} type="button" onClick={() => setTab(item.tab)} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-bold transition ${tab === item.tab ? "text-halo-blue" : "text-halo-muted"}`}><span className={`grid h-8 w-10 place-items-center rounded-xl ${tab === item.tab ? "bg-halo-soft" : ""}`}><Icon name={item.icon} className="h-5 w-5" /></span>{item.label}{tab === item.tab && <span className="absolute bottom-0 h-1 w-5 rounded-full bg-halo-gold" />}</button>)}
  </nav>;
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
  const content = useMemo(() => {
    if (tab === "home") return role === "driver" ? <DriverHome setTab={setTab} /> : <CustomerHome setTab={setTab} />;
    if (tab === "jobs") return <JobsView role={role} />;
    if (tab === "map") return <LiveMapView role={role} />;
    if (tab === "wallet") return <WalletView role={role} />;
    return <ProfileView role={role} />;
  }, [role, tab]);

  useEffect(() => {
    setTab("home");
  }, [role]);

  return <div className="halo-mobile-app min-h-screen bg-halo-canvas text-halo-navy">
    <div className="mx-auto min-h-screen w-full max-w-[520px] bg-halo-canvas shadow-[0_0_70px_rgba(16,33,61,0.10)]">
      <header className="sticky top-0 z-40 flex min-h-[72px] items-center justify-between gap-3 border-b border-halo-line bg-white/95 px-4 backdrop-blur-xl sm:px-6">
        <HaloLogo />
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden max-w-28 truncate rounded-xl bg-halo-soft px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-halo-blue sm:block">{identity.fullName}</span>
          <button type="button" onClick={() => void onSignOut()} disabled={signingOut} aria-label={`Sign out ${identity.fullName}`} className="min-h-10 shrink-0 rounded-xl border border-halo-line px-3 text-xs font-black text-halo-navy disabled:opacity-60">{signingOut ? "…" : "Ba'i"}</button>
          <button type="button" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-halo-soft text-halo-blue" aria-label="Notifications"><Icon name="bell" className="h-5 w-5" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-halo-soft bg-red-500" /></button>
        </div>
      </header>
      <main>{content}</main>
      <BottomNav role={role} tab={tab} setTab={setTab} />
    </div>
  </div>;
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

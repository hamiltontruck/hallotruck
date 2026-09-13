import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../../services/supabase.client";
import { AdminMobileBottomNav } from "./AdminMobileBottomNav";
import { AdminDriverChatLauncher } from "./AdminDriverChatLauncher";

const links = [
  { to: "/admin", label: "Overview", icon: "▦" },
  { to: "/admin/ai-assistant", label: "AI Assistant", icon: "AI" },
  { to: "/admin/intelligence", label: "Intelligence", icon: "⌕" },
  { to: "/admin/finance", label: "Finance Dashboard V3", icon: "FIN" },
  { to: "/admin/partner-finance", label: "Partner finance", icon: "P%" },
  { to: "/admin/partners", label: "Partner onboarding", icon: "LP" },
  { to: "/admin/operations", label: "Operations", icon: "OPS" },
  { to: "/admin/payment-review", label: "Payment review", icon: "PAY" },
  { to: "/admin/driver-finance-search", label: "Driver finance", icon: "ETB" },
  { to: "/admin/driver-compliance", label: "Driver control", icon: "DRV" },
  { to: "/admin/fleet-maintenance", label: "Fleet maintenance", icon: "MNT" },
  { to: "/admin/driver-commission", label: "Commission control", icon: "%" },
  { to: "/admin/quote-pricing", label: "Quote pricing", icon: "QTE" },
  { to: "/admin/manual-driver-documents", label: "Manual documents", icon: "DOC" },
  { to: "/admin/more", label: "More tools", icon: "•••" },
];

export function AdminToolShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return <div className="min-h-screen min-w-0 overflow-x-hidden bg-[#f5f3ed] text-asphalt lg:flex">
    {open && <button type="button" aria-label="Close Admin menu" className="fixed inset-0 z-30 bg-asphalt/45 lg:hidden" onClick={() => setOpen(false)} />}
    <aside id="admin-tool-menu" className={`fixed inset-y-0 left-0 z-40 flex w-[280px] max-w-[calc(100vw-2rem)] flex-col overflow-x-hidden bg-asphalt text-white transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:max-w-none ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <div className="flex h-24 items-center justify-between border-b border-white/10 px-5 min-[360px]:px-7"><Link to="/admin" onClick={() => setOpen(false)} className="min-w-0"><p className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></p><p className="mt-1 break-words font-mono text-[9px] tracking-[.28em] text-white/45">SMART LOGISTICS</p></Link><button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center text-2xl text-white/55 lg:hidden" aria-label="Close Admin menu">×</button></div>
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-4 py-7"><p className="mb-4 px-3 font-mono text-[10px] tracking-[.2em] text-white/35">LEADERSHIP</p>{links.map(link=>{const active=location.pathname===link.to;return <Link key={link.to} to={link.to} onClick={()=>setOpen(false)} className={`flex min-h-11 min-w-0 items-center gap-3 px-3 py-3 text-sm transition ${active?"bg-amber font-semibold text-asphalt":"text-white/60 hover:bg-white/5 hover:text-white"}`}><span className="grid h-6 w-7 shrink-0 place-items-center font-mono text-[10px] font-bold">{link.icon}</span><span className="min-w-0 break-words">{link.label}</span></Link>})}</nav>
      <div className="border-t border-white/10 p-4"><div className="flex min-w-0 items-center gap-3 px-2 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center bg-amber font-display font-bold text-asphalt">HT</span><div className="min-w-0"><p className="truncate text-sm font-medium">Hamilton Truck</p><button type="button" onClick={()=>void supabase.auth.signOut()} className="mt-1 min-h-11 text-[11px] text-white/40 hover:text-amber">Sign out</button></div></div></div>
    </aside>
    <div className="min-w-0 max-w-full flex-1 overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"><header className="sticky top-0 z-20 flex h-16 min-w-0 items-center justify-between gap-3 border-b border-asphalt/10 bg-white px-3 min-[360px]:px-4 lg:hidden"><button type="button" onClick={()=>setOpen(true)} className="grid h-11 w-11 shrink-0 place-items-center border border-asphalt/15 text-xl" aria-label="Open Admin menu" aria-expanded={open} aria-controls="admin-tool-menu">☰</button><div className="min-w-0 text-right"><p className="truncate font-display text-sm font-semibold">Admin / CEO</p><p className="truncate font-mono text-[9px] tracking-widest text-steel">LEADERSHIP CONTROL</p></div></header>{children}</div>
    <AdminMobileBottomNav />
    <AdminDriverChatLauncher />
  </div>;
}

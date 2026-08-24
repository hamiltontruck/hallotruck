import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

export function AdminSidebarLeadershipLinks() {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const nav = document.querySelector("aside nav");
    if (!(nav instanceof HTMLElement)) return;

    const host = document.createElement("div");
    host.dataset.adminLeadershipLinks = "true";
    host.className = "mt-4 border-t border-white/10 pt-4";
    nav.appendChild(host);
    setMount(host);

    return () => {
      setMount(null);
      host.remove();
    };
  }, []);

  if (!mount) return null;

  return createPortal(
    <div className="space-y-1">
      <p className="mb-2 px-3 font-mono text-[9px] tracking-[.2em] text-white/30">CEO CONTROL</p>
      <Link to="/admin/driver-finance-search" className="flex w-full items-center gap-3 px-3 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
        <span className="grid h-[18px] w-[18px] place-items-center border border-amber/60 font-mono text-[7px] font-bold text-amber">OPS</span>
        <span>Driver finance & search</span>
      </Link>
      <Link to="/admin/driver-compliance" className="flex w-full items-center gap-3 px-3 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
        <span className="grid h-[18px] w-[18px] place-items-center border border-amber/60 font-mono text-[7px] font-bold text-amber">DR</span>
        <span>Driver control</span>
      </Link>
      <Link to="/admin/manual-driver-documents" className="flex w-full items-center gap-3 px-3 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
        <span className="grid h-[18px] w-[18px] place-items-center border border-amber/60 font-mono text-[7px] font-bold text-amber">DOC</span>
        <span>Manual documents</span>
      </Link>
      <Link to="/admin/payment-review" className="flex w-full items-center gap-3 px-3 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
        <span className="grid h-[18px] w-[18px] place-items-center border border-amber/60 font-mono text-[8px] font-bold text-amber">PAY</span>
        <span>Payment review</span>
      </Link>
      <Link to="/admin/fleet-maintenance" className="flex w-full items-center gap-3 px-3 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
        <span className="grid h-[18px] w-[18px] place-items-center border border-amber/60 font-mono text-[8px] font-bold text-amber">MT</span>
        <span>Fleet maintenance</span>
      </Link>
      <Link to="/admin/driver-commission" className="flex w-full items-center gap-3 px-3 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
        <span className="grid h-[18px] w-[18px] place-items-center border border-amber/60 text-[11px] font-bold text-amber">%</span>
        <span>Commission control</span>
      </Link>
      <Link to="/admin/quote-pricing" className="flex w-full items-center gap-3 px-3 py-3 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
        <span className="grid h-[18px] w-[18px] place-items-center border border-amber/60 font-mono text-[8px] font-bold text-amber">ETB</span>
        <span>Quote pricing</span>
      </Link>
    </div>,
    mount,
  );
}

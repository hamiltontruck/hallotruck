import { Link } from "react-router-dom";

export function AdminDriverCommissionShortcut() {
  return <Link to="/admin/driver-commission" className="fixed bottom-5 right-5 z-30 flex items-center gap-3 border border-amber/40 bg-asphalt px-4 py-3 text-white shadow-lg sm:bottom-7 sm:right-7">
    <span className="grid h-9 w-9 place-items-center bg-amber font-display font-bold text-asphalt">%</span>
    <span className="hidden sm:block"><span className="block text-xs font-semibold">Commission control</span><span className="mt-0.5 block text-[10px] text-white/45">Approve driver settlements</span></span>
  </Link>;
}

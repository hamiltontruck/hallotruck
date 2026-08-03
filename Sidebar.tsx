import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `font-body text-sm px-3 py-2 block ${
    isActive ? "text-bone bg-line" : "text-steel hover:text-bone"
  }`;

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-asphalt min-h-screen text-bone">
      <div className="px-5 py-6 border-b border-line">
        <span className="font-display font-bold text-lg tracking-tight">
          HALLO<span className="text-amber">TRUCK</span>
        </span>
        <div className="font-mono text-[10px] text-steel mt-1 uppercase">Admin</div>
      </div>
      <nav className="py-4">
        <NavLink to="/overview" className={linkClass}>
          Overview
        </NavLink>
        <NavLink to="/orders" className={linkClass}>
          Orders
        </NavLink>
        <NavLink to="/drivers" className={linkClass}>
          Drivers
        </NavLink>
        <NavLink to="/payments" className={linkClass}>
          Payments
        </NavLink>
      </nav>
    </aside>
  );
}

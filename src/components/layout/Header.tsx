import { NavLink } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `font-body text-sm ${isActive ? "text-asphalt font-semibold" : "text-steel hover:text-asphalt"}`;

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <span className="font-display font-bold text-xl text-asphalt tracking-tight">
          HALLO<span className="text-amber">TRUCK</span>
          <span className="font-mono text-xs text-steel ml-2 align-middle">DRIVER</span>
        </span>
        <nav className="flex items-center gap-6">
          <NavLink to="/jobs" className={linkClass}>
            Job board
          </NavLink>
          <NavLink to="/trip" className={linkClass}>
            Active trip
          </NavLink>
          <NavLink to="/documents" className={linkClass}>
            Documents
          </NavLink>
          <NavLink to="/earnings" className={linkClass}>
            Earnings
          </NavLink>
        </nav>
      </div>
      <div className="route-line" />
    </header>
  );
}

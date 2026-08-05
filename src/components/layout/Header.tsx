import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase.client";

const links = [
  { to: "/driver/jobs", label: "Job board" },
  { to: "/driver/trip", label: "Active trip" },
  { to: "/driver/documents", label: "Documents" },
  { to: "/driver/earnings", label: "Earnings" },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `font-body text-sm ${
    isActive ? "text-asphalt font-semibold" : "text-steel hover:text-asphalt"
  }`;

export function Header() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    navigate("/driver/login", { replace: true });
  }

  return (
    <header className="border-b border-line bg-bone">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <span className="font-display font-bold text-lg sm:text-xl text-asphalt tracking-tight">
          HALLO<span className="text-amber">TRUCK</span>
          <span className="font-mono text-[10px] sm:text-xs text-steel ml-2 align-middle">
            DRIVER
          </span>
        </span>

        <nav className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={logout}
            className="font-body text-sm text-route"
          >
            Logout
          </button>
        </nav>

        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="md:hidden border border-line px-3 py-2 font-body text-sm text-asphalt"
          aria-expanded={menuOpen}
          aria-label="Open navigation menu"
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      {menuOpen && (
        <nav className="md:hidden border-t border-line px-4 py-4 flex flex-col gap-4 bg-white">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={linkClass}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={logout}
            className="font-body text-sm text-route text-left"
          >
            Logout
          </button>
        </nav>
      )}

      <div className="route-line" />
    </header>
  );
}

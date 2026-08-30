import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/admin", label: "Overview", icon: "▦" },
  { to: "/admin/operations?section=Orders", label: "Orders", icon: "▤" },
  { to: "/admin/operations?section=Fleet%20%26%20drivers", label: "Fleet", icon: "▣" },
  { to: "/admin/finance", label: "Finance", icon: "ETB" },
  { to: "/admin/more", label: "More", icon: "•••" },
] as const;

export function AdminMobileBottomNav() {
  const { pathname, search } = useLocation();
  const operationsSection = new URLSearchParams(search).get("section");
  const activeLabel = pathname === "/admin"
    ? "Overview"
    : pathname === "/admin/operations" && operationsSection === "Orders"
      ? "Orders"
      : pathname === "/admin/driver-compliance" || pathname === "/admin/fleet-maintenance" || (pathname === "/admin/operations" && operationsSection === "Fleet & drivers")
        ? "Fleet"
        : pathname === "/admin/finance" || (pathname === "/admin/operations" && operationsSection === "Finance")
          ? "Finance"
          : "More";

  return (
    <nav className="admin-mobile-bottom-nav lg:hidden" aria-label="Admin primary navigation">
      {links.map((link) => {
        const active = link.label === activeLabel;
        return (
          <Link
            key={link.to}
            to={link.to}
            aria-current={active ? "page" : undefined}
            className={`admin-mobile-bottom-nav__item${active ? " is-active" : ""}`}
          >
            <span className="admin-mobile-bottom-nav__icon" aria-hidden="true">{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

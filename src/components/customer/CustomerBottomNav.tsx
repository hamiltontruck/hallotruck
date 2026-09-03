import { NavLink } from "react-router-dom";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";

const copy: Record<HalloLanguage, { dashboard: string; home: string; profile: string; orders: string; track: string; payments: string }> = {
  en: { dashboard: "Customer dashboard", home: "Home", profile: "Profile", orders: "Orders", track: "Track", payments: "Payments" },
  om: { dashboard: "Daashboordii customer", home: "Home", profile: "Profaayilii", orders: "Ajajoota", track: "Hordoffii", payments: "Kaffaltii" },
  am: { dashboard: "የደንበኛ ዳሽቦርድ", home: "መነሻ", profile: "መገለጫ", orders: "ትዕዛዞች", track: "ክትትል", payments: "ክፍያዎች" },
};

type CustomerNavKey = "home" | "orders" | "track" | "payments" | "profile";
type CustomerNavIconName = CustomerNavKey;

type CustomerNavLink = {
  to: string;
  key: CustomerNavKey;
  icon: CustomerNavIconName;
  end: boolean;
};

const links: CustomerNavLink[] = [
  { to: "/customer", key: "home", icon: "home", end: true },
  { to: "/customer/orders", key: "orders", icon: "orders", end: true },
  { to: "/customer/track", key: "track", icon: "track", end: true },
  { to: "/customer/payments", key: "payments", icon: "payments", end: true },
  { to: "/customer/profile", key: "profile", icon: "profile", end: true },
];

function CustomerNavIcon({ name }: { name: CustomerNavIconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "home" && (
        <>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10.5V20h13v-9.5" />
          <path d="M9 20v-6h6v6" />
        </>
      )}
      {name === "orders" && (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </>
      )}
      {name === "track" && (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </>
      )}
      {name === "payments" && (
        <>
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a1 1 0 0 1 1 1v14H6.5A2.5 2.5 0 0 1 4 16.5Z" />
          <path d="M4 7h15M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z" />
        </>
      )}
      {name === "profile" && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      )}
    </svg>
  );
}

export function CustomerBottomNav() {
  const { language } = useLanguage();
  const labels = copy[language];

  return (
    <nav className="customer-dashboard-nav" aria-label="Customer portal navigation">
      <div className="customer-dashboard-nav__inner">
        <div className="customer-dashboard-nav__title">
          <span className="customer-dashboard-nav__eyebrow">HALLOTRUCK</span>
          <strong>{labels.dashboard}</strong>
        </div>
        <div className="customer-dashboard-nav__tabs">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `customer-dashboard-nav__item${isActive ? " is-active" : ""}`}
            >
              <span className="customer-dashboard-nav__icon" aria-hidden="true"><CustomerNavIcon name={link.icon} /></span>
              <span>{labels[link.key]}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}

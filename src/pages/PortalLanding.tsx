import { Link } from "react-router-dom";
import { LanguageSwitcher, useLanguage } from "../i18n/LanguageProvider";

const portalSpecs = [
  {
    label: "landing.adminLabel",
    title: "landing.adminTitle",
    description: "landing.adminDesc",
    path: "/admin",
    accent: "bg-amber text-asphalt",
  },
  {
    label: "landing.driverLabel",
    title: "landing.driverTitle",
    description: "landing.driverDesc",
    path: "/driver/login",
    accent: "bg-route text-white",
  },
  {
    label: "landing.customerLabel",
    title: "landing.customerTitle",
    description: "landing.customerDesc",
    path: "/customer/login",
    accent: "bg-emerald-700 text-white",
  },
];

const capabilityKeys = [
  "cap.driverGps",
  "cap.customerTracking",
  "cap.routeQuote",
  "cap.navigation",
  "cap.autoSteps",
  "cap.payment",
];

export function PortalLanding() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-asphalt text-white">
      <div className="route-line" />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-bold">
              HALLO<span className="text-amber">TRUCK</span>
            </p>
            <p className="mt-1 font-mono text-[10px] tracking-[.28em] text-white/40">
              SMART LOGISTICS
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher dark />
            <span className="hidden border border-white/15 px-3 py-2 font-mono text-[10px] tracking-widest text-white/50 sm:inline-flex">
              {t("landing.oneNetwork")}
            </span>
          </div>
        </header>

        <div className="max-w-3xl py-16 sm:py-24">
          <p className="font-mono text-xs tracking-[.22em] text-amber">{t("landing.chooseWorkspace")}</p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-6xl">
            {t("landing.hero")}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">
            {t("landing.heroText")}
          </p>
        </div>

        <div className="mb-8 border-y border-white/10 py-5">
          <p className="mb-3 font-mono text-[10px] tracking-[.2em] text-white/35">{t("landing.capabilities")}</p>
          <div className="flex flex-wrap gap-2">
            {capabilityKeys.map((capability) => (
              <span
                key={capability}
                className="border border-white/15 bg-white/[.04] px-3 py-2 font-mono text-[10px] tracking-wide text-white/65"
              >
                {t(capability)}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {portalSpecs.map((portal, index) => (
            <Link
              key={portal.path}
              to={portal.path}
              className="group border border-white/12 bg-white/[.04] p-6 transition hover:-translate-y-1 hover:border-amber/60 sm:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <span className={`inline-flex px-3 py-2 font-mono text-[10px] tracking-[.18em] ${portal.accent}`}>
                  {t(portal.label)}
                </span>
                <span className="font-mono text-xs text-white/25">0{index + 1}</span>
              </div>
              <h2 className="mt-10 font-display text-2xl font-semibold">{t(portal.title)}</h2>
              <p className="mt-3 min-h-14 text-sm leading-6 text-white/45">{t(portal.description)}</p>
              <span className="mt-8 inline-flex items-center gap-3 text-sm font-semibold text-amber">
                {t("common.openPortal")} <span className="transition group-hover:translate-x-1">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

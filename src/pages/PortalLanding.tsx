import { Link } from "react-router-dom";

const portals = [
  {
    label: "ADMIN / CEO",
    title: "Control Center",
    description: "Orders, live operations, fleet, finance, delivery proof and business reports.",
    path: "/admin",
    accent: "bg-amber text-asphalt",
  },
  {
    label: "DRIVER",
    title: "Mobile Workspace",
    description: "Find loads, share live GPS, follow turn-by-turn routes, manage trips, documents and earnings.",
    path: "/driver/login",
    accent: "bg-route text-white",
  },
  {
    label: "CUSTOMER",
    title: "Smart Portal",
    description: "Request transport, get route-aware quotes, follow the truck live, submit payments and view delivery proof.",
    path: "/customer/login",
    accent: "bg-emerald-700 text-white",
  },
];

const liveCapabilities = [
  "Live driver GPS",
  "Customer truck tracking",
  "Route-aware quotes",
  "Turn-by-turn navigation",
  "Automatic route steps",
  "Secure payment flow",
];

export function PortalLanding() {
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
          <span className="border border-white/15 px-3 py-2 font-mono text-[10px] tracking-widest text-white/50">
            ONE NETWORK
          </span>
        </header>

        <div className="max-w-3xl py-16 sm:py-24">
          <p className="font-mono text-xs tracking-[.22em] text-amber">CHOOSE YOUR WORKSPACE</p>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-6xl">
            Logistics built around every role.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">
            Secure portals for leadership, drivers and customers—connected by live GPS, road routing, payments and one shared transport network.
          </p>
        </div>

        <div className="mb-8 border-y border-white/10 py-5">
          <p className="mb-3 font-mono text-[10px] tracking-[.2em] text-white/35">LIVE PLATFORM CAPABILITIES</p>
          <div className="flex flex-wrap gap-2">
            {liveCapabilities.map((capability) => (
              <span
                key={capability}
                className="border border-white/15 bg-white/[.04] px-3 py-2 font-mono text-[10px] tracking-wide text-white/65"
              >
                {capability}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {portals.map((portal, index) => (
            <Link
              key={portal.path}
              to={portal.path}
              className="group border border-white/12 bg-white/[.04] p-6 transition hover:-translate-y-1 hover:border-amber/60 sm:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <span className={`inline-flex px-3 py-2 font-mono text-[10px] tracking-[.18em] ${portal.accent}`}>
                  {portal.label}
                </span>
                <span className="font-mono text-xs text-white/25">0{index + 1}</span>
              </div>
              <h2 className="mt-10 font-display text-2xl font-semibold">{portal.title}</h2>
              <p className="mt-3 min-h-14 text-sm leading-6 text-white/45">{portal.description}</p>
              <span className="mt-8 inline-flex items-center gap-3 text-sm font-semibold text-amber">
                Open portal <span className="transition group-hover:translate-x-1">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

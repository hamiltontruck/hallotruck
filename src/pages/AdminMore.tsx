import { Link } from "react-router-dom";

const groups = [
  {
    title: "Operations",
    links: [
      ["Live operations", "/admin/operations"],
      ["Driver control & compliance", "/admin/driver-compliance"],
      ["Fleet maintenance", "/admin/fleet-maintenance"],
      ["Manual driver documents", "/admin/manual-driver-documents"],
    ],
  },
  {
    title: "Finance",
    links: [
      ["Finance Dashboard V3", "/admin/finance"],
      ["Payment review", "/admin/payment-review"],
      ["Driver finance search", "/admin/driver-finance-search"],
      ["Commission control", "/admin/driver-commission"],
      ["Partner finance", "/admin/partner-finance"],
      ["Quote pricing", "/admin/quote-pricing"],
    ],
  },
  {
    title: "Enterprise",
    links: [
      ["Executive intelligence", "/admin/intelligence"],
      ["HALLO AI Assistant", "/admin/ai-assistant"],
      ["Partner onboarding", "/admin/partners"],
      ["Partner job dispatch", "/admin/partner-dispatch"],
    ],
  },
] as const;

export function AdminMore() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">ADMIN / CEO</p>
      <h1 className="mt-2 font-display text-3xl font-bold">More tools</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-steel">Open every authorized operational, finance and enterprise workspace from one mobile-friendly directory.</p>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title} className="min-w-0 border border-asphalt/10 bg-white p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">{group.title}</h2>
            <div className="mt-4 grid gap-2">
              {group.links.map(([label, to]) => (
                <Link key={to} to={to} className="flex min-h-12 items-center justify-between gap-3 border border-asphalt/10 px-3 py-3 text-sm font-semibold transition hover:border-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber">
                  <span className="min-w-0 break-words">{label}</span>
                  <span aria-hidden="true" className="shrink-0 text-amber-dim">→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

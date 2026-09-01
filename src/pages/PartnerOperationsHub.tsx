import { Link, useSearchParams } from "react-router-dom";
import { PartnerPortal } from "./PartnerPortal";

export function PartnerOperationsHub() {
  const [params] = useSearchParams();
  const organization = params.get("organization");
  const jobLink = organization ? `/partner/jobs?organization=${encodeURIComponent(organization)}` : "/partner/jobs";
  return <div className="min-h-screen overflow-x-hidden bg-[#f5f3ed]">
    <nav className="border-b border-amber/25 bg-asphalt px-4 py-3 text-white sm:px-7" aria-label="Partner operations">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[.18em] text-white/55">PARTNER OPERATIONS</p>
        <Link to={jobLink} className="min-h-11 border border-amber/60 px-4 py-3 text-xs font-semibold text-amber">Jobs & assignments →</Link>
      </div>
    </nav>
    <PartnerPortal />
  </div>;
}

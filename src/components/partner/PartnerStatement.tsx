import { useMemo, useState } from "react";
import {
  buildPartnerStatement,
  filterPartnerStatement,
  partnerSettlementStatuses,
  type PartnerStatementEntryType,
  type PartnerStatementFilters,
} from "../../domain/partner-settlement";
import type {
  FinancialCorrection,
  PartnerFinanceProject,
  PartnerFreightEarning,
  PartnerSettlement,
  PartnerSettlementPayment,
} from "../../services/partner-finance.service";
import { formatEtb } from "../../utils/currency";
import {
  exportPartnerStatementCsv,
  exportPartnerStatementExcel,
  printPartnerStatement,
} from "../../utils/partner-statement-export";
import "../../styles/partner-statement.css";

const initialFilters: PartnerStatementFilters = {
  from: "",
  to: "",
  projectId: "",
  entryType: "all",
  freight: "",
  settlementStatus: "all",
};

const entryTypes: Array<{ value: "all" | PartnerStatementEntryType; label: string }> = [
  { value: "all", label: "All entries" },
  { value: "freight", label: "Freight earnings" },
  { value: "freight_correction", label: "Freight corrections" },
  { value: "settlement", label: "Settlement payments" },
  { value: "settlement_reversal", label: "Settlement reversals" },
];

export function PartnerStatement({
  organizationName,
  projects,
  earnings,
  settlements,
  payments,
  corrections,
}: {
  organizationName: string;
  projects: PartnerFinanceProject[];
  earnings: PartnerFreightEarning[];
  settlements: PartnerSettlement[];
  payments: PartnerSettlementPayment[];
  corrections: FinancialCorrection[];
}) {
  const [filters, setFilters] = useState<PartnerStatementFilters>(initialFilters);
  const rows = useMemo(
    () => buildPartnerStatement(earnings, settlements, payments, corrections),
    [corrections, earnings, payments, settlements],
  );
  const filtered = useMemo(
    () => filterPartnerStatement(rows, filters),
    [filters, rows],
  );
  const displayed = useMemo(() => [...filtered].reverse(), [filtered]);
  const fileBase = `partner-statement-${organizationName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "partner-statement";

  function set<K extends keyof PartnerStatementFilters>(key: K, value: PartnerStatementFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return <section className="partner-statement border border-asphalt/10 bg-white" aria-labelledby="partner-statement-title">
    <div className="border-b border-asphalt/10 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[.18em] text-steel">PARTNER WALLET STATEMENT</p>
          <h2 id="partner-statement-title" className="mt-2 break-words font-display text-2xl font-bold">{organizationName}</h2>
          <p className="mt-2 text-xs leading-5 text-steel">Immutable freight earnings, financial corrections, partial payments and reversals.</p>
        </div>
        <div className="partner-statement-actions flex flex-wrap gap-2">
          <button type="button" onClick={() => exportPartnerStatementCsv(filtered, fileBase)} disabled={filtered.length===0} className="min-h-11 border border-asphalt/20 px-4 py-3 text-xs font-semibold disabled:opacity-40">CSV</button>
          <button type="button" onClick={() => exportPartnerStatementExcel(filtered, fileBase)} disabled={filtered.length===0} className="min-h-11 border border-asphalt/20 px-4 py-3 text-xs font-semibold disabled:opacity-40">Excel</button>
          <button type="button" onClick={printPartnerStatement} className="min-h-11 bg-asphalt px-4 py-3 text-xs font-semibold text-white">Print / PDF</button>
        </div>
      </div>

      <div className="partner-statement-filters mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="text-[11px] font-semibold text-steel">From date<input type="date" value={filters.from} onChange={(event)=>set("from",event.target.value)} className="mt-1 min-h-11 w-full min-w-0 border border-asphalt/20 px-3 text-sm text-asphalt"/></label>
        <label className="text-[11px] font-semibold text-steel">To date<input type="date" value={filters.to} onChange={(event)=>set("to",event.target.value)} className="mt-1 min-h-11 w-full min-w-0 border border-asphalt/20 px-3 text-sm text-asphalt"/></label>
        <label className="text-[11px] font-semibold text-steel">Project<select value={filters.projectId} onChange={(event)=>set("projectId",event.target.value)} className="mt-1 min-h-11 w-full min-w-0 border border-asphalt/20 bg-white px-3 text-sm text-asphalt"><option value="">All projects</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="text-[11px] font-semibold text-steel">Entry type<select value={filters.entryType} onChange={(event)=>set("entryType",event.target.value as PartnerStatementFilters["entryType"])} className="mt-1 min-h-11 w-full min-w-0 border border-asphalt/20 bg-white px-3 text-sm text-asphalt">{entryTypes.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="text-[11px] font-semibold text-steel">Freight reference<input value={filters.freight} onChange={(event)=>set("freight",event.target.value)} placeholder="Order UUID" className="mt-1 min-h-11 w-full min-w-0 border border-asphalt/20 px-3 text-sm text-asphalt"/></label>
        <label className="text-[11px] font-semibold text-steel">Settlement status<select value={filters.settlementStatus} onChange={(event)=>set("settlementStatus",event.target.value as PartnerStatementFilters["settlementStatus"])} className="mt-1 min-h-11 w-full min-w-0 border border-asphalt/20 bg-white px-3 text-sm text-asphalt"><option value="all">All statuses</option>{partnerSettlementStatuses.map((status)=><option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</select></label>
      </div>
      <div className="partner-statement-filters mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-steel" aria-live="polite">{filtered.length} of {rows.length} entries</p>
        <button type="button" onClick={()=>setFilters(initialFilters)} className="min-h-11 border border-asphalt/20 px-4 py-3 text-xs font-semibold">Clear filters</button>
      </div>
      <p className="partner-statement-print-meta mt-3 hidden text-xs text-steel">Generated {new Date().toLocaleString()} · Currency ETB</p>
    </div>

    {displayed.length===0?<p className="p-8 text-center text-sm text-steel">No statement entries match these filters.</p>:<div className="divide-y divide-asphalt/10">{displayed.map((row)=><article key={row.id} className="partner-statement-row grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="bg-asphalt/5 px-2 py-1 text-[9px] font-semibold uppercase">{row.entryType.replaceAll("_"," ")}</span><time className="text-[10px] text-steel" dateTime={row.occurredAt}>{new Date(row.occurredAt).toLocaleString()}</time></div>
        <p className="mt-2 break-all font-mono text-[11px]">{row.reference}</p>
        <p className="mt-1 break-words text-xs text-steel">{row.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:text-right">
        <div><p className="text-[9px] uppercase text-steel">Credit</p><p className="mt-1 break-words font-semibold text-emerald-700">{row.creditEtb?formatEtb(row.creditEtb):"—"}</p></div>
        <div><p className="text-[9px] uppercase text-steel">Debit</p><p className="mt-1 break-words font-semibold text-route">{row.debitEtb?formatEtb(row.debitEtb):"—"}</p></div>
      </div>
      <div className="min-w-0 sm:text-right"><p className="text-[9px] uppercase text-steel">Balance</p><p className="mt-1 break-words font-display text-lg font-bold">{formatEtb(row.balanceEtb)}</p><p className="mt-1 text-[9px] uppercase text-steel">{row.status.replaceAll("_"," ")}</p></div>
    </article>)}</div>}
  </section>;
}


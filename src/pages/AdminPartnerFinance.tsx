import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminPartnerSettlementWorkflow } from "../components/partner/AdminPartnerSettlementWorkflow";
import { PartnerStatement } from "../components/partner/PartnerStatement";
import {
  addPartnerVehicle,
  createCommissionRule,
  loadPartnerFinance,
  recordPartnerFreight,
  type FinancialCorrection,
  type PartnerFinanceProject,
  type PartnerFleetVehicle,
  type PartnerFreightEarning,
  type PartnerSettlement,
  type PartnerSettlementEvent,
  type PartnerSettlementPayment,
  type PartnerWalletSummary,
} from "../services/partner-finance.service";
import { supabase } from "../services/supabase.client";
import { formatEtb } from "../utils/currency";

type Org = { id: string; name: string; code: string; status: string };
const zero: PartnerWalletSummary = { gross_etb:0,hallo_commission_etb:0,partner_net_etb:0,pending_settlement_etb:0,paid_settlement_etb:0,payable_etb:0,fleet_total:0,fleet_available:0,hallo_freight_count:0 };
const numeric = (value: number | string) => Number(value || 0);

export function AdminPartnerFinance() {
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [summary, setSummary] = useState<PartnerWalletSummary>(zero);
  const [fleet, setFleet] = useState<PartnerFleetVehicle[]>([]);
  const [projects, setProjects] = useState<PartnerFinanceProject[]>([]);
  const [earnings, setEarnings] = useState<PartnerFreightEarning[]>([]);
  const [settlements, setSettlements] = useState<PartnerSettlement[]>([]);
  const [settlementPayments, setSettlementPayments] = useState<PartnerSettlementPayment[]>([]);
  const [settlementEvents, setSettlementEvents] = useState<PartnerSettlementEvent[]>([]);
  const [corrections, setCorrections] = useState<FinancialCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async (requestedId?: string) => {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      const organizationResult = await supabase.from("partner_organizations").select("id,name,code,status").order("name");
      if (organizationResult.error) throw organizationResult.error;
      const nextOrganizations = (organizationResult.data ?? []) as Org[];
      setOrganizations(nextOrganizations);
      const selected = requestedId || partnerId || nextOrganizations[0]?.id || "";
      setPartnerId(selected);
      if (!selected) {
        setSummary(zero); setFleet([]); setProjects([]); setEarnings([]); setSettlements([]);
        setSettlementPayments([]); setSettlementEvents([]); setCorrections([]);
        return;
      }
      const data = await loadPartnerFinance(selected);
      setSummary(data.summary ?? zero);
      setFleet(data.fleet);
      setProjects(data.projects);
      setEarnings(data.earnings);
      setSettlements(data.settlements);
      setSettlementPayments(data.settlementPayments);
      setSettlementEvents(data.settlementEvents);
      setCorrections(data.corrections);
    } catch (cause) {
      setLoadFailed(true);
      setError(cause instanceof Error ? cause.message : "Partner finance could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAction(work: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try {
      await work();
      setSuccess(message);
      await load(partnerId);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await runAction(
      () => createCommissionRule(partnerId, String(values.get("type")) as "percentage" | "fixed", Number(values.get("value"))),
      "Commission rule activated.",
    );
  }

  async function addVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const succeeded = await runAction(
      () => addPartnerVehicle(partnerId, String(values.get("plate")), String(values.get("vehicleType")), Number(values.get("capacity")) || null),
      "Fleet vehicle added.",
    );
    if (succeeded) form.reset();
  }

  async function accrueFreight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const succeeded = await runAction(
      () => recordPartnerFreight(
        partnerId,
        String(values.get("orderId")).trim(),
        String(values.get("vehicleId")) || null,
        String(values.get("projectId")) || null,
      ),
      "HALLO-generated freight accrued.",
    );
    if (succeeded) form.reset();
  }

  const organizationName = organizations.find((item) => item.id === partnerId)?.name ?? "Partner";

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-4 text-asphalt sm:p-7 lg:p-10">
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="bg-asphalt p-6 text-white sm:p-8">
        <p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER FINANCE CONTROL</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h1 className="font-display text-3xl font-bold sm:text-4xl">Partner wallet & settlement control</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">HALLO freight commission, approval-controlled partial settlements and immutable financial audit history.</p></div>
          <select value={partnerId} onChange={(event)=>void load(event.target.value)} className="min-h-11 min-w-0 max-w-full border border-white/20 bg-white px-3 py-3 text-sm text-asphalt"><option value="">Choose organization</option>{organizations.map((organization)=><option key={organization.id} value={organization.id}>{organization.name} · {organization.code}</option>)}</select>
        </div>
      </section>

      {error&&<p className="break-words border border-route/30 bg-route/5 p-4 text-sm text-route" role="alert">{error}</p>}
      {success&&<p className="border border-emerald-600/30 bg-emerald-50 p-4 text-sm text-emerald-800" aria-live="polite">{success}</p>}

      {loadFailed?<section className="border border-route/30 bg-white p-6"><p className="text-sm text-steel">No Partner finance totals are shown because a required source failed.</p><button type="button" onClick={()=>void load(partnerId)} className="mt-4 min-h-11 bg-asphalt px-5 py-3 text-sm font-semibold text-white">Retry Partner finance</button></section>:!partnerId?<p className="border border-asphalt/10 bg-white p-10 text-center text-steel">Create or select a Partner organization first.</p>:loading?<p className="border border-asphalt/10 bg-white p-10 text-center text-steel" aria-live="polite">Loading Partner finance…</p>:<>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Gross HALLO freight" value={formatEtb(numeric(summary.gross_etb))}/><Card label="HALLO share" value={formatEtb(numeric(summary.hallo_commission_etb))}/><Card label="Partner net" value={formatEtb(numeric(summary.partner_net_etb))}/><Card label="Payable" value={formatEtb(numeric(summary.payable_etb))} strong/>
          <Card label="Reserved / pending" value={formatEtb(numeric(summary.pending_settlement_etb))}/><Card label="Effective paid" value={formatEtb(numeric(summary.paid_settlement_etb))}/><Card label="Fleet total" value={String(summary.fleet_total)} detail={`${summary.fleet_available} available`}/><Card label="HALLO loads" value={String(summary.hallo_freight_count)} detail="Commissionable only"/>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel title="Commission rule"><form onSubmit={saveRule} className="grid gap-3 sm:grid-cols-3"><select name="type" className="min-h-11 min-w-0 border p-3"><option value="percentage">Percentage</option><option value="fixed">Fixed ETB</option></select><input name="value" required min="0" step="0.01" type="number" placeholder="1 or 500" className="min-h-11 min-w-0 border p-3"/><button disabled={busy} className="min-h-11 bg-asphalt p-3 font-semibold text-white disabled:opacity-40">Activate rule</button></form></Panel>
          <Panel title="Add fleet vehicle"><form onSubmit={addVehicle} className="grid gap-3 sm:grid-cols-4"><input name="plate" required placeholder="Plate" className="min-h-11 min-w-0 border p-3"/><input name="vehicleType" required placeholder="Truck type" className="min-h-11 min-w-0 border p-3"/><input name="capacity" type="number" min="0" step="0.1" placeholder="Tons" className="min-h-11 min-w-0 border p-3"/><button disabled={busy} className="min-h-11 bg-asphalt p-3 font-semibold text-white disabled:opacity-40">Add truck</button></form></Panel>
        </section>

        <Panel title="Accrue HALLO-generated freight">
          <form onSubmit={accrueFreight} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <input name="orderId" required placeholder="Released order UUID" className="min-h-11 min-w-0 border p-3"/>
            <select name="projectId" className="min-h-11 min-w-0 border bg-white p-3"><option value="">No project</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select>
            <select name="vehicleId" className="min-h-11 min-w-0 border bg-white p-3"><option value="">No Partner truck</option>{fleet.map((vehicle)=><option key={vehicle.id} value={vehicle.id}>{vehicle.plate_number} · {vehicle.vehicle_type}</option>)}</select>
            <button disabled={busy} className="min-h-11 bg-asphalt p-3 font-semibold text-white disabled:opacity-40">Record earning</button>
          </form>
        </Panel>

        <AdminPartnerSettlementWorkflow partnerId={partnerId} projects={projects} settlements={settlements} payments={settlementPayments} events={settlementEvents} corrections={corrections} busy={busy} runAction={runAction}/>
        <PartnerStatement organizationName={organizationName} projects={projects} earnings={earnings} settlements={settlements} payments={settlementPayments} corrections={corrections}/>
      </>}
    </div>
  </main>;
}

function Card({ label, value, detail, strong }: { label: string; value: string; detail?: string; strong?: boolean }) {
  return <div className={`min-w-0 border p-4 ${strong?"border-emerald-600 bg-emerald-50":"border-asphalt/10 bg-white"}`}><p className="font-mono text-[9px] uppercase tracking-wider text-steel">{label}</p><p className="mt-3 break-words font-display text-xl font-bold sm:text-2xl">{value}</p>{detail&&<p className="mt-2 text-[11px] text-steel">{detail}</p>}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border border-asphalt/10 bg-white p-5"><h2 className="mb-4 font-display text-xl font-bold">{title}</h2>{children}</section>;
}

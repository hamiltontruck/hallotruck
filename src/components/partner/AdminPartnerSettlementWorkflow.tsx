import { FormEvent, useState } from "react";
import { getPartnerSettlementProgress } from "../../domain/partner-settlement";
import {
  createPartnerSettlement,
  recordPartnerSettlementPayment,
  reversePaidPartnerSettlement,
  transitionPartnerSettlement,
  type FinancialCorrection,
  type PartnerFinanceProject,
  type PartnerSettlement,
  type PartnerSettlementEvent,
  type PartnerSettlementPayment,
} from "../../services/partner-finance.service";
import { formatEtb } from "../../utils/currency";

type OpenPanel = { settlementId: string; kind: "approve" | "reject" | "payment" | "reverse" | "audit" } | null;

const settlementBusyGuidanceId = "partner-settlement-workflow-busy-guidance";
const settlementBusyReason = "Another settlement operation is in progress. Wait for it to finish before starting a new settlement action.";

export function AdminPartnerSettlementWorkflow({
  partnerId,
  projects,
  settlements,
  payments,
  events,
  corrections,
  busy,
  runAction,
}: {
  partnerId: string;
  projects: PartnerFinanceProject[];
  settlements: PartnerSettlement[];
  payments: PartnerSettlementPayment[];
  events: PartnerSettlementEvent[];
  corrections: FinancialCorrection[];
  busy: boolean;
  runAction: (work: () => Promise<void>, message: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<OpenPanel>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const succeeded = await runAction(
      () => createPartnerSettlement(
        partnerId,
        Number(values.get("amount")),
        String(values.get("projectId")) || null,
        String(values.get("note")),
      ),
      "Pending settlement request created.",
    );
    if (succeeded) form.reset();
  }

  async function transition(
    settlementId: string,
    action: "submit_review" | "approve" | "reject",
    notes: string,
  ) {
    const succeeded = await runAction(
      () => transitionPartnerSettlement(settlementId, action, notes),
      action === "submit_review"
        ? "Settlement moved under review."
        : action === "approve"
          ? "Settlement approved."
          : "Settlement rejected.",
    );
    if (succeeded) setOpen(null);
  }

  async function approveOrReject(event: FormEvent<HTMLFormElement>, settlementId: string, action: "approve" | "reject") {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await transition(settlementId, action, String(values.get("notes")));
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>, settlementId: string) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const paidAtValue = String(values.get("paidAt"));
    const succeeded = await runAction(
      () => recordPartnerSettlementPayment({
        settlementId,
        amountEtb: Number(values.get("amount")),
        paymentMethod: String(values.get("paymentMethod")) as "bank_transfer" | "mobile_money" | "cash" | "cheque" | "other",
        provider: String(values.get("provider")),
        transactionRef: String(values.get("transactionRef")),
        paidAt: paidAtValue ? new Date(paidAtValue).toISOString() : new Date().toISOString(),
      }),
      "Audited settlement payment recorded.",
    );
    if (succeeded) setOpen(null);
  }

  async function reverse(event: FormEvent<HTMLFormElement>, settlementId: string) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const succeeded = await runAction(
      () => reversePaidPartnerSettlement(settlementId, String(values.get("reason"))),
      "Paid settlement reversal recorded.",
    );
    if (succeeded) setOpen(null);
  }

  function toggle(settlementId: string, kind: NonNullable<OpenPanel>["kind"]) {
    setOpen((current) => current?.settlementId === settlementId && current.kind === kind
      ? null
      : { settlementId, kind });
  }

  return <section aria-busy={busy} className="space-y-5">
    <section className="border border-asphalt/10 bg-white p-5">
      <p className="font-mono text-[9px] uppercase tracking-[.18em] text-steel">NEW SETTLEMENT REQUEST</p>
      <h2 className="mt-2 font-display text-xl font-bold">Create pending settlement</h2>
      <p className="mt-2 text-xs leading-5 text-steel">A request must pass review and approval before any partial or full payment is recorded.</p>
      {busy && <p id={settlementBusyGuidanceId} role="status" aria-live="polite" className="mt-3 border border-amber/30 bg-amber/10 px-3 py-2 text-xs leading-5 text-asphalt">{settlementBusyReason}</p>}
      <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Requested amount ETB<input name="amount" required type="number" min="0.01" step="0.01" className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/20 px-3"/></label>
        <label className="text-xs font-semibold">Project<select name="projectId" className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/20 bg-white px-3"><option value="">No project</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="text-xs font-semibold sm:col-span-2">Request note<textarea name="note" minLength={2} maxLength={1000} rows={3} className="mt-2 w-full min-w-0 border border-asphalt/20 p-3" placeholder="Optional purpose or internal context"/></label>
        <button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} className="min-h-11 bg-asphalt px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2">{busy?"Saving…":"Create pending request"}</button>
      </form>
    </section>

    <section className="border border-asphalt/10 bg-white">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5"><div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-steel">CONTROLLED WORKFLOW</p><h2 className="mt-2 font-display text-xl font-bold">Settlement queue</h2></div><span className="font-mono text-xs text-steel">{settlements.length}</span></div>
      {settlements.length===0?<p className="border-t border-asphalt/10 p-8 text-center text-sm text-steel">No settlement requests yet.</p>:<div className="divide-y divide-asphalt/10">{settlements.map((settlement)=>{
        const progress = getPartnerSettlementProgress(settlement, payments, corrections);
        const settlementEvents = events.filter((item)=>item.settlement_id===settlement.id);
        const project = projects.find((item)=>item.id===settlement.project_id);
        return <article key={settlement.id} className="min-w-0 p-4 sm:p-5">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="break-all font-mono text-xs font-bold">{settlement.settlement_reference}</p><Status status={progress.status}/></div>
              <p className="mt-3 break-words font-display text-2xl font-bold">{formatEtb(Number(settlement.amount_etb))}</p>
              <p className="mt-1 text-xs text-steel">Paid {formatEtb(progress.effectivePaidEtb)} · Outstanding {formatEtb(progress.outstandingEtb)}</p>
              <p className="mt-2 break-words text-xs text-steel">{project?.name||"No project"}{settlement.note?` · ${settlement.note}`:""}</p>
              {settlement.approval_notes&&<p className="mt-2 text-xs text-emerald-800">Approval: {settlement.approval_notes}</p>}
              {settlement.rejection_reason&&<p className="mt-2 text-xs text-route">Rejected: {settlement.rejection_reason}</p>}
            </div>
            <div className="flex max-w-full flex-wrap gap-2 lg:max-w-md lg:justify-end">
              {progress.status==="pending"&&<button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} onClick={()=>void transition(settlement.id,"submit_review","")} className="min-h-11 bg-amber px-4 py-3 text-xs font-semibold text-asphalt disabled:opacity-40">Start review</button>}
              {progress.status==="under_review"&&<><button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} onClick={()=>toggle(settlement.id,"approve")} className="min-h-11 bg-emerald-700 px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">Approve</button><button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} onClick={()=>toggle(settlement.id,"reject")} className="min-h-11 bg-route px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">Reject</button></>}
              {(progress.status==="approved"||progress.status==="partially_paid")&&<button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} onClick={()=>toggle(settlement.id,"payment")} className="min-h-11 bg-emerald-700 px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">Record payment</button>}
              {progress.status==="paid"&&<button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} onClick={()=>toggle(settlement.id,"reverse")} className="min-h-11 bg-route px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">Reverse settlement</button>}
              <button type="button" onClick={()=>toggle(settlement.id,"audit")} className="min-h-11 border border-asphalt/20 px-4 py-3 text-xs font-semibold">Audit {settlementEvents.length}</button>
            </div>
          </div>

          {open?.settlementId===settlement.id&&open.kind==="approve"&&<AuditForm title="Approve settlement" onSubmit={(event)=>void approveOrReject(event,settlement.id,"approve")} busy={busy} button="Confirm approval" placeholder="Required approval notes"/>}
          {open?.settlementId===settlement.id&&open.kind==="reject"&&<AuditForm title="Reject settlement" onSubmit={(event)=>void approveOrReject(event,settlement.id,"reject")} busy={busy} button="Confirm rejection" placeholder="Required rejection reason" minLength={5}/>}
          {open?.settlementId===settlement.id&&open.kind==="payment"&&<form onSubmit={(event)=>void recordPayment(event,settlement.id)} className="mt-4 grid gap-3 border border-emerald-600/20 bg-emerald-50/50 p-4 sm:grid-cols-2">
            <p className="font-display text-lg font-bold sm:col-span-2">Record partial or full payment</p>
            <label className="text-xs font-semibold">Amount ETB<input name="amount" required type="number" min="0.01" max={progress.outstandingEtb} step="0.01" className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/20 px-3"/></label>
            <label className="text-xs font-semibold">Payment method<select name="paymentMethod" required className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/20 bg-white px-3"><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
            <label className="text-xs font-semibold">Provider<input name="provider" maxLength={120} placeholder="CBE / Telebirr / office" className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/20 px-3"/></label>
            <label className="text-xs font-semibold">Transaction reference<input name="transactionRef" required minLength={3} maxLength={160} className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/20 px-3"/></label>
            <label className="text-xs font-semibold sm:col-span-2">Payment time<input name="paidAt" type="datetime-local" className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/20 px-3"/></label>
            <button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} className="min-h-11 bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2">{busy?"Recording…":"Confirm audited payment"}</button>
          </form>}
          {open?.settlementId===settlement.id&&open.kind==="reverse"&&<form onSubmit={(event)=>void reverse(event,settlement.id)} className="mt-4 grid gap-3 border border-route/20 bg-route/5 p-4"><p className="font-display text-lg font-bold">Reverse paid settlement</p><label className="text-xs font-semibold">Reversal reason<textarea name="reason" required minLength={5} maxLength={500} rows={3} className="mt-2 w-full min-w-0 border border-asphalt/20 p-3"/></label><p className="text-[11px] text-steel">The original settlement and payment rows remain unchanged. A correction entry restores the Partner balance.</p><button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} className="min-h-11 bg-route px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Confirm immutable reversal</button></form>}
          {open?.settlementId===settlement.id&&open.kind==="audit"&&<div className="mt-4 border border-asphalt/10 bg-[#f8f7f3] p-4"><p className="font-display text-lg font-bold">Settlement audit trail</p>{settlementEvents.length===0?<p className="mt-3 text-xs text-steel">No structured events recorded.</p>:<ol className="mt-3 space-y-3">{settlementEvents.map((item)=><li key={String(item.id)} className="border-l-2 border-amber pl-3"><p className="text-xs font-semibold capitalize">{item.event_type.replaceAll("_"," ")} · {item.to_status.replaceAll("_"," ")}</p><p className="mt-1 text-[10px] text-steel">{new Date(item.created_at).toLocaleString()}{item.amount_etb?` · ${formatEtb(Number(item.amount_etb))}`:""}</p>{item.reason&&<p className="mt-1 break-words text-xs text-steel">{item.reason}</p>}</li>)}</ol>}</div>}
        </article>;
      })}</div>}
    </section>
  </section>;
}

function Status({ status }: { status: string }) {
  const tone = status==="paid"?"bg-emerald-50 text-emerald-800":status==="rejected"||status==="reversed"?"bg-route/10 text-route":"bg-amber/15 text-amber-dim";
  return <span className={`w-fit px-3 py-1.5 text-[9px] font-semibold uppercase ${tone}`}>{status.replaceAll("_"," ")}</span>;
}

function AuditForm({ title, onSubmit, busy, button, placeholder, minLength=2 }: { title: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; button: string; placeholder: string; minLength?: number }) {
  return <form onSubmit={onSubmit} className="mt-4 grid gap-3 border border-asphalt/10 bg-[#f8f7f3] p-4"><p className="font-display text-lg font-bold">{title}</p><label className="text-xs font-semibold">Notes<textarea name="notes" required minLength={minLength} maxLength={minLength===5?500:1000} rows={3} className="mt-2 w-full min-w-0 border border-asphalt/20 p-3" placeholder={placeholder}/></label><button disabled={busy} aria-describedby={busy ? settlementBusyGuidanceId : undefined} title={busy ? settlementBusyReason : undefined} className="min-h-11 bg-asphalt px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{button}</button></form>;
}

import { useEffect, useState } from "react";
import {
  DriverEarningsSummary,
  DriverEarningsTrip,
  DriverPayoutStatus,
  getDriverEarnings,
} from "../services/driver-earnings.service";
import { formatEtb } from "../utils/currency";
import { HALLO_SMART_COMMISSION_PERCENT } from "../utils/commission";
import { CargoPlate } from "../components/ui/CargoPlate";

const payoutLabels: Record<DriverPayoutStatus, string> = {
  released: "Released",
  partial: "Partially released",
  held_escrow: "Held in escrow",
  initiated: "Verification pending",
  unpaid: "Awaiting payment",
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function PayoutCard({ trip, released }: { trip: DriverEarningsTrip; released: boolean }) {
  const grossReleased = released ? trip.releasedEtb : trip.partialReleasedEtb;

  return (
    <article className="border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold text-asphalt">{trip.trackingId}</p>
          <p className="mt-2 font-body text-xs leading-5 text-steel">
            {trip.pickup} → {trip.dropoff}
          </p>
        </div>
        <span className={`shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${released ? "bg-mint/20 text-emerald" : "bg-amber/10 text-amber-dim"}`}>
          {payoutLabels[trip.payoutStatus]}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
        <Amount label="Trip value" value={trip.invoiceEtb} />
        <Amount label={released ? "Gross released" : "Gross released so far"} value={grossReleased} />
        <Amount label={`HALLO Smart ${HALLO_SMART_COMMISSION_PERCENT}%`} value={trip.commissionEtb} />
        <Amount label="Driver net" value={trip.driverNetEtb} strong />
        {!released && <Amount label="Held in escrow" value={trip.heldEtb} />}
        {!released && <Amount label="Driver net balance" value={trip.remainingDriverNetEtb} strong />}
      </div>

      <div className="mt-4 border-t border-line pt-3 font-body text-[11px] leading-5 text-steel">
        {released ? (
          <p>Payout released: {when(trip.lastReleaseAt)}</p>
        ) : (
          <>
            <p>Delivered: {when(trip.deliveredAt)}</p>
            {trip.initiatedEtb > 0 && <p>Waiting verification: {formatEtb(trip.initiatedEtb)}</p>}
            {trip.remainingEtb > 0 && <p>Invoice balance before commission: {formatEtb(trip.remainingEtb)}</p>}
          </>
        )}
      </div>
    </article>
  );
}

function Amount({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <span className="block font-mono text-[10px] uppercase tracking-wide text-steel">{label}</span>
      <span className={`mt-1 block font-body ${strong ? "font-bold text-asphalt" : "text-steel"}`}>{formatEtb(value)}</span>
    </div>
  );
}

export function Earnings() {
  const [data, setData] = useState<DriverEarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDriverEarnings()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load earnings."));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-8">
        <span className="font-mono text-[10px] uppercase tracking-[.18em] text-route">Payment-linked earnings</span>
        <h1 className="mt-2 font-display text-3xl font-bold text-asphalt">Earnings</h1>
        <p className="mt-2 max-w-2xl font-body text-sm text-steel">
          Every released customer payment is split transparently: {HALLO_SMART_COMMISSION_PERCENT}% HALLO Smart platform commission and 98% driver net earnings.
        </p>
      </div>

      {error && (
        <p className="mb-6 border border-route/40 bg-route/5 px-4 py-3 font-body text-sm text-route">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <SummaryCard label="Released trips" value={String(data.releasedTrips)} />
            <SummaryCard label="Gross released" value={formatEtb(data.totalReleasedEtb)} />
            <SummaryCard label={`HALLO Smart ${HALLO_SMART_COMMISSION_PERCENT}%`} value={formatEtb(data.totalCommissionEtb)} accent="commission" />
            <SummaryCard label="Driver net earnings" value={formatEtb(data.totalDriverNetEtb)} accent="net" />
            <SummaryCard label="Pending trips" value={String(data.pendingTrips)} />
            <SummaryCard label="Driver net pending" value={formatEtb(data.pendingDriverBalanceEtb)} />
          </div>

          {data.partialReleasedEtb > 0 && (
            <div className="mt-4 border border-amber/30 bg-amber/10 p-4 text-xs text-amber-dim">
              Partially released customer payments included in the totals above: {formatEtb(data.partialReleasedEtb)}.
            </div>
          )}

          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-emerald">Payout ledger</p>
                <h2 className="mt-1 font-display text-xl font-bold text-asphalt">Released payouts</h2>
              </div>
              <span className="font-mono text-xs text-steel">{data.released.length} trips</span>
            </div>
            {data.released.length ? (
              <div className="space-y-4">
                {data.released.map((trip) => <PayoutCard key={trip.id} trip={trip} released />)}
              </div>
            ) : (
              <div className="border border-line bg-white p-6 font-body text-sm text-steel">No fully released payouts yet.</div>
            )}
          </section>

          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-amber-dim">Outstanding</p>
                <h2 className="mt-1 font-display text-xl font-bold text-asphalt">Pending payout</h2>
              </div>
              <span className="font-mono text-xs text-steel">{data.pending.length} trips</span>
            </div>
            {data.pending.length ? (
              <div className="space-y-4">
                {data.pending.map((trip) => <PayoutCard key={trip.id} trip={trip} released={false} />)}
              </div>
            ) : (
              <div className="border border-line bg-white p-6 font-body text-sm text-steel">No outstanding payout balance.</div>
            )}
          </section>
        </>
      )}

      <div className="mt-8 border border-line bg-white p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.16em] text-steel">How payout works</p>
        <p className="font-body text-xs leading-5 text-steel">
          Trip delivered → customer payment verified/held in escrow → Admin or Finance releases payment → HALLO Smart commission is calculated at {HALLO_SMART_COMMISSION_PERCENT}% → the remaining 98% is the driver net payout.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: "commission" | "net" }) {
  const className = accent === "commission"
    ? "border-amber bg-amber/10"
    : accent === "net"
      ? "border-emerald-700/30 bg-emerald-50"
      : "border-line bg-white";

  return (
    <div className={`border p-5 sm:p-6 ${className}`}>
      <span className="mb-3 block font-mono text-[10px] uppercase tracking-wide text-steel">{label}</span>
      {accent === "net" ? <CargoPlate size="lg">{value}</CargoPlate> : <span className="font-display text-xl font-bold text-asphalt sm:text-2xl">{value}</span>}
    </div>
  );
}

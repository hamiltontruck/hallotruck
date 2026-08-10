import { useEffect, useState } from "react";
import {
  DriverEarningsSummary,
  DriverEarningsTrip,
  DriverPayoutStatus,
  getDriverEarnings,
} from "../services/driver-earnings.service";
import { formatEtb } from "../utils/currency";
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
        <Amount label={released ? "Released" : "Released so far"} value={released ? trip.releasedEtb : trip.partialReleasedEtb} strong={released} />
        {!released && <Amount label="Held in escrow" value={trip.heldEtb} />}
        <Amount label="Balance" value={trip.remainingEtb} strong={!released} />
      </div>

      <div className="mt-4 border-t border-line pt-3 font-body text-[11px] leading-5 text-steel">
        {released ? (
          <p>Payout released: {when(trip.lastReleaseAt)}</p>
        ) : (
          <>
            <p>Delivered: {when(trip.deliveredAt)}</p>
            {trip.initiatedEtb > 0 && <p>Waiting verification: {formatEtb(trip.initiatedEtb)}</p>}
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
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8">
        <span className="font-mono text-[10px] uppercase tracking-[.18em] text-route">Payment-linked earnings</span>
        <h1 className="mt-2 font-display text-3xl font-bold text-asphalt">Earnings</h1>
        <p className="mt-2 max-w-xl font-body text-sm text-steel">
          See every delivered trip, what Finance has released, and any payout balance still pending.
        </p>
      </div>

      {error && (
        <p className="mb-6 border border-route/40 bg-route/5 px-4 py-3 font-body text-sm text-route">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-line bg-white p-5 sm:p-6">
              <span className="mb-3 block font-mono text-xs uppercase text-steel">Released trips</span>
              <span className="font-display text-3xl font-bold text-asphalt">{data.releasedTrips}</span>
            </div>
            <div className="border border-asphalt bg-white p-5 sm:p-6">
              <span className="mb-3 block font-mono text-xs uppercase text-steel">Total released</span>
              <CargoPlate size="lg">{formatEtb(data.totalReleasedEtb)}</CargoPlate>
            </div>
            <div className="border border-line bg-white p-5 sm:p-6">
              <span className="mb-3 block font-mono text-xs uppercase text-steel">Pending trips</span>
              <span className="font-display text-3xl font-bold text-asphalt">{data.pendingTrips}</span>
            </div>
            <div className="border border-line bg-white p-5 sm:p-6">
              <span className="mb-3 block font-mono text-xs uppercase text-steel">Pending balance</span>
              <span className="font-display text-xl font-bold text-asphalt">{formatEtb(data.pendingBalanceEtb)}</span>
              {data.partialReleasedEtb > 0 && (
                <span className="mt-2 block font-body text-[11px] text-steel">
                  Partial releases already received: {formatEtb(data.partialReleasedEtb)}
                </span>
              )}
            </div>
          </div>

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
              <div className="border border-line bg-white p-6 font-body text-sm text-steel">No released payouts yet.</div>
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
          Trip delivered → customer payment verified/held in escrow → Admin or Finance releases payment → the trip moves into Released payouts when its full invoice value has been released.
        </p>
      </div>
    </div>
  );
}

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
import { useDriverText } from "../i18n/driverTranslations";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function PayoutCard({ trip, released }: { trip: DriverEarningsTrip; released: boolean }) {
  const dt = useDriverText();
  const payoutLabels: Record<DriverPayoutStatus, string> = {
    released: dt("earn.status.released"),
    partial: dt("earn.status.partial"),
    held_escrow: dt("earn.status.held"),
    initiated: dt("earn.status.initiated"),
    unpaid: dt("earn.status.unpaid"),
  };
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
        <Amount label={dt("earn.tripValue")} value={trip.invoiceEtb} />
        <Amount label={released ? dt("earn.gross") : dt("earn.grossSoFar")} value={grossReleased} />
        <Amount label={dt("earn.commission")} value={trip.commissionEtb} />
        <Amount label={dt("earn.driverNet")} value={trip.driverNetEtb} strong />
        {!released && <Amount label={dt("earn.held")} value={trip.heldEtb} />}
        {!released && <Amount label={dt("earn.netBalance")} value={trip.remainingDriverNetEtb} strong />}
      </div>

      <div className="mt-4 border-t border-line pt-3 font-body text-[11px] leading-5 text-steel">
        {released ? (
          <p>{dt("earn.payoutReleased")}: {when(trip.lastReleaseAt)}</p>
        ) : (
          <>
            <p>{dt("earn.delivered")}: {when(trip.deliveredAt)}</p>
            {trip.initiatedEtb > 0 && <p>{dt("earn.waitingVerify")}: {formatEtb(trip.initiatedEtb)}</p>}
            {trip.remainingEtb > 0 && <p>{dt("earn.invoiceBalance")}: {formatEtb(trip.remainingEtb)}</p>}
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
  const dt = useDriverText();
  const [data, setData] = useState<DriverEarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDriverEarnings()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : dt("earn.error")));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="mb-8">
        <span className="font-mono text-[10px] uppercase tracking-[.18em] text-route">{dt("earn.kicker")}</span>
        <h1 className="mt-2 font-display text-3xl font-bold text-asphalt">{dt("earn.title")}</h1>
        <p className="mt-2 max-w-2xl font-body text-sm text-steel">{dt("earn.desc")}</p>
      </div>

      {error && (
        <p className="mb-6 border border-route/40 bg-route/5 px-4 py-3 font-body text-sm text-route">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <SummaryCard label={dt("earn.releasedTrips")} value={String(data.releasedTrips)} />
            <SummaryCard label={dt("earn.gross")} value={formatEtb(data.totalReleasedEtb)} />
            <SummaryCard label={dt("earn.commission")} value={formatEtb(data.totalCommissionEtb)} accent="commission" />
            <SummaryCard label={dt("earn.net")} value={formatEtb(data.totalDriverNetEtb)} accent="net" />
            <SummaryCard label={dt("earn.pendingTrips")} value={String(data.pendingTrips)} />
            <SummaryCard label={dt("earn.netPending")} value={formatEtb(data.pendingDriverBalanceEtb)} />
          </div>

          {data.partialReleasedEtb > 0 && (
            <div className="mt-4 border border-amber/30 bg-amber/10 p-4 text-xs text-amber-dim">
              {dt("earn.partialNotice")} {formatEtb(data.partialReleasedEtb)}.
            </div>
          )}

          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-emerald">{dt("earn.ledger")}</p>
                <h2 className="mt-1 font-display text-xl font-bold text-asphalt">{dt("earn.releasedPayouts")}</h2>
              </div>
              <span className="font-mono text-xs text-steel">{data.released.length} {dt("earn.trips")}</span>
            </div>
            {data.released.length ? (
              <div className="space-y-4">
                {data.released.map((trip) => <PayoutCard key={trip.id} trip={trip} released />)}
              </div>
            ) : (
              <div className="border border-line bg-white p-6 font-body text-sm text-steel">{dt("earn.noReleased")}</div>
            )}
          </section>

          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-amber-dim">{dt("earn.outstanding")}</p>
                <h2 className="mt-1 font-display text-xl font-bold text-asphalt">{dt("earn.pendingPayout")}</h2>
              </div>
              <span className="font-mono text-xs text-steel">{data.pending.length} {dt("earn.trips")}</span>
            </div>
            {data.pending.length ? (
              <div className="space-y-4">
                {data.pending.map((trip) => <PayoutCard key={trip.id} trip={trip} released={false} />)}
              </div>
            ) : (
              <div className="border border-line bg-white p-6 font-body text-sm text-steel">{dt("earn.noPending")}</div>
            )}
          </section>
        </>
      )}

      <div className="mt-8 border border-line bg-white p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.16em] text-steel">{dt("earn.how")}</p>
        <p className="font-body text-xs leading-5 text-steel">{dt("earn.howText")}</p>
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

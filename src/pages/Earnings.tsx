import { useCallback, useEffect, useState } from "react";
import {
  DriverEarningsSummary,
  DriverEarningsTrip,
  DriverPayoutStatus,
  getDriverEarnings,
} from "../services/driver-earnings.service";
import { formatEtb } from "../utils/currency";
import { CargoPlate } from "../components/ui/CargoPlate";
import { DriverRatingSummary } from "../components/driver/DriverRatingSummary";
import { DriverPaymentConfirmation } from "../components/driver/DriverPaymentConfirmation";
import { useDriverText } from "../i18n/driverTranslations";
import { useLanguage } from "../i18n/LanguageProvider";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function providerLabel(value: string | null) {
  if (!value) return "—";
  const labels: Record<string, string> = {
    cash_to_driver: "Cash",
    telebirr: "Telebirr",
    cbe: "Commercial Bank of Ethiopia",
    bank_of_abyssinia: "Bank of Abyssinia",
    awash_bank: "Awash Bank",
    dashen_bank: "Dashen Bank",
    coop_bank_oromia: "Cooperative Bank of Oromia",
    mpesa: "M-Pesa",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

const historyCopy = {
  en: {
    completed: "Completed trips",
    history: "Trip history",
    historyHelp: "Every trip you completed, its route, payment state and money earned.",
    accepted: "Accepted",
    delivered: "Delivered",
    vehicle: "Vehicle",
    distance: "Distance",
    cargo: "Cargo",
    payment: "Payment method",
    gross: "Trip amount",
    earned: "Money earned",
    pending: "Expected after release",
    noHistory: "No completed trips yet.",
  },
  om: {
    completed: "Imala xumurame",
    history: "Seenaa imalaa",
    historyHelp: "Imala ati xumurte hunda, daandii, haala kaffaltii fi maallaqa argatte.",
    accepted: "Fudhatame",
    delivered: "Geeffame",
    vehicle: "Konkolaataa",
    distance: "Fageenya",
    cargo: "Fe'umsa",
    payment: "Mala kaffaltii",
    gross: "Maallaqa imalaa",
    earned: "Maallaqa argatte",
    pending: "Release booda eegamu",
    noHistory: "Imalli xumurame amma hin jiru.",
  },
  am: {
    completed: "የተጠናቀቁ ጉዞዎች",
    history: "የጉዞ ታሪክ",
    historyHelp: "ያጠናቀቁት ጉዞ፣ መንገድ፣ የክፍያ ሁኔታ እና ያገኙት ገንዘብ።",
    accepted: "ተቀብሏል",
    delivered: "ደርሷል",
    vehicle: "ተሽከርካሪ",
    distance: "ርቀት",
    cargo: "ጭነት",
    payment: "የክፍያ ዘዴ",
    gross: "የጉዞ መጠን",
    earned: "የተገኘ ገንዘብ",
    pending: "ከመለቀቁ በኋላ የሚጠበቅ",
    noHistory: "ገና የተጠናቀቀ ጉዞ የለም።",
  },
} as const;

function TripHistoryCard({ trip, onPaymentChanged }: { trip: DriverEarningsTrip; onPaymentChanged: () => void }) {
  const dt = useDriverText();
  const { language } = useLanguage();
  const h = historyCopy[language];
  const payoutLabels: Record<DriverPayoutStatus, string> = {
    released: dt("earn.status.released"),
    partial: dt("earn.status.partial"),
    held_escrow: dt("earn.status.held"),
    initiated: dt("earn.status.initiated"),
    unpaid: dt("earn.status.unpaid"),
  };
  const releasedGross = trip.payoutStatus === "released" ? trip.releasedEtb : trip.partialReleasedEtb;
  const pendingNet = trip.remainingDriverNetEtb;

  return (
    <article className="border border-line bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CargoPlate>{trip.trackingId}</CargoPlate>
          <p className="mt-3 break-words font-body text-sm font-semibold text-asphalt">{trip.pickup} → {trip.dropoff}</p>
        </div>
        <span className={`shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${trip.payoutStatus === "released" ? "bg-mint/20 text-emerald" : "bg-amber/10 text-amber-dim"}`}>
          {payoutLabels[trip.payoutStatus]}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-4 text-xs sm:grid-cols-2">
        <Detail label={h.vehicle} value={trip.vehicleType} />
        <Detail label={h.distance} value={trip.distanceKm > 0 ? `${trip.distanceKm.toLocaleString()} km` : "—"} />
        <Detail label={h.cargo} value={trip.cargoDescription || "—"} />
        <Detail label={h.payment} value={providerLabel(trip.paymentProvider)} />
        <Detail label={h.accepted} value={when(trip.acceptedAt)} />
        <Detail label={h.delivered} value={when(trip.deliveredAt)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs sm:grid-cols-4">
        <Amount label={h.gross} value={trip.invoiceEtb} />
        <Amount label={dt("earn.grossSoFar")} value={releasedGross} />
        <Amount label={dt("earn.commission")} value={trip.commissionEtb} />
        <Amount label={h.earned} value={trip.driverNetEtb} strong />
      </div>

      {pendingNet > 0 && (
        <div className="mt-4 border border-amber/30 bg-amber/10 p-3 text-xs text-amber-dim">
          {h.pending}: <strong>{formatEtb(pendingNet)}</strong>
        </div>
      )}

      {trip.lastReleaseAt && (
        <p className="mt-3 font-body text-[11px] text-steel">{dt("earn.payoutReleased")}: {when(trip.lastReleaseAt)}</p>
      )}

      {trip.payoutStatus !== "released" && trip.heldEtb > 0 && (
        <div className="mt-5">
          <DriverPaymentConfirmation orderId={trip.id} showEmpty={false} onChanged={onPaymentChanged} />
        </div>
      )}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><span className="block font-mono text-[10px] uppercase tracking-wide text-steel">{label}</span><span className="mt-1 block break-words font-body text-asphalt">{value}</span></div>;
}

function Amount({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="block font-mono text-[10px] uppercase tracking-wide text-steel">{label}</span>
      <span className={`mt-1 block break-words font-body ${strong ? "font-bold text-asphalt" : "text-steel"}`}>{formatEtb(value)}</span>
    </div>
  );
}

export function Earnings() {
  const dt = useDriverText();
  const { language } = useLanguage();
  const h = historyCopy[language];
  const [data, setData] = useState<DriverEarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getDriverEarnings());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : dt("earn.error"));
    } finally {
      setLoading(false);
    }
  }, [dt]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-16">
      <div className="mb-8">
        <span className="font-mono text-[10px] uppercase tracking-[.18em] text-route">{dt("earn.kicker")}</span>
        <h1 className="mt-2 font-display text-3xl font-bold text-asphalt">{dt("earn.title")}</h1>
        <p className="mt-2 max-w-2xl font-body text-sm text-steel">{dt("earn.desc")}</p>
      </div>

      {error && <div className="mb-6 border border-route/40 bg-route/5 p-4"><p className="font-body text-sm text-route">{error}</p><button type="button" onClick={() => void load()} className="mt-3 bg-asphalt px-4 py-3 text-xs font-semibold text-white">{dt("jobs.refresh")}</button></div>}
      {loading && !data && <p className="font-body text-sm text-steel">{dt("jobs.loading")}</p>}

      <DriverRatingSummary />

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <SummaryCard label={h.completed} value={String(data.completedTrips)} />
            <SummaryCard label={dt("earn.releasedTrips")} value={String(data.releasedTrips)} />
            <SummaryCard label={dt("earn.gross")} value={formatEtb(data.totalReleasedEtb)} />
            <SummaryCard label={dt("earn.commission")} value={formatEtb(data.totalCommissionEtb)} accent="commission" />
            <SummaryCard label={dt("earn.net")} value={formatEtb(data.totalDriverNetEtb)} accent="net" />
            <SummaryCard label={dt("earn.netPending")} value={formatEtb(data.pendingDriverBalanceEtb)} />
          </div>

          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-emerald">{dt("earn.ledger")}</p>
                <h2 className="mt-1 font-display text-xl font-bold text-asphalt">{h.history}</h2>
                <p className="mt-1 font-body text-xs text-steel">{h.historyHelp}</p>
              </div>
              <span className="font-mono text-xs text-steel">{data.trips.length} {dt("earn.trips")}</span>
            </div>
            {data.trips.length ? (
              <div className="space-y-4">
                {data.trips.map((trip) => <TripHistoryCard key={trip.id} trip={trip} onPaymentChanged={() => void load()} />)}
              </div>
            ) : (
              <div className="border border-line bg-white p-6 font-body text-sm text-steel">{h.noHistory}</div>
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
    <div className={`min-w-0 border p-4 sm:p-6 ${className}`}>
      <span className="mb-3 block font-mono text-[10px] uppercase tracking-wide text-steel">{label}</span>
      {accent === "net" ? <CargoPlate size="lg">{value}</CargoPlate> : <span className="break-words font-display text-lg font-bold text-asphalt sm:text-2xl">{value}</span>}
    </div>
  );
}

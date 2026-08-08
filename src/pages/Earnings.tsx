import { useEffect, useState } from "react";
import { getEarnings } from "../services/driver.service";
import { formatEtb } from "../utils/currency";
import { CargoPlate } from "../components/ui/CargoPlate";

export function Earnings() {
  const [data, setData] = useState<{ totalTrips: number; totalEtb: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEarnings()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="mb-8">
        <span className="font-mono text-[10px] uppercase tracking-[.18em] text-route">Payment-linked earnings</span>
        <h1 className="font-display font-bold text-3xl text-asphalt mt-2">Earnings</h1>
        <p className="font-body text-sm text-steel mt-2 max-w-xl">
          Delivered trips appear here after the verified customer payment is released from escrow.
        </p>
      </div>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-line bg-white p-6">
            <span className="font-mono text-xs uppercase text-steel block mb-3">Released trips</span>
            <span className="font-display font-bold text-3xl text-asphalt">{data.totalTrips}</span>
          </div>
          <div className="border border-asphalt bg-white p-6">
            <span className="font-mono text-xs uppercase text-steel block mb-3">Total released</span>
            <CargoPlate size="lg">{formatEtb(data.totalEtb)}</CargoPlate>
          </div>
        </div>
      )}

      <div className="mt-6 border border-line bg-white p-4">
        <p className="font-mono text-[10px] uppercase tracking-[.16em] text-steel mb-2">How payout works</p>
        <p className="font-body text-xs leading-5 text-steel">
          Trip delivered → payment verified/held in escrow → Admin or Finance releases payment → earnings total updates here.
        </p>
      </div>
    </div>
  );
}

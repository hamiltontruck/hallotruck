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
      <h1 className="font-display font-bold text-3xl text-asphalt mb-8">Earnings</h1>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-line bg-white p-6">
            <span className="font-mono text-xs uppercase text-steel block mb-3">Completed trips</span>
            <span className="font-display font-bold text-3xl text-asphalt">{data.totalTrips}</span>
          </div>
          <div className="border border-asphalt bg-white p-6">
            <span className="font-mono text-xs uppercase text-steel block mb-3">Total paid out</span>
            <CargoPlate size="lg">{formatEtb(data.totalEtb)}</CargoPlate>
          </div>
        </div>
      )}

      <p className="font-body text-xs text-steel mt-6">
        Only trips where payment has been released from escrow are counted here.
      </p>
    </div>
  );
}

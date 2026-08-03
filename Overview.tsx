import { useEffect, useState } from "react";
import { getKpiSummary, getActiveFleet, KpiSummary, FleetPosition } from "../services/admin.service";
import { formatEtb } from "../utils/currency";
import { CargoPlate } from "../components/ui/CargoPlate";
import { FleetMap } from "../components/fleet/FleetMap";

export function Overview() {
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [fleet, setFleet] = useState<FleetPosition[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getKpiSummary()
      .then(setKpi)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    function loadFleet() {
      getActiveFleet()
        .then(setFleet)
        .catch((err) => setError(err.message));
    }
    loadFleet();
    const interval = setInterval(loadFleet, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-10">
      <h1 className="font-display font-bold text-3xl text-asphalt mb-8">Overview</h1>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {kpi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="border border-line bg-white p-6">
            <span className="font-mono text-xs uppercase text-steel block mb-3">Total orders</span>
            <span className="font-display font-bold text-3xl text-asphalt">{kpi.totalOrders}</span>
          </div>
          <div className="border border-line bg-white p-6">
            <span className="font-mono text-xs uppercase text-steel block mb-3">Active now</span>
            <span className="font-display font-bold text-3xl text-route">{kpi.activeOrders}</span>
          </div>
          <div className="border border-line bg-white p-6">
            <span className="font-mono text-xs uppercase text-steel block mb-3">Delivered today</span>
            <span className="font-display font-bold text-3xl text-asphalt">{kpi.deliveredToday}</span>
          </div>
          <div className="border border-asphalt bg-white p-6">
            <span className="font-mono text-xs uppercase text-steel block mb-3">Revenue released</span>
            <CargoPlate size="lg">{formatEtb(kpi.revenueEtb)}</CargoPlate>
          </div>
        </div>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg text-asphalt">Live fleet</h2>
          <span className="font-mono text-xs text-steel">{fleet.length} on the road</span>
        </div>
        <div className="h-96 border border-line">
          <FleetMap trucks={fleet} />
        </div>
      </div>
    </div>
  );
}

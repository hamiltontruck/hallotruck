import { useEffect, useState } from "react";
import { getAllOrders, AdminOrder } from "../services/admin.service";
import { formatEtb, formatKm } from "../utils/currency";
import { CargoPlate } from "../components/ui/CargoPlate";

const STATUS_FILTERS = ["all", "placed", "accepted", "in_transit", "delivered", "cancelled"] as const;

export function Orders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAllOrders(filter === "all" ? undefined : filter)
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="p-10">
      <h1 className="font-display font-bold text-3xl text-asphalt mb-6">Orders</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-xs uppercase px-3 py-1.5 border ${
              filter === f ? "border-route text-route" : "border-line text-steel"
            }`}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <p className="font-body text-steel">Loading…</p>
      ) : (
        <div className="border border-line bg-white overflow-x-auto">
          <table className="w-full font-body text-sm">
            <thead>
              <tr className="border-b border-line text-left text-steel font-mono text-xs uppercase">
                <th className="p-4">Tracking ID</th>
                <th className="p-4">Route</th>
                <th className="p-4">Status</th>
                <th className="p-4">Payment</th>
                <th className="p-4 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="p-4">
                    <CargoPlate size="sm">{o.tracking_id}</CargoPlate>
                  </td>
                  <td className="p-4 text-asphalt">
                    {o.pickup_address} → {o.dropoff_address}
                    <div className="font-mono text-xs text-steel">{formatKm(o.distance_km)}</div>
                  </td>
                  <td className="p-4 capitalize text-asphalt">{o.status.replace("_", " ")}</td>
                  <td className="p-4 capitalize text-steel">{o.payment_status.replace("_", " ")}</td>
                  <td className="p-4 text-right font-mono text-asphalt">{formatEtb(o.price_etb)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-steel font-body">
                    No orders match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

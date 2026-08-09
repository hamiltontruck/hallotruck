import { useEffect, useMemo, useState } from "react";
import { CustomerLiveTripMap } from "../tracking/CustomerLiveTripMap";
import { AdminOperationsControl } from "./AdminOperationsControl";
import { supabase } from "../../services/supabase.client";
import type { AdminOrder, Driver, Truck } from "../../services/admin.service";

interface AdminLiveTripsPanelProps {
  orders: AdminOrder[];
  trucks: Truck[];
  drivers: Driver[];
  onManage: (order: AdminOrder) => void;
}

export function AdminLiveTripsPanel({ orders, trucks, drivers }: AdminLiveTripsPanelProps) {
  const activeOrders = useMemo(
    () => orders.filter((order) => ["accepted", "in_transit"].includes(order.status)),
    [orders],
  );
  const [selectedId, setSelectedId] = useState(activeOrders[0]?.id ?? "");
  const [controlOrderId, setControlOrderId] = useState("");
  const [totalDistanceKm, setTotalDistanceKm] = useState<number | null>(null);

  useEffect(() => {
    if (!activeOrders.length) {
      setSelectedId("");
      return;
    }
    if (!activeOrders.some((order) => order.id === selectedId)) {
      setSelectedId(activeOrders[0].id);
    }
  }, [activeOrders, selectedId]);

  const selected = activeOrders.find((order) => order.id === selectedId) ?? activeOrders[0] ?? null;
  const controlOrder = controlOrderId ? orders.find((order) => order.id === controlOrderId) ?? null : null;

  useEffect(() => {
    let cancelled = false;
    async function loadDistance() {
      if (!selected) {
        setTotalDistanceKm(null);
        return;
      }
      const { data, error } = await supabase
        .from("orders")
        .select("distance_km")
        .eq("id", selected.id)
        .single();
      if (cancelled) return;
      if (error) {
        setTotalDistanceKm(null);
        return;
      }
      const value = Number(data?.distance_km ?? 0);
      setTotalDistanceKm(value > 0 ? value : null);
    }
    void loadDistance();
    return () => { cancelled = true; };
  }, [selected]);

  if (!activeOrders.length) {
    return (
      <div className="border border-asphalt/10 bg-white p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">✓</div>
        <h2 className="mt-4 font-display text-xl font-semibold">No active trips right now</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-steel">
          A trip appears here automatically after a driver accepts a load. GPS, remaining distance and ETA update while the trip is active.
        </p>
      </div>
    );
  }

  const selectedTruck = selected?.truck_id ? trucks.find((truck) => truck.id === selected.truck_id) : undefined;
  const selectedDriver = selected?.driver_id ? drivers.find((driver) => driver.id === selected.driver_id) : undefined;

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border border-asphalt/10 bg-white">
          <div className="border-b border-asphalt/10 p-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Active trips</h2>
              <span className="font-mono text-xs text-emerald-700">{activeOrders.length} live</span>
            </div>
            <p className="mt-1 text-xs text-steel">Select a shipment to follow its latest GPS position.</p>
          </div>
          <div className="divide-y divide-asphalt/10">
            {activeOrders.map((order) => {
              const truck = order.truck_id ? trucks.find((item) => item.id === order.truck_id) : undefined;
              const driver = order.driver_id ? drivers.find((item) => item.id === order.driver_id) : undefined;
              const selectedOrder = order.id === selected?.id;
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedId(order.id)}
                  className={`w-full p-4 text-left transition sm:px-6 ${selectedOrder ? "bg-amber/10" : "hover:bg-bone"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-semibold">{order.tracking_id}</span>
                    <span className="text-[10px] font-semibold capitalize text-emerald-700">{order.status.replace("_", " ")}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{order.pickup_address} → {order.dropoff_address}</p>
                  <p className="mt-2 text-[11px] text-steel">
                    {truck?.plate_number ?? order.vehicle_type} · {driver?.full_name ?? driver?.phone ?? "Driver assigned"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <div className="min-w-0 border border-asphalt/10 bg-white p-4 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-asphalt/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-xs text-amber-dim">{selected.tracking_id}</p>
                <h2 className="mt-1 font-display text-xl font-semibold">{selected.pickup_address} → {selected.dropoff_address}</h2>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-steel">
                  <span>Truck: <strong className="text-asphalt">{selectedTruck?.plate_number ?? selected.vehicle_type}</strong></span>
                  <span>Driver: <strong className="text-asphalt">{selectedDriver?.full_name ?? selectedDriver?.phone ?? "Assigned driver"}</strong></span>
                  <span>Status: <strong className="capitalize text-asphalt">{selected.status.replace("_", " ")}</strong></span>
                </div>
              </div>
              <button type="button" onClick={() => setControlOrderId(selected.id)} className="shrink-0 bg-asphalt px-4 py-2.5 text-xs font-semibold text-white">
                Operations control
              </button>
            </div>
            <CustomerLiveTripMap orderId={selected.id} totalDistanceKm={totalDistanceKm} />
          </div>
        )}
      </div>

      {controlOrder && (
        <AdminOperationsControl
          order={controlOrder}
          allOrders={orders}
          trucks={trucks}
          drivers={drivers}
          onClose={() => setControlOrderId("")}
        />
      )}
    </>
  );
}

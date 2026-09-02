import { useEffect, useMemo, useState } from "react";
import { CustomerLiveTripMap } from "../tracking/CustomerLiveTripMap";
import { AdminOperationsControl } from "./AdminOperationsControl";
import { AdminDispatchMatchModal } from "./AdminDispatchMatchModal";
import { AdminPaymentCollectionControl } from "./AdminPaymentCollectionControl";
import { supabase } from "../../services/supabase.client";
import type { AdminOrder, Driver, Truck } from "../../services/admin.service";
import { splitHalloCommission, HALLO_SMART_COMMISSION_PERCENT } from "../../utils/commission";

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
  const [dispatchOrderId, setDispatchOrderId] = useState("");
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
  const dispatchOrder = dispatchOrderId ? orders.find((order) => order.id === dispatchOrderId) ?? null : null;

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

  const selectedTruck = selected?.truck_id
    ? trucks.find((truck) => truck.id === selected.truck_id)
    : undefined;
  const selectedDriver = selected?.driver_id
    ? drivers.find((driver) => driver.id === selected.driver_id)
    : undefined;
  const selectedSplit = splitHalloCommission(Number(selected?.price_etb ?? 0));

  return (
    <>
      <AdminPaymentCollectionControl orders={orders} onOpenControl={setControlOrderId} />

      {activeOrders.length ? (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-2xl border border-asphalt/10 bg-white">
            <div className="border-b border-asphalt/10 p-5 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">Active trips</h2>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-mono text-[10px] font-semibold text-emerald-700">{activeOrders.length} LIVE</span>
              </div>
              <p className="mt-1 text-xs text-steel">Select a shipment to follow GPS, status and financial split.</p>
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
                    {order.cargo_description && <p className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-dim">{order.cargo_description}</p>}
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <div className="min-w-0 overflow-hidden rounded-2xl border border-asphalt/10 bg-white">
              <div className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 border-b border-asphalt/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-amber-dim">{selected.tracking_id}</p>
                    <h2 className="mt-1 font-display text-xl font-semibold">{selected.pickup_address} → {selected.dropoff_address}</h2>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-steel">
                      <span>Truck: <strong className="text-asphalt">{selectedTruck?.plate_number ?? selected.vehicle_type}</strong></span>
                      <span>Driver: <strong className="text-asphalt">{selectedDriver?.full_name ?? selectedDriver?.phone ?? "Assigned driver"}</strong></span>
                      <span>Status: <strong className="capitalize text-asphalt">{selected.status.replace("_", " ")}</strong></span>
                      {selected.cargo_description && <span>Load: <strong className="text-asphalt">{selected.cargo_description}</strong></span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setControlOrderId(selected.id)}
                    className="min-h-11 shrink-0 rounded-xl bg-asphalt px-4 py-2.5 text-xs font-semibold text-white"
                  >
                    Operations control
                  </button>
                </div>

                <section className="my-5 grid grid-cols-3 gap-3">
                  <FinanceMetric label="Order value" value={selectedSplit.grossEtb} />
                  <FinanceMetric label={`HALLO ${HALLO_SMART_COMMISSION_PERCENT}%`} value={selectedSplit.commissionEtb} accent="commission" />
                  <FinanceMetric label="Driver net" value={selectedSplit.driverNetEtb} accent="net" />
                </section>

                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">LIVE OPERATIONS MAP</p>
                    <p className="mt-1 text-xs text-steel">Latest GPS, remaining distance, speed, ETA and trip progress.</p>
                  </div>
                  <span className="flex items-center gap-2 text-[10px] font-semibold text-emerald-700"><i className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" /> TRACKING</span>
                </div>

                <CustomerLiveTripMap
                  orderId={selected.id}
                  totalDistanceKm={totalDistanceKm}
                  showCustomerDetailsLink={false}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-asphalt/10 bg-white p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">✓</div>
          <h2 className="mt-4 font-display text-xl font-semibold">No active trips right now</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-steel">
            A trip appears here automatically after Admin assigns an eligible driver and the driver starts sharing GPS.
          </p>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-asphalt/10 bg-white">
        <div className="flex items-center justify-between border-b border-asphalt/10 p-5 sm:px-6">
          <div>
            <h2 className="font-display text-lg font-semibold">Recent operations</h2>
            <p className="mt-1 text-xs text-steel">Placed orders use smart nearest-driver matching. Assigned and completed orders open full operations control.</p>
          </div>
          <span className="font-mono text-xs text-steel">{Math.min(orders.length, 8)} shown</span>
        </div>

        {orders.length ? (
          <div className="divide-y divide-asphalt/10">
            {orders.slice(0, 8).map((order) => {
              const truck = order.truck_id ? trucks.find((item) => item.id === order.truck_id) : undefined;
              const driver = order.driver_id ? drivers.find((item) => item.id === order.driver_id) : undefined;
              const placed = order.status === "placed";

              return (
                <div key={order.id} className="grid gap-3 p-4 sm:grid-cols-[120px_1fr_auto] sm:items-center sm:px-6">
                  <div>
                    <p className="font-mono text-xs font-semibold">{order.tracking_id}</p>
                    <span className={`mt-1 inline-block text-[10px] font-semibold capitalize ${placed ? "text-amber-dim" : "text-emerald-700"}`}>{order.status.replace("_", " ")}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{order.pickup_address} → {order.dropoff_address}</p>
                    <p className="mt-1 text-xs text-steel">{truck?.plate_number ?? order.vehicle_type} · {driver?.full_name ?? driver?.phone ?? "Unassigned"}</p>
                    {order.cargo_description && <p className="mt-1 text-[11px] font-semibold text-amber-dim">Load: {order.cargo_description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => placed ? setDispatchOrderId(order.id) : setControlOrderId(order.id)}
                    className={`min-h-11 rounded-xl px-4 py-2.5 text-xs font-semibold ${placed ? "bg-emerald-700 text-white" : "border border-asphalt text-asphalt"}`}
                  >
                    {placed ? "Find nearest driver" : "Open control"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : <p className="p-6 text-sm text-steel">No orders yet.</p>}
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

      {dispatchOrder && (
        <AdminDispatchMatchModal
          order={dispatchOrder}
          onClose={() => setDispatchOrderId("")}
          onAssigned={() => window.location.reload()}
        />
      )}
    </>
  );
}

function FinanceMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "commission" | "net";
}) {
  const className = accent === "commission"
    ? "border-amber/35 bg-amber/10"
    : accent === "net"
      ? "border-emerald-200 bg-emerald-50"
      : "border-asphalt/10 bg-bone";

  return (
    <div className={`min-w-0 rounded-xl border p-3 sm:p-4 ${className}`}>
      <p className="truncate font-mono text-[8px] uppercase tracking-wider text-steel sm:text-[9px]">{label}</p>
      <p className="mt-2 truncate font-display text-sm font-bold text-asphalt sm:text-lg">ETB {value.toLocaleString()}</p>
    </div>
  );
}

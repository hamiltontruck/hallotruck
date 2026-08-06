import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { calculateQuote, createCustomerOrder, getCustomerPortalData, openCustomerProof, type CustomerPortalData } from "../services/customer.service";
import { supabase } from "../services/supabase.client";
import { CustomerQuoteMap, type QuotePoints } from "../components/navigation/CustomerQuoteMap";

const emptyData: CustomerPortalData = { orders: [], proofs: [] };

export function CustomerPortal() {
  const navigate = useNavigate();
  const [data, setData] = useState(emptyData);
  const [showOrder, setShowOrder] = useState(false);
  const [routePoints, setRoutePoints] = useState<QuotePoints | null>(null);
  const distance = routePoints?.distanceKm ?? 0;
  const [vehicle, setVehicle] = useState("Dry Cargo");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const quote = useMemo(() => distance ? calculateQuote(distance, vehicle) : 0, [distance, vehicle]);
  const updateRoute = useCallback((points: QuotePoints | null) => setRoutePoints(points), []);

  async function load() {
    try {
      setData(await getCustomerPortalData());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load customer orders.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase.channel("customer-portal").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (!routePoints) throw new Error("Select pickup and drop-off points on the map.");
      await createCustomerOrder({
        pickupAddress: String(form.get("pickup")),
        dropoffAddress: String(form.get("dropoff")),
        vehicleType: vehicle,
        distanceKm: distance,
        pickup: routePoints.pickup,
        dropoff: routePoints.dropoff,
      });
      setShowOrder(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order could not be created.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone text-asphalt">
      <header className="border-b border-asphalt/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div>
            <p className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></p>
            <p className="font-mono text-[9px] tracking-[.22em] text-emerald-700">CUSTOMER SMART PORTAL</p>
          </div>
          <button onClick={() => setShowOrder(true)} className="bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">+ New order</button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-9">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs tracking-[.2em] text-amber-dim">MY LOGISTICS</p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Orders & tracking</h1>
            <p className="mt-2 text-sm text-steel">Book transport and follow every delivery milestone.</p>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); navigate("/", { replace: true }); }} className="self-start text-sm text-route">Sign out</button>
        </div>

        {error && <p className="mt-6 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}
        {busy && !data.orders.length ? <p className="py-16 text-center font-mono text-sm text-steel">Loading shipments…</p> :
          <div className="mt-8 grid gap-4">
            {data.orders.length === 0 && <div className="border border-asphalt/10 bg-white p-10 text-center"><p className="font-display text-xl font-semibold">No orders yet</p><p className="mt-2 text-sm text-steel">Create your first smart transport request.</p></div>}
            {data.orders.map((order) => {
              const proof = data.proofs.find((item) => item.order_id === order.id);
              return <article key={order.id} className="border border-asphalt/10 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-mono text-sm font-semibold">{order.tracking_id}</p><p className="mt-2 text-sm">{order.pickup_address} <span className="text-steel">→</span> {order.dropoff_address}</p></div>
                  <span className="bg-amber/15 px-3 py-2 text-xs font-semibold capitalize text-amber-dim">{order.status.replace("_", " ")}</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-asphalt/10 pt-5 text-sm sm:grid-cols-4">
                  <Info label="Quote" value={`ETB ${Number(order.price_etb ?? 0).toLocaleString()}`} />
                  <Info label="Distance" value={order.distance_km ? `${order.distance_km} km` : "Pending"} />
                  <Info label="Payment" value={order.payment_status.replace("_", " ")} />
                  <Info label="Vehicle" value={order.vehicle_type} />
                </div>
                {proof && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 bg-emerald-50 p-4 text-sm"><span>Delivered to <strong>{proof.recipient_name}</strong></span><div className="flex gap-4"><button onClick={() => void openCustomerProof(proof.photo_path)} className="font-semibold text-emerald-800">Photo</button><button onClick={() => void openCustomerProof(proof.signature_path)} className="font-semibold text-emerald-800">Signature</button></div></div>}
              </article>;
            })}
          </div>}
      </section>

      {showOrder && <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-4">
        <form onSubmit={create} className="max-h-[94vh] w-full max-w-xl overflow-y-auto bg-white p-6 sm:p-8">
          <div className="flex justify-between"><div><p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">SMART QUOTE</p><h2 className="mt-2 font-display text-2xl font-bold">New transport order</h2></div><button type="button" onClick={() => setShowOrder(false)} className="text-2xl">×</button></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field name="pickup" label="Pickup address" placeholder="Addis Ababa" />
            <Field name="dropoff" label="Drop-off address" placeholder="Djibouti" />
            <label className="text-sm">Vehicle<select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-2 block w-full border border-line bg-white px-4 py-3"><option>Pickup</option><option>Van</option><option>Dry Cargo</option><option>Refrigerated</option><option>Trailer</option></select></label>
            <div className="flex items-end border border-line bg-bone px-4 py-3"><div><p className="text-xs text-steel">Estimated road distance</p><p className="mt-1 font-mono font-semibold">{distance ? `${distance} km` : "Select map points"}</p></div></div>
          </div>
          <div className="mt-5"><CustomerQuoteMap onChange={updateRoute} /></div>
          <div className="mt-6 bg-asphalt p-5 text-white"><p className="font-mono text-[10px] tracking-widest text-white/45">ESTIMATED SMART QUOTE</p><p className="mt-2 font-display text-3xl font-bold text-amber">{quote ? `ETB ${quote.toLocaleString()}` : "Select route"}</p><p className="mt-2 text-xs text-white/45">Final price is confirmed after route verification.</p></div>
          <button disabled={busy || !routePoints} className="mt-5 w-full bg-emerald-700 py-4 font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Confirm & create order"}</button>
        </form>
      </div>}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-steel">{label}</p><p className="mt-1 font-semibold capitalize">{value}</p></div>; }
function Field({ name, label, placeholder }: { name: string; label: string; placeholder: string }) { return <label className="text-sm">{label}<input required name={name} placeholder={placeholder} className="mt-2 block w-full border border-line px-4 py-3" /></label>; }

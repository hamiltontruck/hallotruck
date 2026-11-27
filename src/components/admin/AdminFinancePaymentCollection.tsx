import { useEffect, useState } from "react";
import { getDashboardData } from "../../services/admin.service";
import { AdminOperationsControl } from "./AdminOperationsControl";
import { AdminPaymentCollectionControl } from "./AdminPaymentCollectionControl";

export function AdminFinancePaymentCollection() {
  const [open, setOpen] = useState(false);

  return <section className="mt-5">
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className="min-h-11 border border-asphalt bg-white px-4 text-sm font-semibold"
    >
      {open ? "Hide payment collection" : "Open payment collection"}
    </button>
    {open && <PaymentCollection />}
  </section>;
}

function PaymentCollection() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboardData>> | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    void getDashboardData().then((result) => {
      if (!cancelled) setData(result);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Payment collection could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [attempt]);

  if (error) return <div role="alert" className="mt-3 text-sm text-route">
    <p>{error}</p>
    <button type="button" className="min-h-11 underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
  </div>;
  if (!data) return <p role="status" className="mt-3 text-sm text-steel">Loading payment collection…</p>;

  const selected = data.orders.find((order) => order.id === selectedId);
  return <div className="mt-3">
    <AdminPaymentCollectionControl orders={data.orders} onOpenControl={setSelectedId} />
    {selected && <AdminOperationsControl
      order={selected}
      allOrders={data.orders}
      trucks={data.trucks}
      drivers={data.drivers}
      onClose={() => setSelectedId("")}
    />}
  </div>;
}

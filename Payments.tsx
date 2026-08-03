import { useEffect, useState } from "react";
import { getPaymentLog, PaymentLogRow } from "../services/admin.service";
import { formatEtb } from "../utils/currency";

const EVENT_STYLE: Record<string, string> = {
  initiated: "text-steel",
  held_escrow: "text-amber-dim",
  released: "text-route",
  refunded: "text-steel",
  failed: "text-steel",
};

export function Payments() {
  const [rows, setRows] = useState<PaymentLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPaymentLog()
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-10">
      <h1 className="font-display font-bold text-3xl text-asphalt mb-6">Payments & escrow</h1>

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
                <th className="p-4">Order</th>
                <th className="p-4">Provider</th>
                <th className="p-4">Event</th>
                <th className="p-4">Time</th>
                <th className="p-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="p-4 font-mono text-xs text-asphalt">{r.order_id.slice(0, 8)}…</td>
                  <td className="p-4 capitalize text-asphalt">{r.provider}</td>
                  <td className={`p-4 capitalize font-semibold ${EVENT_STYLE[r.event] ?? "text-asphalt"}`}>
                    {r.event.replace("_", " ")}
                  </td>
                  <td className="p-4 text-steel">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-4 text-right font-mono text-asphalt">{formatEtb(r.amount_etb)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-steel font-body">
                    No payment events yet.
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

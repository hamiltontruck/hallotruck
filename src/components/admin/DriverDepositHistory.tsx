import { FormEvent, useState } from "react";
import { formatEtb } from "../../utils/currency";

export interface DriverDepositHistoryItem {
  id: string;
  driver_id: string;
  amount_etb: number | string;
  reference: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

export function DriverDepositHistory({
  deposits,
  busyDepositId = "",
  onReverse,
}: {
  deposits: DriverDepositHistoryItem[];
  busyDepositId?: string;
  onReverse: (depositId: string, reason: string) => Promise<void>;
}) {
  const [selectedDepositId, setSelectedDepositId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function submitReversal(event: FormEvent<HTMLFormElement>, depositId: string) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      setError("Enter a reversal reason of at least 5 characters.");
      return;
    }

    setError("");
    try {
      await onReverse(depositId, cleanReason);
      setSelectedDepositId("");
      setReason("");
    } catch (reversalError) {
      setError(reversalError instanceof Error ? reversalError.message : "Deposit reversal failed.");
    }
  }

  if (deposits.length === 0) {
    return <p className="mt-4 text-sm text-steel">No deposits recorded.</p>;
  }

  return <div className="mt-4 space-y-3">
    {deposits.slice(0, 10).map((deposit) => {
      const active = deposit.status === "active";
      const reversing = selectedDepositId === deposit.id;
      return <article key={deposit.id} data-deposit-id={deposit.id} className="border border-asphalt/10 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <strong>{formatEtb(Number(deposit.amount_etb) || 0)}</strong>
          <span className={`px-2 py-1 text-[10px] font-semibold uppercase ${active ? "bg-emerald-50 text-emerald-800" : "bg-route/10 text-route"}`}>
            {deposit.status}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-steel">{new Date(deposit.created_at).toLocaleString()}</p>
        {deposit.reference && <p className="mt-1 break-words text-xs">Ref: {deposit.reference}</p>}
        {deposit.note && <p className="mt-1 whitespace-pre-line break-words text-xs text-steel">{deposit.note}</p>}

        {active && !reversing && (
          <button
            type="button"
            onClick={() => { setSelectedDepositId(deposit.id); setReason(""); setError(""); }}
            className="mt-3 w-full border border-route px-3 py-2 text-xs font-semibold text-route sm:w-auto"
          >
            Reverse deposit
          </button>
        )}

        {active && reversing && (
          <form data-reversal-form="true" onSubmit={(event) => void submitReversal(event, deposit.id)} className="mt-3 border border-route/25 bg-route/5 p-3">
            <p className="text-xs font-semibold text-route">Confirm deposit reversal</p>
            <p className="mt-1 text-[11px] leading-5 text-steel">The deposit will stop covering commission and the driver will be notified. This action remains in the audit history.</p>
            <label className="mt-3 block text-xs font-semibold">
              Reversal reason
              <textarea
                required
                minLength={5}
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-2 w-full border border-route/30 bg-white p-3 text-sm outline-none focus:border-route"
              />
            </label>
            {error && <p className="mt-2 text-xs font-semibold text-route">{error}</p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button disabled={busyDepositId === deposit.id} className="bg-route px-3 py-3 text-xs font-semibold text-white disabled:opacity-40">
                {busyDepositId === deposit.id ? "Reversing…" : "Confirm reversal"}
              </button>
              <button
                type="button"
                disabled={busyDepositId === deposit.id}
                onClick={() => { setSelectedDepositId(""); setReason(""); setError(""); }}
                className="border border-asphalt/20 px-3 py-3 text-xs font-semibold disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </article>;
    })}
  </div>;
}

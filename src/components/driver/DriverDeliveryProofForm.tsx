import { FormEvent, PointerEvent, useRef, useState } from "react";
import { submitDeliveryProof } from "../../services/delivery-proof.service";
import { Button } from "../ui/Button";

export function DriverDeliveryProofForm({
  orderId,
  onDelivered,
}: {
  orderId: string;
  onDelivered: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const target = canvas.current!;
    const rect = target.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (target.width / rect.width),
      y: (event.clientY - rect.top) * (target.height / rect.height),
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = canvas.current?.getContext("2d");
    const p = point(event);
    context?.beginPath();
    context?.moveTo(p.x, p.y);
    setSigned(true);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvas.current?.getContext("2d");
    const p = point(event);
    if (!context) return;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#1d222a";
    context.lineTo(p.x, p.y);
    context.stroke();
  }

  function stop() {
    drawing.current = false;
  }

  function clear() {
    const target = canvas.current;
    target?.getContext("2d")?.clearRect(0, 0, target.width, target.height);
    setSigned(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const recipientName = String(form.get("recipientName") ?? "").trim();
    const deliveryNote = String(form.get("deliveryNote") ?? "");
    const photo = form.get("photo");

    if (recipientName.length < 2) {
      setError("Enter the recipient's name.");
      return;
    }
    if (!(photo instanceof File) || !photo.size) {
      setError("Delivery photo is required.");
      return;
    }
    if (!signed || !canvas.current) {
      setError("Recipient signature is required.");
      return;
    }

    const signature = await new Promise<Blob | null>((resolve) =>
      canvas.current?.toBlob(resolve, "image/png"),
    );
    if (!signature) {
      setError("Could not save the recipient signature.");
      return;
    }

    setSaving(true);
    try {
      await submitDeliveryProof({
        orderId,
        recipientName,
        deliveryNote,
        photo,
        signature,
      });
      onDelivered();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete delivery.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-2 border-emerald-700/30 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-700">
            Proof of delivery
          </p>
          <h2 className="font-display text-xl font-semibold text-asphalt mt-2">
            Confirm the handover
          </h2>
          <p className="font-body text-xs text-steel mt-1">
            Photo and recipient signature are required before this trip can be completed.
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase text-emerald-700">Required</span>
      </div>

      {error && (
        <p className="font-body text-xs text-route border border-route/30 bg-route/5 px-3 py-3 mt-4">
          {error}
        </p>
      )}

      <label className="block font-body text-xs font-semibold text-asphalt mt-5">
        Received by
        <input
          name="recipientName"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className="block w-full border border-line bg-white px-4 py-3 mt-2 font-normal outline-none focus:border-amber"
          placeholder="Recipient full name"
        />
      </label>

      <label className="block font-body text-xs font-semibold text-asphalt mt-4">
        Delivery photo
        <input
          name="photo"
          type="file"
          accept="image/*"
          capture="environment"
          required
          className="block w-full border border-line bg-white px-4 py-3 mt-2 font-normal text-sm"
        />
        <span className="block text-[10px] font-normal text-steel mt-1">Maximum file size: 8 MB</span>
      </label>

      <label className="block font-body text-xs font-semibold text-asphalt mt-4">
        Delivery note <span className="font-normal text-steel">(optional)</span>
        <textarea
          name="deliveryNote"
          rows={3}
          maxLength={500}
          className="block w-full border border-line bg-white px-4 py-3 mt-2 font-normal outline-none focus:border-amber"
          placeholder="Condition of cargo, recipient comment, or handover note"
        />
      </label>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-body text-xs font-semibold text-asphalt">Recipient signature</span>
          <button type="button" onClick={clear} className="font-body text-xs text-route underline">
            Clear
          </button>
        </div>
        <canvas
          ref={canvas}
          width={700}
          height={220}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          className="w-full h-36 border border-line bg-white mt-2 touch-none"
          aria-label="Recipient signature pad"
        />
        <p className="font-body text-[10px] text-steel mt-1">Ask the recipient to sign inside the box.</p>
      </div>

      <Button disabled={saving} className="w-full mt-5">
        {saving ? "Uploading proof…" : "Submit proof & complete delivery"}
      </Button>
    </form>
  );
}

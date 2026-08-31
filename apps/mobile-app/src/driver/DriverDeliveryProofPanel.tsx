import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent,
} from "react";
import type { DriverActiveTripOrder } from "./driver-active-trip.model";
import {
  MAX_DELIVERY_PHOTO_BYTES,
  allowedDriverPaymentResults,
  type DriverDeliveryProofDraft,
  type DriverTripPaymentResult,
} from "./driver-delivery-proof.model";
import { submitDriverDeliveryProof } from "./driver-delivery-proof.service";

const SIGNATURE_WIDTH = 720;
const SIGNATURE_HEIGHT = 240;

function formatEtb(value: number | null): string {
  return value === null ? "—" : `ETB ${Math.round(value).toLocaleString()}`;
}

function signaturePoint(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function PaymentChoice({
  selected,
  value,
  title,
  help,
  onSelect,
  disabled,
}: {
  selected: boolean;
  value: DriverTripPaymentResult;
  title: string;
  help: string;
  onSelect: (value: DriverTripPaymentResult) => void;
  disabled: boolean;
}) {
  return <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={() => onSelect(value)}
    disabled={disabled}
    className={`min-h-20 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-halo-blue bg-halo-soft ring-2 ring-halo-blue/15" : "border-halo-line bg-white"}`}
  >
    <span className="flex items-start gap-3">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-halo-blue bg-halo-blue" : "border-halo-muted bg-white"}`}>
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span><span className="block text-sm font-black text-halo-navy">{title}</span><span className="mt-1 block text-[11px] leading-5 text-halo-muted">{help}</span></span>
    </span>
  </button>;
}

export function DriverDeliveryProofPanel({
  trip,
  userId,
  onDelivered,
}: {
  trip: DriverActiveTripOrder;
  userId: string;
  onDelivered: (trackingId: string) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const submittingRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [signed, setSigned] = useState(false);
  const [paymentResult, setPaymentResult] = useState<DriverTripPaymentResult | "">("");
  const [amountCollected, setAmountCollected] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = SIGNATURE_WIDTH;
    canvas.height = SIGNATURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (context) {
      context.lineWidth = 6;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#10213d";
    }
  }, [open]);

  if (trip.status !== "in_transit") return null;

  const allowedResults = allowedDriverPaymentResults(trip.selectedPaymentMethod);
  const receiverReady = recipientName.trim().length >= 2;
  const photoReady = Boolean(photo?.size);
  const signatureReady = signed;
  const paymentReady = Boolean(paymentResult);
  const progress = [receiverReady, photoReady, signatureReady, paymentReady].filter(Boolean).length;

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    if (saving) return;
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setError("Delivery photo suuraa ta'uu qaba.");
      return;
    }
    if (selected.size > MAX_DELIVERY_PHOTO_BYTES) {
      setError("Delivery photo 8 MB gadi ta'uu qaba.");
      return;
    }
    setPhoto(selected);
    setError("");
  }

  function startSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (saving || !canvasRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const context = canvasRef.current.getContext("2d");
    const point = signaturePoint(event, canvasRef.current);
    context?.beginPath();
    context?.moveTo(point.x, point.y);
    setSigned(true);
    setError("");
  }

  function moveSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (saving || !drawingRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext("2d");
    if (!context) return;
    const point = signaturePoint(event, canvasRef.current);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopSignature() {
    drawingRef.current = false;
  }

  function clearSignature() {
    if (saving || !canvasRef.current) return;
    canvasRef.current.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setSigned(false);
  }

  function closePanel() {
    if (saving) return;
    setOpen(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || saving) return;
    setError("");

    if (!photo) return setError("Delivery photo barbaachisa.");
    if (!signed || !canvasRef.current) return setError("Nama fe'umsa fudhate irraa mallattoo fudhadhu.");
    if (!paymentResult) return setError("Bu'aa kaffaltii fili.");

    submittingRef.current = true;
    setSaving(true);
    try {
      const signature = await canvasBlob(canvasRef.current);
      if (!signature?.size) throw new Error("Mallattoo suuraatti jijjiiruun hin danda'amne.");

      const draft: DriverDeliveryProofDraft = {
        recipientName,
        deliveryNote,
        photo,
        signature,
        paymentResult,
        amountCollected,
        paymentNote,
      };
      await submitDriverDeliveryProof({
        expectedUserId: userId,
        orderId: trip.id,
        draft,
      });
      setOpen(false);
      onDelivered(trip.trackingId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trip xumuruun hin danda'amne.");
      setSaving(false);
      submittingRef.current = false;
    }
  }

  const positivePaymentTitle = trip.selectedPaymentMethod === "cash"
    ? "Maallaqni callaan fudhatame"
    : "Bank / Telebirr mirkanaa'e";
  const positivePaymentHelp = trip.selectedPaymentMethod === "cash"
    ? `Maallaqa sirrii ${formatEtb(trip.priceEtb)} harkaan fudhadheera.`
    : `Kaffaltii platform Bank / Telebirr ${formatEtb(trip.priceEtb)} irratti mirkaneessi.`;
  const positivePaymentValue: DriverTripPaymentResult = trip.selectedPaymentMethod === "cash"
    ? "cash_received"
    : "bank_telebirr";

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-4 min-h-14 w-full rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-halo-button active:scale-[0.99]"
      data-mobile-finish-trip-action
    >
      Geessuu xumuri · Ragaa galchi
    </button>

    {open && <div className="fixed inset-0 z-[100] bg-halo-navy/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mobile-delivery-proof-title">
      <div className="absolute inset-x-0 bottom-0 top-[max(12px,env(safe-area-inset-top))] overflow-y-auto rounded-t-[30px] bg-halo-canvas shadow-[0_-20px_60px_rgba(0,0,0,0.3)]">
        <header className="sticky top-0 z-10 border-b border-halo-line bg-white/95 px-4 pb-4 pt-4 backdrop-blur-xl sm:px-6">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-halo-line" />
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">{trip.trackingId}</p><h2 id="mobile-delivery-proof-title" className="mt-1 text-xl font-black text-halo-navy">Ragaa geessuu fi Trip xumuri</h2><p className="mt-1 text-xs leading-5 text-halo-muted">Receiver, photo, signature fi bu'aa kaffaltii servertti yeroo tokkoon olkaa'i.</p></div>
            <button type="button" onClick={closePanel} disabled={saving} aria-label="Close delivery proof" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-halo-line bg-white text-xl font-black text-halo-navy disabled:opacity-50">×</button>
          </div>
          <div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-halo-line"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress * 25}%` }} /></div><span className="text-xs font-black text-halo-blue">{progress}/4</span></div>
        </header>

        <form onSubmit={submit} aria-busy={saving} className="space-y-4 px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-5 sm:px-6">
          {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-5 text-red-700">{error}</p>}
          {saving && <p role="status" aria-live="polite" className="rounded-2xl border border-halo-blue/20 bg-halo-soft px-4 py-3 text-sm font-bold text-halo-blue">Ragaa geessuu, payment result fi trip completion olkaa'aa jira. Actions hundi yeroo muraasaaf cufamaniiru.</p>}

          <section className={`rounded-[24px] border p-4 ${receiverReady ? "border-emerald-200 bg-emerald-50" : "border-halo-line bg-white"}`}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-black text-halo-navy">1. Nama fe'umsa fudhate</h3><span className={`text-[10px] font-black ${receiverReady ? "text-emerald-700" : "text-halo-muted"}`}>{receiverReady ? "QOPHAA'E" : "BARBAACHISA"}</span></div>
            <label className="mt-4 block text-[11px] font-black uppercase tracking-[0.12em] text-halo-muted">Maqaa receiver<input value={recipientName} onChange={(event) => { setRecipientName(event.target.value); setError(""); }} minLength={2} maxLength={120} autoComplete="name" disabled={saving} className="mt-2 min-h-13 w-full rounded-2xl border border-halo-line bg-white px-4 text-sm font-bold normal-case tracking-normal text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60" placeholder="Fakkeenya: Abdisa Tola" /></label>
            <label className="mt-3 block text-[11px] font-black uppercase tracking-[0.12em] text-halo-muted">Yaada geessuu — filannoo<textarea value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} maxLength={1000} disabled={saving} rows={3} className="mt-2 w-full rounded-2xl border border-halo-line bg-white p-4 text-sm font-medium normal-case tracking-normal text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60" placeholder="Haala fe'umsaa ykn bakka kenname…" /></label>
          </section>

          <section className={`rounded-[24px] border p-4 ${photoReady ? "border-emerald-200 bg-emerald-50" : "border-halo-line bg-white"}`}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-black text-halo-navy">2. Suuraa geessuu</h3><span className={`text-[10px] font-black ${photoReady ? "text-emerald-700" : "text-halo-muted"}`}>{photoReady ? "QOPHAA'E" : "BARBAACHISA"}</span></div>
            <p className="mt-2 text-xs leading-5 text-halo-muted">Fe'umsa fi bakka handover ifatti agarsiisu. Suuraan 8 MB gadi ta'uu qaba.</p>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={choosePhoto} disabled={saving} className="sr-only" tabIndex={-1} />
            <input ref={galleryInputRef} type="file" accept="image/*" onChange={choosePhoto} disabled={saving} className="sr-only" tabIndex={-1} />
            <div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={() => cameraInputRef.current?.click()} disabled={saving} className="min-h-12 rounded-2xl bg-halo-blue px-3 text-xs font-black text-white disabled:opacity-60">📷 Camera bani</button><button type="button" onClick={() => galleryInputRef.current?.click()} disabled={saving} className="min-h-12 rounded-2xl border border-halo-line bg-white px-3 text-xs font-black text-halo-navy disabled:opacity-60">🖼 Gallery keessaa</button></div>
            {photoPreview && <div className="mt-4 overflow-hidden rounded-2xl border border-halo-line bg-white"><img src={photoPreview} alt="Selected delivery proof" className="max-h-64 w-full object-cover"/><div className="flex items-center justify-between gap-3 p-3"><span className="min-w-0 truncate text-xs font-bold text-halo-navy">{photo?.name}</span><button type="button" onClick={() => setPhoto(null)} disabled={saving} className="min-h-10 rounded-xl border border-red-200 px-3 text-xs font-black text-red-700 disabled:opacity-60">Haqi</button></div></div>}
          </section>

          <section className={`rounded-[24px] border p-4 ${signatureReady ? "border-emerald-200 bg-emerald-50" : "border-halo-line bg-white"}`}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-black text-halo-navy">3. Mallattoo receiver</h3><span className={`text-[10px] font-black ${signatureReady ? "text-emerald-700" : "text-halo-muted"}`}>{signatureReady ? "QOPHAA'E" : "BARBAACHISA"}</span></div>
            <p className="mt-2 text-xs leading-5 text-halo-muted">Receiver quba ykn stylus fayyadamuun box kana keessatti mallatteessa.</p>
            <canvas ref={canvasRef} onPointerDown={startSignature} onPointerMove={moveSignature} onPointerUp={stopSignature} onPointerCancel={stopSignature} onPointerLeave={stopSignature} className="mt-3 h-36 w-full touch-none rounded-2xl border-2 border-dashed border-halo-line bg-white" aria-label="Receiver signature pad" />
            <button type="button" onClick={clearSignature} disabled={saving || !signed} className="mt-3 min-h-11 rounded-2xl border border-halo-line bg-white px-4 text-xs font-black text-halo-navy disabled:opacity-50">Mallattoo qulqulleessi</button>
          </section>

          <section className={`rounded-[24px] border p-4 ${paymentReady ? "border-emerald-200 bg-emerald-50" : "border-halo-line bg-white"}`}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-black text-halo-navy">4. Bu'aa kaffaltii</h3><span className={`text-[10px] font-black ${paymentReady ? "text-emerald-700" : "text-halo-muted"}`}>{paymentReady ? "FILATAME" : "BARBAACHISA"}</span></div>
            <div className="mt-3 rounded-2xl bg-halo-soft p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-halo-muted">Customer filannoo</p><div className="mt-1 flex items-center justify-between gap-3"><strong className="text-sm text-halo-navy">{trip.selectedPaymentMethod === "cash" ? "Cash" : "Bank / Telebirr"}</strong><strong className="text-sm text-halo-blue">{formatEtb(trip.priceEtb)}</strong></div></div>
            <div role="radiogroup" aria-label="Trip payment result" className="mt-3 grid gap-3">
              {allowedResults.includes(positivePaymentValue) && <PaymentChoice selected={paymentResult === positivePaymentValue} value={positivePaymentValue} title={positivePaymentTitle} help={positivePaymentHelp} onSelect={(value) => { setPaymentResult(value); setError(""); }} disabled={saving} />}
              <PaymentChoice selected={paymentResult === "payment_not_received"} value="payment_not_received" title="Kaffaltiin hin fudhatamne" help="Trip geessuun xumurameera; kaffaltiin outstanding ta'ee Finance/Admin hordofa." onSelect={(value) => { setPaymentResult(value); setError(""); }} disabled={saving} />
            </div>
            {paymentResult === "cash_received" && <label className="mt-3 block text-[11px] font-black uppercase tracking-[0.12em] text-halo-muted">Maallaqa sirriitti fudhatame<input value={amountCollected} onChange={(event) => setAmountCollected(event.target.value)} inputMode="decimal" disabled={saving} className="mt-2 min-h-13 w-full rounded-2xl border border-halo-line bg-white px-4 text-sm font-black normal-case tracking-normal text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60" placeholder={trip.priceEtb === null ? "ETB" : String(trip.priceEtb)} /></label>}
            <label className="mt-3 block text-[11px] font-black uppercase tracking-[0.12em] text-halo-muted">Yaada kaffaltii — filannoo<textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} maxLength={500} disabled={saving} rows={2} className="mt-2 w-full rounded-2xl border border-halo-line bg-white p-4 text-sm font-medium normal-case tracking-normal text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60" placeholder="Reference ykn ibsa gabaabaa…" /></label>
          </section>

          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-900">Mirkaneessa dhumaa</p><p className="mt-1 text-[11px] leading-5 text-amber-800">“Trip xumuri” erga tuqxee booda order Delivered ta'a; proof fi payment result immutable audit history keessatti olkaa'ama.</p></div>
          <button type="submit" disabled={saving} className="min-h-14 w-full rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-halo-button disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Trip xumuraa jira…" : "Trip xumuri"}</button>
        </form>
      </div>
    </div>}
  </>;
}

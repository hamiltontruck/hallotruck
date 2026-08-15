import { ChangeEvent, FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { submitDeliveryProof } from "../../services/delivery-proof.service";
import { Button } from "../ui/Button";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { getDriverTripDocumentsCopy } from "../../i18n/driverTripDocumentsCopy";

const journeyCopy: Record<HalloLanguage, {
  progress: string;
  receiver: string;
  photo: string;
  signature: string;
  complete: string;
  ready: string;
  waiting: string;
}> = {
  en: {
    progress: "DELIVERY COMPLETION STEPS",
    receiver: "Receiver",
    photo: "Photo",
    signature: "Signature",
    complete: "Complete",
    ready: "Ready",
    waiting: "Waiting",
  },
  om: {
    progress: "TARTIIBA GEEJJIBA XUMURUU",
    receiver: "Nama fudhate",
    photo: "Suuraa",
    signature: "Mallattoo",
    complete: "Xumuri",
    ready: "Qophaa'e",
    waiting: "Eegaa jira",
  },
  am: {
    progress: "የማድረስ ማጠናቀቂያ ደረጃዎች",
    receiver: "ተቀባይ",
    photo: "ፎቶ",
    signature: "ፊርማ",
    complete: "ጨርስ",
    ready: "ዝግጁ",
    waiting: "በመጠበቅ ላይ",
  },
};

export function DriverDeliveryProofForm({
  orderId,
  onDelivered,
}: {
  orderId: string;
  onDelivered: () => void;
}) {
  const { language } = useLanguage();
  const c = getDriverTripDocumentsCopy(language).proof;
  const journey = journeyCopy[language];
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [recipientName, setRecipientName] = useState("");
  const [signed, setSigned] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }
    const preview = URL.createObjectURL(photo);
    setPhotoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [photo]);

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setPhoto(null);
      event.target.value = "";
      setError(c.photoRequired);
      return;
    }
    if (selected.size > 8 * 1024 * 1024) {
      setPhoto(null);
      event.target.value = "";
      setError(c.maxFile);
      return;
    }
    setPhoto(selected);
    setError("");
  }

  function removePhoto() {
    setPhoto(null);
    if (fileInput.current) fileInput.current.value = "";
  }

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
    setError("");
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
    const cleanedRecipientName = recipientName.trim();
    const deliveryNote = String(form.get("deliveryNote") ?? "");

    if (cleanedRecipientName.length < 2) return setError(c.recipientNameError);
    if (!photo?.size) return setError(c.photoRequired);
    if (!signed || !canvas.current) return setError(c.signatureRequired);

    const signature = await new Promise<Blob | null>((resolve) => canvas.current?.toBlob(resolve, "image/png"));
    if (!signature) return setError(c.signatureSaveError);

    setSaving(true);
    try {
      await submitDeliveryProof({
        orderId,
        recipientName: cleanedRecipientName,
        deliveryNote,
        photo,
        signature,
      });
      onDelivered();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.submitError);
      setSaving(false);
    }
  }

  const receiverReady = recipientName.trim().length >= 2;
  const photoReady = Boolean(photo?.size);
  const signatureReady = signed;
  const completionReady = receiverReady && photoReady && signatureReady;
  const steps = [
    { label: journey.receiver, done: receiverReady },
    { label: journey.photo, done: photoReady },
    { label: journey.signature, done: signatureReady },
    { label: journey.complete, done: completionReady },
  ];
  const completedCount = steps.filter((step) => step.done).length;

  return (
    <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-emerald-700/30 bg-white shadow-sm">
      <header className="bg-asphalt p-5 text-white sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber">{c.eyebrow}</p>
            <h2 className="mt-2 font-display text-xl font-semibold">{c.title}</h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-white/55">{c.help}</p>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 font-mono text-[9px] uppercase text-emerald-300">{c.required}</span>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[9px] tracking-[.16em] text-white/45">{journey.progress}</p>
            <span className="font-mono text-[10px] font-semibold text-amber">{completedCount}/4</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {steps.map((step, index) => (
              <div key={step.label} className={`rounded-xl border p-2.5 ${step.done ? "border-emerald-400/35 bg-emerald-400/10" : "border-white/10 bg-white/[.04]"}`}>
                <div className="flex items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${step.done ? "bg-emerald-400 text-asphalt" : "bg-white/10 text-white/45"}`}>
                    {step.done ? "✓" : index + 1}
                  </span>
                  <span className={`hidden truncate text-[9px] font-semibold sm:block ${step.done ? "text-emerald-300" : "text-white/45"}`}>{step.label}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${(completedCount / 4) * 100}%` }} />
          </div>
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {error && <p className="border border-route/30 bg-route/5 px-3 py-3 text-xs text-route">{error}</p>}

        <section className={`mt-1 rounded-2xl border p-4 ${receiverReady ? "border-emerald-200 bg-emerald-50/60" : "border-asphalt/10 bg-[#f8f7f2]"}`}>
          <StepHeading number={1} label={journey.receiver} done={receiverReady} ready={journey.ready} waiting={journey.waiting} />
          <label className="mt-4 block text-xs font-semibold text-asphalt">
            {c.receivedBy}
            <input
              name="recipientName"
              value={recipientName}
              onChange={(event) => { setRecipientName(event.target.value); setError(""); }}
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className="mt-2 block w-full rounded-xl border border-line bg-white px-4 py-3 font-normal outline-none focus:border-amber"
              placeholder={c.recipientPlaceholder}
            />
          </label>
        </section>

        <section className={`mt-4 rounded-2xl border p-4 ${photoReady ? "border-emerald-200 bg-emerald-50/60" : "border-asphalt/10 bg-[#f8f7f2]"}`}>
          <StepHeading number={2} label={journey.photo} done={photoReady} ready={journey.ready} waiting={journey.waiting} />
          <label className="mt-4 block text-xs font-semibold text-asphalt">
            {c.deliveryPhoto}
            <input
              ref={fileInput}
              name="photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={selectPhoto}
              className="mt-2 block w-full rounded-xl border border-line bg-white px-4 py-3 text-sm font-normal"
            />
            <span className="mt-1 block text-[10px] font-normal text-steel">{c.maxFile}</span>
          </label>

          {photo && (
            <div className="mt-3 rounded-xl border border-emerald-700/25 bg-white p-3">
              <div className="flex items-start gap-3">
                {photoPreview && <img src={photoPreview} alt="Selected delivery proof" className="h-20 w-20 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-asphalt">{photo.name}</p>
                  <p className="mt-1 text-[10px] text-steel">{(photo.size / 1024 / 1024).toFixed(2)} MB · Photo ready</p>
                  <button type="button" onClick={removePhoto} disabled={saving} className="mt-2 text-xs font-semibold text-route underline disabled:opacity-50">Remove / retake</button>
                </div>
              </div>
            </div>
          )}
        </section>

        <label className="mt-4 block text-xs font-semibold text-asphalt">
          {c.deliveryNote} <span className="font-normal text-steel">({c.optional})</span>
          <textarea name="deliveryNote" rows={3} maxLength={500} className="mt-2 block w-full rounded-xl border border-line bg-white px-4 py-3 font-normal outline-none focus:border-amber" placeholder={c.notePlaceholder} />
        </label>

        <section className={`mt-4 rounded-2xl border p-4 ${signatureReady ? "border-emerald-200 bg-emerald-50/60" : "border-asphalt/10 bg-[#f8f7f2]"}`}>
          <StepHeading number={3} label={journey.signature} done={signatureReady} ready={journey.ready} waiting={journey.waiting} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-asphalt">{c.signature}</span>
            <button type="button" onClick={clear} disabled={saving} className="text-xs text-route underline disabled:opacity-50">{c.clear}</button>
          </div>
          <canvas
            ref={canvas}
            width={700}
            height={220}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            className="mt-2 h-36 w-full touch-none rounded-xl border border-line bg-white"
            aria-label={c.signatureAria}
          />
          <p className="mt-1 text-[10px] text-steel">{c.signHelp}</p>
        </section>

        <section className={`mt-4 rounded-2xl border p-4 ${completionReady ? "border-emerald-300 bg-emerald-50" : "border-amber/25 bg-amber/5"}`}>
          <StepHeading number={4} label={journey.complete} done={completionReady} ready={journey.ready} waiting={journey.waiting} />
          <p className="mt-3 text-xs leading-5 text-steel">{completionReady ? c.help : c.required}</p>
          <Button disabled={saving || !completionReady} className="mt-4 w-full">{saving ? c.uploading : c.submit}</Button>
        </section>
      </div>
    </form>
  );
}

function StepHeading({
  number,
  label,
  done,
  ready,
  waiting,
}: {
  number: number;
  label: string;
  done: boolean;
  ready: string;
  waiting: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${done ? "bg-emerald-700 text-white" : "bg-asphalt text-white"}`}>{done ? "✓" : number}</span>
        <p className="font-display text-sm font-semibold text-asphalt">{label}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase ${done ? "bg-emerald-100 text-emerald-800" : "bg-asphalt/5 text-steel"}`}>{done ? ready : waiting}</span>
    </div>
  );
}

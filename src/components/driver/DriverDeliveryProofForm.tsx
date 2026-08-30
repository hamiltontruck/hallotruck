import { ChangeEvent, FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { submitDeliveryProof } from "../../services/delivery-proof.service";
import { Button } from "../ui/Button";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { getDriverTripDocumentsCopy } from "../../i18n/driverTripDocumentsCopy";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const CAMERA_CAPTURE_MAX_WIDTH = 1600;
const ACTION_GUIDANCE_ID = "driver-delivery-proof-action-guidance";

type DeliveryProofSubmit = typeof submitDeliveryProof;

type JourneyCopy = {
  progress: string;
  receiver: string;
  photo: string;
  signature: string;
  complete: string;
  ready: string;
  waiting: string;
  takePhoto: string;
  chooseGallery: string;
  cameraTitle: string;
  cameraHelp: string;
  cameraStarting: string;
  cameraUnavailable: string;
  capturePhoto: string;
  closeCamera: string;
  retake: string;
  photoReady: string;
  removePhoto: string;
  paymentResult: string;
  paymentHelp: string;
  cashReceived: string;
  bankTelebirr: string;
  paymentNotReceived: string;
  amountCollected: string;
  requiredAmount: string;
  paymentNote: string;
  choosePayment: string;
  exactAmount: string;
  readyToSubmit: string;
  submitting: string;
  submittingHelp: string;
};

const journeyCopy: Record<HalloLanguage, JourneyCopy> = {
  en: {
    progress: "DELIVERY COMPLETION STEPS",
    receiver: "Receiver",
    photo: "Photo",
    signature: "Signature",
    complete: "Complete",
    ready: "Ready",
    waiting: "Waiting",
    takePhoto: "Take delivery photo",
    chooseGallery: "Choose from gallery",
    cameraTitle: "Delivery camera",
    cameraHelp: "Keep the cargo and handover area clearly visible.",
    cameraStarting: "Starting rear camera…",
    cameraUnavailable: "The camera could not open. Allow camera permission or choose a photo from the gallery.",
    capturePhoto: "Use this photo",
    closeCamera: "Cancel",
    retake: "Retake photo",
    photoReady: "Photo ready",
    removePhoto: "Remove",
    paymentResult: "Payment result",
    paymentHelp: "Choose one result before Finish Trip. The customer does not confirm payment.",
    cashReceived: "Cash received",
    bankTelebirr: "Bank / Telebirr",
    paymentNotReceived: "Payment not received",
    amountCollected: "Exact amount collected",
    requiredAmount: "Required amount",
    paymentNote: "Optional payment note",
    choosePayment: "Choose Cash received, Bank / Telebirr, or Payment not received.",
    exactAmount: "Enter the exact collected amount",
    readyToSubmit: "All required delivery details are ready. Finish Trip is available.",
    submitting: "Submitting delivery proof…",
    submittingHelp: "Delivery proof and the payment result are being saved. All fields and actions are temporarily locked until the submission finishes.",
  },
  om: {
    progress: "TARTIIBA GEEJJIBA XUMURUU",
    receiver: "Nama fudhate",
    photo: "Suuraa",
    signature: "Mallattoo",
    complete: "Xumuri",
    ready: "Qophaa'e",
    waiting: "Eegaa jira",
    takePhoto: "Suuraa geessuu kaasi",
    chooseGallery: "Gallery keessaa fili",
    cameraTitle: "Kaameraa geessuu",
    cameraHelp: "Fe'umsa fi bakka kennuu ifatti akka mul'atu godhi.",
    cameraStarting: "Kaameraa duubaa banaa jira…",
    cameraUnavailable: "Kaameraan banamuu hin dandeenye. Hayyama cameraa kenni ykn gallery keessaa suuraa fili.",
    capturePhoto: "Suuraa kana fayyadami",
    closeCamera: "Dhiisi",
    retake: "Irra deebi'ii kaasi",
    photoReady: "Suuraan qophaa'eera",
    removePhoto: "Haqi",
    paymentResult: "Bu'aa kaffaltii",
    paymentHelp: "Imala Xumuri dura bu'aa tokko fili. Maamilaan kaffaltii hin mirkaneessu.",
    cashReceived: "Maallaqni callaan fudhatame",
    bankTelebirr: "Baankii / Telebirr",
    paymentNotReceived: "Kaffaltiin hin fudhatamne",
    amountCollected: "Maallaqa sirriitti fudhatame",
    requiredAmount: "Maallaqa barbaachisu",
    paymentNote: "Yaada kaffaltii filannoo",
    choosePayment: "Maallaqa callaa fudhatame, Baankii / Telebirr, ykn Kaffaltiin hin fudhatamne keessaa tokko fili.",
    exactAmount: "Maallaqa sirriitti fudhatame galchi",
    readyToSubmit: "Ragaan geessuu barbaachisu hundi qophaa'eera. Imala Xumuri fayyadamuun ni danda'ama.",
    submitting: "Ragaa geessuu ergaa jira…",
    submittingHelp: "Ragaan geessuu fi bu'aan kaffaltii olkaa'amaa jiru. Hanga ergaan xumuramutti fields fi actions hundi yeroo muraasaaf cufamaniiru.",
  },
  am: {
    progress: "የማድረስ ማጠናቀቂያ ደረጃዎች",
    receiver: "ተቀባይ",
    photo: "ፎቶ",
    signature: "ፊርማ",
    complete: "ጨርስ",
    ready: "ዝግጁ",
    waiting: "በመጠበቅ ላይ",
    takePhoto: "የማድረሻ ፎቶ አንሳ",
    chooseGallery: "ከጋለሪ ምረጥ",
    cameraTitle: "የማድረሻ ካሜራ",
    cameraHelp: "ጭነቱና የርክክብ ቦታው በግልጽ እንዲታዩ ያድርጉ።",
    cameraStarting: "የኋላ ካሜራ እየተከፈተ ነው…",
    cameraUnavailable: "ካሜራው አልተከፈተም። የካሜራ ፈቃድ ይስጡ ወይም ከጋለሪ ፎቶ ይምረጡ።",
    capturePhoto: "ይህን ፎቶ ተጠቀም",
    closeCamera: "ሰርዝ",
    retake: "እንደገና አንሳ",
    photoReady: "ፎቶው ዝግጁ ነው",
    removePhoto: "አስወግድ",
    paymentResult: "የክፍያ ውጤት",
    paymentHelp: "ጉዞውን ከማጠናቀቅዎ በፊት አንድ ውጤት ይምረጡ። ደንበኛው ክፍያን አያረጋግጥም።",
    cashReceived: "ጥሬ ገንዘብ ተቀብሏል",
    bankTelebirr: "ባንክ / ቴሌብር",
    paymentNotReceived: "ክፍያ አልተቀበለም",
    amountCollected: "ትክክለኛው የተቀበለው መጠን",
    requiredAmount: "የሚፈለገው መጠን",
    paymentNote: "አማራጭ የክፍያ ማስታወሻ",
    choosePayment: "ጥሬ ገንዘብ ተቀብሏል፣ ባንክ / ቴሌብር ወይም ክፍያ አልተቀበለም የሚለውን ይምረጡ።",
    exactAmount: "ትክክለኛውን የተቀበለውን መጠን ያስገቡ",
    readyToSubmit: "ሁሉም አስፈላጊ የማድረስ መረጃዎች ዝግጁ ናቸው። ጉዞውን ማጠናቀቅ ይቻላል።",
    submitting: "የማድረስ ማስረጃ እየተላከ ነው…",
    submittingHelp: "የማድረስ ማስረጃውና የክፍያ ውጤቱ እየተቀመጡ ነው። ማስገባቱ እስኪጠናቀቅ ድረስ ሁሉም መስኮችና እርምጃዎች ለጊዜው ተቆልፈዋል።",
  },
};

export function DriverDeliveryProofForm({
  orderId,
  tripAmountEtb,
  onDelivered,
  submitProof = submitDeliveryProof,
}: {
  orderId: string;
  tripAmountEtb: number;
  onDelivered: () => void;
  submitProof?: DeliveryProofSubmit;
}) {
  const { language } = useLanguage();
  const c = getDriverTripDocumentsCopy(language).proof;
  const journey = journeyCopy[language];
  const canvas = useRef<HTMLCanvasElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraVideo = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const drawing = useRef(false);
  const submitting = useRef(false);
  const [recipientName, setRecipientName] = useState("");
  const [signed, setSigned] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [saving, setSaving] = useState(false);
  const [completionResult, setCompletionResult] = useState<"cash_received" | "bank_telebirr" | "payment_not_received" | "">("");
  const [amountCollected, setAmountCollected] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
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

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;

    async function startCamera() {
      setCameraReady(false);
      setCameraError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(journey.cameraUnavailable);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStream.current = stream;
        if (cameraVideo.current) {
          cameraVideo.current.srcObject = stream;
          await cameraVideo.current.play();
          setCameraReady(true);
        }
      } catch {
        if (!cancelled) setCameraError(journey.cameraUnavailable);
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraOpen, journey.cameraUnavailable]);

  function stopCameraStream() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    if (cameraVideo.current) cameraVideo.current.srcObject = null;
  }

  function openCamera() {
    if (saving) return;
    setError("");
    setCameraError("");
    setCameraOpen(true);
  }

  function closeCamera() {
    if (saving) return;
    stopCameraStream();
    setCameraReady(false);
    setCameraOpen(false);
  }

  async function captureCameraPhoto() {
    if (saving) return;
    const video = cameraVideo.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const scale = Math.min(1, CAMERA_CAPTURE_MAX_WIDTH / video.videoWidth);
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    captureCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = captureCanvas.getContext("2d");
    if (!context) return setCameraError(journey.cameraUnavailable);
    context.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

    const blob = await new Promise<Blob | null>((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) return setCameraError(journey.cameraUnavailable);
    if (blob.size > MAX_PHOTO_BYTES) return setCameraError(c.maxFile);

    const captured = new File([blob], `delivery-${orderId}-${Date.now()}.jpg`, { type: "image/jpeg" });
    setPhoto(captured);
    setError("");
    closeCamera();
  }

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    if (saving) return;
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setPhoto(null);
      event.target.value = "";
      setError(c.photoRequired);
      return;
    }
    if (selected.size > MAX_PHOTO_BYTES) {
      setPhoto(null);
      event.target.value = "";
      setError(c.maxFile);
      return;
    }
    setPhoto(selected);
    setError("");
  }

  function removePhoto() {
    if (saving) return;
    setPhoto(null);
    if (galleryInput.current) galleryInput.current.value = "";
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
    if (saving) return;
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
    if (saving || !drawing.current) return;
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
    if (saving) return;
    const target = canvas.current;
    target?.getContext("2d")?.clearRect(0, 0, target.width, target.height);
    setSigned(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const cleanedRecipientName = recipientName.trim();
    const deliveryNote = String(form.get("deliveryNote") ?? "");

    if (cleanedRecipientName.length < 2) return setError(c.recipientNameError);
    if (!photo?.size) return setError(c.photoRequired);
    if (!signed || !canvas.current) return setError(c.signatureRequired);
    if (!completionResult) return setError(journey.choosePayment);
    if (completionResult === "cash_received" && Math.abs(Number(amountCollected) - tripAmountEtb) > 0.005) {
      return setError(`${journey.exactAmount}: ETB ${tripAmountEtb.toLocaleString()}.`);
    }

    submitting.current = true;
    setSaving(true);
    try {
      const signature = await new Promise<Blob | null>((resolve) => canvas.current?.toBlob(resolve, "image/png"));
      if (!signature) throw new Error(c.signatureSaveError);

      await submitProof({
        orderId,
        recipientName: cleanedRecipientName,
        deliveryNote,
        photo,
        signature,
        paymentResult: completionResult,
        amountCollected: completionResult === "cash_received" ? Number(amountCollected) : undefined,
        paymentNote,
      });
      onDelivered();
    } catch (err) {
      submitting.current = false;
      setError(err instanceof Error ? err.message : c.submitError);
      setSaving(false);
    }
  }

  const receiverReady = recipientName.trim().length >= 2;
  const photoReady = Boolean(photo?.size);
  const signatureReady = signed;
  const baseCompletionReady = receiverReady && photoReady && signatureReady;
  const collectedAmount = Number(amountCollected);
  const cashAmountReady = completionResult !== "cash_received"
    || (Number.isFinite(collectedAmount) && collectedAmount > 0 && Math.abs(collectedAmount - tripAmountEtb) <= 0.005);
  const paymentReady = Boolean(completionResult) && cashAmountReady;
  const submitReady = baseCompletionReady && paymentReady;
  const steps = [
    { label: journey.receiver, done: receiverReady },
    { label: journey.photo, done: receiverReady && photoReady },
    { label: journey.signature, done: receiverReady && photoReady && signatureReady },
    { label: journey.complete, done: submitReady },
  ];
  const completedCount = steps.filter((step) => step.done).length;
  const submitGuidance = saving
    ? journey.submittingHelp
    : !receiverReady
      ? c.recipientNameError
      : !photoReady
        ? c.photoRequired
        : !signatureReady
          ? c.signatureRequired
          : !completionResult
            ? journey.choosePayment
            : !cashAmountReady
              ? `${journey.exactAmount}: ETB ${tripAmountEtb.toLocaleString()}.`
              : journey.readyToSubmit;
  const lockedControlDescription = saving ? ACTION_GUIDANCE_ID : undefined;
  const lockedControlTitle = saving ? journey.submittingHelp : undefined;

  return (
    <form
      onSubmit={submit}
      aria-busy={saving}
      data-delivery-proof-form
      data-delivery-proof-busy={saving ? "true" : "false"}
      className="overflow-hidden rounded-2xl border border-emerald-700/30 bg-white shadow-sm"
    >
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
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${(completedCount / 4) * 100}%` }} />
          </div>
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {error && <p role="alert" className="border border-route/30 bg-route/5 px-3 py-3 text-xs text-route">{error}</p>}

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
              disabled={saving}
              aria-describedby={lockedControlDescription}
              title={lockedControlTitle}
              className="mt-2 block w-full rounded-xl border border-line bg-white px-4 py-3 font-normal outline-none focus:border-amber disabled:cursor-not-allowed disabled:opacity-60"
              placeholder={c.recipientPlaceholder}
            />
          </label>
        </section>

        <section className={`mt-4 rounded-2xl border p-4 ${photoReady ? "border-emerald-200 bg-emerald-50/60" : "border-asphalt/10 bg-[#f8f7f2]"}`}>
          <StepHeading number={2} label={journey.photo} done={photoReady} ready={journey.ready} waiting={journey.waiting} />
          <p className="mt-4 text-xs font-semibold text-asphalt">{c.deliveryPhoto}</p>
          <input
            ref={galleryInput}
            name="photo"
            type="file"
            accept="image/*"
            onChange={selectPhoto}
            disabled={saving}
            aria-describedby={lockedControlDescription}
            title={lockedControlTitle}
            className="sr-only"
            tabIndex={-1}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={openCamera}
              disabled={saving}
              aria-describedby={lockedControlDescription}
              title={lockedControlTitle}
              className="min-h-12 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              📷 {photo ? journey.retake : journey.takePhoto}
            </button>
            <button
              type="button"
              onClick={() => galleryInput.current?.click()}
              disabled={saving}
              aria-describedby={lockedControlDescription}
              title={lockedControlTitle}
              className="min-h-12 rounded-xl border border-asphalt/20 bg-white px-4 py-3 text-sm font-semibold text-asphalt disabled:cursor-not-allowed disabled:opacity-50"
            >
              🖼 {journey.chooseGallery}
            </button>
          </div>
          <span className="mt-2 block text-[10px] font-normal text-steel">{c.maxFile}</span>

          {photo && (
            <div className="mt-3 rounded-xl border border-emerald-700/25 bg-white p-3">
              <div className="flex items-start gap-3">
                {photoPreview && <img src={photoPreview} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-asphalt">{photo.name}</p>
                  <p className="mt-1 text-[10px] text-steel">{(photo.size / 1024 / 1024).toFixed(2)} MB · {journey.photoReady}</p>
                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={saving}
                    aria-describedby={lockedControlDescription}
                    title={lockedControlTitle}
                    className="mt-2 text-xs font-semibold text-route underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {journey.removePhoto}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <label className="mt-4 block text-xs font-semibold text-asphalt">
          {c.deliveryNote} <span className="font-normal text-steel">({c.optional})</span>
          <textarea
            name="deliveryNote"
            rows={3}
            maxLength={500}
            disabled={saving}
            aria-describedby={lockedControlDescription}
            title={lockedControlTitle}
            className="mt-2 block w-full rounded-xl border border-line bg-white px-4 py-3 font-normal outline-none focus:border-amber disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={c.notePlaceholder}
          />
        </label>

        <section className={`mt-4 rounded-2xl border p-4 ${signatureReady ? "border-emerald-200 bg-emerald-50/60" : "border-asphalt/10 bg-[#f8f7f2]"}`}>
          <StepHeading number={3} label={journey.signature} done={signatureReady} ready={journey.ready} waiting={journey.waiting} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-asphalt">{c.signature}</span>
            <button
              type="button"
              onClick={clear}
              disabled={saving}
              aria-describedby={lockedControlDescription}
              title={lockedControlTitle}
              className="text-xs text-route underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {c.clear}
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
            className={`mt-2 h-36 w-full touch-none rounded-xl border border-line bg-white ${saving ? "pointer-events-none cursor-not-allowed opacity-60" : ""}`}
            aria-label={c.signatureAria}
            aria-disabled={saving}
            aria-describedby={lockedControlDescription}
            title={lockedControlTitle}
          />
          <p className="mt-1 text-[10px] text-steel">{c.signHelp}</p>
        </section>

        <section className="mt-4 rounded-2xl border border-asphalt/10 bg-white p-4">
          <p className="text-sm font-semibold text-asphalt">{journey.paymentResult}</p>
          <p className="mt-1 text-xs text-steel">{journey.paymentHelp}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              ["cash_received", journey.cashReceived],
              ["bank_telebirr", journey.bankTelebirr],
              ["payment_not_received", journey.paymentNotReceived],
            ] as const).map(([value, label]) => (
              <label key={value} className={`rounded-xl border p-3 text-xs font-semibold ${completionResult === value ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-asphalt"} ${saving ? "cursor-not-allowed opacity-60" : ""}`}>
                <input
                  type="radio"
                  name="completionResult"
                  value={value}
                  checked={completionResult === value}
                  onChange={() => { setCompletionResult(value); setError(""); }}
                  disabled={saving}
                  aria-describedby={lockedControlDescription}
                  title={lockedControlTitle}
                  className="mr-2"
                />
                {label}
              </label>
            ))}
          </div>
          {completionResult === "cash_received" && (
            <label className="mt-4 block text-xs font-semibold text-asphalt">
              {journey.amountCollected}
              <input
                value={amountCollected}
                onChange={(event) => { setAmountCollected(event.target.value); setError(""); }}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                disabled={saving}
                aria-describedby={lockedControlDescription}
                title={lockedControlTitle}
                className="mt-2 block w-full rounded-xl border border-asphalt/15 px-4 py-3 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="mt-2 block font-normal text-steel">{journey.requiredAmount}: ETB {tripAmountEtb.toLocaleString()}</span>
            </label>
          )}
          <label className="mt-4 block text-xs font-semibold text-asphalt">
            {journey.paymentNote}
            <textarea
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              maxLength={500}
              rows={2}
              disabled={saving}
              aria-describedby={lockedControlDescription}
              title={lockedControlTitle}
              className="mt-2 block w-full rounded-xl border border-asphalt/15 px-4 py-3 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
        </section>

        <section className={`mt-4 rounded-2xl border p-4 ${submitReady ? "border-emerald-300 bg-emerald-50" : "border-amber/25 bg-amber/5"}`}>
          <StepHeading number={4} label={journey.complete} done={submitReady} ready={journey.ready} waiting={journey.waiting} />
          <p
            id={ACTION_GUIDANCE_ID}
            role={saving ? "status" : undefined}
            aria-live="polite"
            data-delivery-proof-action-guidance
            className={`mt-3 text-xs leading-5 ${saving ? "font-semibold text-amber-900" : submitReady ? "text-emerald-900" : "text-steel"}`}
          >
            {saving ? `${journey.submitting} ${submitGuidance}` : submitGuidance}
          </p>
          <Button
            disabled={saving || !submitReady}
            aria-describedby={ACTION_GUIDANCE_ID}
            title={saving || !submitReady ? submitGuidance : undefined}
            data-delivery-proof-submit
            className="mt-4 w-full"
          >
            {saving ? journey.submitting : c.submit}
          </Button>
        </section>
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/90 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={journey.cameraTitle}>
          <div className="w-full max-w-xl overflow-hidden rounded-t-3xl bg-asphalt text-white sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber">{journey.cameraTitle}</p>
                <p className="mt-1 text-xs leading-5 text-white/65">{journey.cameraHelp}</p>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                disabled={saving}
                aria-describedby={lockedControlDescription}
                title={lockedControlTitle}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 text-xl disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={journey.closeCamera}
              >
                ×
              </button>
            </div>

            <div className="relative aspect-[3/4] w-full overflow-hidden bg-black sm:aspect-video">
              <video ref={cameraVideo} autoPlay muted playsInline className="h-full w-full object-cover" />
              {!cameraReady && !cameraError && <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/70" role="status">{journey.cameraStarting}</div>}
              {cameraError && <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm leading-6 text-white" role="alert">{cameraError}</div>}
            </div>

            <div className="grid grid-cols-2 gap-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={closeCamera}
                disabled={saving}
                aria-describedby={lockedControlDescription}
                title={lockedControlTitle}
                className="min-h-13 rounded-xl border border-white/20 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {journey.closeCamera}
              </button>
              {cameraError ? (
                <button
                  type="button"
                  onClick={() => { closeCamera(); window.setTimeout(() => galleryInput.current?.click(), 0); }}
                  disabled={saving}
                  aria-describedby={lockedControlDescription}
                  title={lockedControlTitle}
                  className="min-h-13 rounded-xl bg-white px-4 py-3 font-semibold text-asphalt disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {journey.chooseGallery}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void captureCameraPhoto()}
                  disabled={!cameraReady || saving}
                  aria-describedby={saving ? ACTION_GUIDANCE_ID : undefined}
                  title={saving ? journey.submittingHelp : undefined}
                  className="min-h-13 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-asphalt disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {journey.capturePhoto}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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

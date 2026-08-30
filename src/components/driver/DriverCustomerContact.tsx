import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import {
  getAssignedCustomerContact,
  type AssignedCustomerContact,
} from "../../services/driver-payment.service";
import { telephoneHref } from "../../utils/phone";

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  call: string;
  unavailable: string;
  loading: string;
  loadFailed: string;
  retry: string;
  customerFallback: string;
  privacy: string;
}> = {
  en: {
    kicker: "ASSIGNED CUSTOMER",
    title: "Customer contact",
    call: "Call customer",
    unavailable: "Customer phone is not available.",
    loading: "Loading the assigned customer contact…",
    loadFailed: "Customer contact could not be loaded for this order.",
    retry: "Retry contact",
    customerFallback: "Customer",
    privacy: "This contact is shown only for the order currently assigned to you.",
  },
  om: {
    kicker: "CUSTOMER SIIF RAMADAME",
    title: "Qunnamtii customer",
    call: "Customer bilbili",
    unavailable: "Lakkoofsi bilbila customer hin jiru.",
    loading: "Qunnamtii customer siif ramadamee fe'aa jira…",
    loadFailed: "Qunnamtiin customer order kanaa fe'amuu hin dandeenye.",
    retry: "Qunnamtii deebi'ii yaali",
    customerFallback: "Customer",
    privacy: "Qunnamtiin kun order yeroo ammaa siif ramadame kana qofaaf mul'ata.",
  },
  am: {
    kicker: "የተመደበ ደንበኛ",
    title: "የደንበኛ መገኛ",
    call: "ደንበኛውን ደውል",
    unavailable: "የደንበኛው ስልክ ቁጥር አልተገኘም።",
    loading: "የተመደበውን ደንበኛ መገኛ በመጫን ላይ…",
    loadFailed: "የዚህ ትዕዛዝ ደንበኛ መገኛ መጫን አልተቻለም።",
    retry: "መገኛውን እንደገና ሞክር",
    customerFallback: "ደንበኛ",
    privacy: "ይህ መገኛ አሁን ለእርስዎ ለተመደበው ትዕዛዝ ብቻ ይታያል።",
  },
};

type ContactState = "loading" | "ready" | "error";
type ContactLoader = (orderId: string) => Promise<AssignedCustomerContact>;

export function DriverCustomerContact({
  orderId,
  loadContact = getAssignedCustomerContact,
}: {
  orderId: string;
  loadContact?: ContactLoader;
}) {
  const { language } = useLanguage();
  const t = copy[language];
  const [contact, setContact] = useState<AssignedCustomerContact | null>(null);
  const [state, setState] = useState<ContactState>("loading");
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;

    const requestId = ++requestIdRef.current;
    loadingRef.current = true;
    setContact(null);
    setState("loading");

    try {
      const row = await loadContact(orderId);
      if (requestId !== requestIdRef.current) return;
      setContact(row);
      setState("ready");
    } catch {
      if (requestId !== requestIdRef.current) return;
      setContact(null);
      setState("error");
    } finally {
      if (requestId === requestIdRef.current) loadingRef.current = false;
    }
  }, [loadContact, orderId]);

  useEffect(() => {
    requestIdRef.current += 1;
    loadingRef.current = false;
    void load();

    return () => {
      requestIdRef.current += 1;
      loadingRef.current = false;
    };
  }, [load]);

  const customerName = contact?.customer_name.trim() || t.customerFallback;
  const customerPhone = contact?.customer_phone?.trim() || "";
  const callHref = telephoneHref(customerPhone);
  const titleId = `driver-customer-contact-${orderId}`;
  const statusId = `${titleId}-status`;

  return (
    <section
      className="mb-6 rounded-2xl border border-asphalt/10 bg-white p-4 sm:p-5"
      aria-labelledby={titleId}
      aria-busy={state === "loading"}
      data-contact-state={state}
    >
      <p className="font-mono text-[9px] tracking-[.18em] text-amber-dim">{t.kicker}</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-lg font-bold text-asphalt">{t.title}</h2>

          {state === "loading" && (
            <p id={statusId} role="status" aria-live="polite" className="mt-3 text-sm text-steel">
              {t.loading}
            </p>
          )}

          {state === "error" && (
            <div className="mt-3">
              <p id={statusId} role="alert" className="text-sm leading-6 text-route">
                {t.loadFailed}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-asphalt/20 px-4 py-3 text-sm font-semibold text-asphalt sm:w-auto"
              >
                {t.retry}
              </button>
            </div>
          )}

          {state === "ready" && (
            <div id={statusId} role="status" aria-live="polite" className="mt-3">
              <p className="break-words text-sm font-semibold text-asphalt">{customerName}</p>
              <p className="mt-1 break-all text-sm text-steel">
                {callHref ? customerPhone : t.unavailable}
              </p>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-5 text-steel">{t.privacy}</p>
        </div>

        {state === "ready" && callHref && (
          <a
            href={callHref}
            aria-label={`${t.call}: ${customerName}`}
            aria-describedby={statusId}
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-xl bg-asphalt px-5 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            ☎ {t.call}
          </a>
        )}
      </div>
    </section>
  );
}

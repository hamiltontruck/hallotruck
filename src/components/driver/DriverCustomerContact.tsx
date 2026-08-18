import { useEffect, useState } from "react";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import {
  getAssignedCustomerContact,
  type AssignedCustomerContact,
} from "../../services/driver-payment.service";

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  call: string;
  unavailable: string;
}> = {
  en: {
    kicker: "ASSIGNED CUSTOMER",
    title: "Customer contact",
    call: "Call customer",
    unavailable: "Customer phone is not available.",
  },
  om: {
    kicker: "CUSTOMER SIIF RAMADAME",
    title: "Qunnamtii customer",
    call: "Customer bilbili",
    unavailable: "Lakkoofsi bilbila customer hin jiru.",
  },
  am: {
    kicker: "የተመደበ ደንበኛ",
    title: "የደንበኛ መገኛ",
    call: "ደንበኛውን ደውል",
    unavailable: "የደንበኛው ስልክ ቁጥር አልተገኘም።",
  },
};

function phoneHref(value: string) {
  return `tel:${value.replace(/[^+\d]/g, "")}`;
}

export function DriverCustomerContact({ orderId }: { orderId: string }) {
  const { language } = useLanguage();
  const t = copy[language];
  const [contact, setContact] = useState<AssignedCustomerContact | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAssignedCustomerContact(orderId)
      .then((row) => {
        if (!cancelled) {
          setContact(row);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t.unavailable);
      });
    return () => { cancelled = true; };
  }, [orderId, t.unavailable]);

  return (
    <section className="mb-6 rounded-2xl border border-asphalt/10 bg-white p-5">
      <p className="font-mono text-[9px] tracking-[.18em] text-amber-dim">{t.kicker}</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-asphalt">{t.title}</h2>
          <p className="mt-2 truncate text-sm font-semibold text-asphalt">{contact?.customer_name ?? "Customer"}</p>
          <p className="mt-1 text-sm text-steel">{contact?.customer_phone ?? (error || t.unavailable)}</p>
        </div>
        {contact?.customer_phone && (
          <a
            href={phoneHref(contact.customer_phone)}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-asphalt px-5 py-3 text-sm font-semibold text-white"
          >
            ☎ {t.call}
          </a>
        )}
      </div>
    </section>
  );
}

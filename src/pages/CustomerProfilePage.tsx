import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerBottomNav } from "../components/customer/CustomerBottomNav";
import { CustomerLocationControl } from "../components/customer/CustomerLocationControl";
import { CustomerProfilePanel } from "../components/customer/CustomerProfilePanel";
import { LanguageSwitcher, useLanguage, type HalloLanguage } from "../i18n/LanguageProvider";
import { getCustomerProfile } from "../services/customer-profile.service";
import type { CustomerProfile } from "../services/customer.service";
import { supabase } from "../services/supabase.client";

const copy: Record<HalloLanguage, {
  portal: string;
  eyebrow: string;
  title: string;
  description: string;
  loading: string;
  error: string;
  retry: string;
  refresh: string;
  refreshing: string;
  account: string;
  accountHelp: string;
  signOut: string;
}> = {
  en: {
    portal: "CUSTOMER ACCOUNT",
    eyebrow: "PROFILE CONTROL",
    title: "Your account and privacy",
    description: "Keep contact and business details current, control device-location sharing, and manage this signed-in session.",
    loading: "Loading customer profile…",
    error: "Customer profile could not be loaded.",
    retry: "Retry",
    refresh: "Refresh profile",
    refreshing: "Refreshing…",
    account: "Secure account session",
    accountHelp: "Profile updates use the signed-in customer identity. Sign out before giving this device to another person.",
    signOut: "Sign out securely",
  },
  om: {
    portal: "ACCOUNT CUSTOMER",
    eyebrow: "TO'ANNOO PROFAAYILII",
    title: "Account fi iccitii kee",
    description: "Odeeffannoo quunnamtii fi dhaabbataa haaromsi, location device qooduu to'adhu, session seensaa kana bulchi.",
    loading: "Profaayilii customer fe'aa jira…",
    error: "Profaayilii customer fe'uun hin danda'amne.",
    retry: "Irra deebi'i",
    refresh: "Profaayilii haaromsi",
    refreshing: "Haaromsaa jira…",
    account: "Session account nageenya qabu",
    accountHelp: "Jijjiiramni profile identity customer seenee jiru fayyadama. Device kana nama biraaf kennuu dura keessaa ba'i.",
    signOut: "Nageenyaan keessaa ba'i",
  },
  am: {
    portal: "የደንበኛ መለያ",
    eyebrow: "የመገለጫ መቆጣጠሪያ",
    title: "መለያዎ እና ግላዊነትዎ",
    description: "የመገናኛና የንግድ መረጃዎን ያዘምኑ፣ የመሣሪያ አካባቢ ማጋራትን ይቆጣጠሩ፣ ይህን የገቡበትን ክፍለ ጊዜ ያስተዳድሩ።",
    loading: "የደንበኛ መገለጫ በመጫን ላይ…",
    error: "የደንበኛ መገለጫውን መጫን አልተቻለም።",
    retry: "እንደገና ሞክር",
    refresh: "መገለጫን አድስ",
    refreshing: "በማደስ ላይ…",
    account: "ደህንነቱ የተጠበቀ የመለያ ክፍለ ጊዜ",
    accountHelp: "የመገለጫ ለውጦች የገባውን የደንበኛ ማንነት ይጠቀማሉ። መሣሪያውን ለሌላ ሰው ከመስጠትዎ በፊት ይውጡ።",
    signOut: "በደህነት ውጣ",
  },
};

export function CustomerProfilePage() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const text = copy[language];
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfile(await getCustomerProfile());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.error);
    } finally {
      setLoading(false);
    }
  }, [text.error]);

  useEffect(() => { void load(); }, [load]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  return (
    <main className="min-h-screen bg-bone pb-[calc(4.15rem+env(safe-area-inset-bottom))] text-asphalt sm:pb-0">
      <header className="border-b border-asphalt/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div className="min-w-0">
            <p className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></p>
            <p className="mt-1 font-mono text-[9px] tracking-[.22em] text-emerald-700">{text.portal}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <CustomerBottomNav />

      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <section className="mb-6 overflow-hidden bg-asphalt p-5 text-white sm:p-8">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[.2em] text-amber">{text.eyebrow}</p>
              <h1 className="mt-3 break-words font-display text-3xl font-bold sm:text-4xl">{text.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{text.description}</p>
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 shrink-0 border border-white/20 px-4 py-3 text-xs font-semibold disabled:opacity-50">
              {loading ? text.refreshing : text.refresh}
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-5 border border-route/30 bg-route/5 p-4 text-sm text-route" role="alert">
            <p>{error || text.error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 border border-route px-4 py-2 text-xs font-semibold">{text.retry}</button>
          </div>
        )}

        {loading && !profile ? (
          <p className="border border-asphalt/10 bg-white p-8 text-center font-mono text-sm text-steel">{text.loading}</p>
        ) : (
          <div className="grid gap-5">
            <CustomerProfilePanel profile={profile} onSaved={load} />
            <CustomerLocationControl />
            <section className="border border-asphalt/10 bg-white p-5 sm:p-6">
              <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">ACCOUNT SECURITY</p>
              <div className="mt-2 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words font-display text-xl font-bold">{text.account}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-steel">{text.accountHelp}</p>
                </div>
                <button type="button" onClick={() => void signOut()} className="min-h-11 shrink-0 bg-route px-4 py-3 text-xs font-semibold text-white">
                  {text.signOut}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

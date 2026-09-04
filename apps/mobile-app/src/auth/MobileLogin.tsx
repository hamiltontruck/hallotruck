import { useRef, useState, type FormEvent } from "react";

type MobileLoginProps = {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
};

const languageOptions = [
  { id: "om", label: "Afaan Oromoo", hint: "Default", flag: "OM" },
  { id: "am", label: "አማርኛ", hint: "Amharic", flag: "AM" },
  { id: "en", label: "English", hint: "Global", flag: "EN" },
  { id: "so", label: "Soomaali", hint: "Somali", flag: "SO" },
];

const workspaceOptions = [
  {
    id: "customer",
    title: "Maamiltootaa",
    body: "Fe'umsa galchi, kaffaltii ergi, geejjiba kee hordofi.",
  },
  {
    id: "driver",
    title: "Konkolaachisaa",
    body: "Hojii argadhu, trip gaggeessi, wallet kee ilaali.",
  },
];

function HaloLoginLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-[52px] w-[52px] place-items-center rounded-[20px] bg-white text-halo-blue shadow-halo-card">
        <span className="text-xl font-black">H</span>
      </div>
      <div>
        <p className="text-2xl font-black leading-none text-white">HALO</p>
        <p className="mt-1 text-xs font-bold uppercase text-white/70">Smart Logistics</p>
      </div>
    </div>
  );
}

export function MobileLogin({ busy, error, onSubmit }: MobileLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState(languageOptions[0].id);
  const [workspacePreview, setWorkspacePreview] = useState("customer");
  const submitLockRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current || busy) return;

    submitLockRef.current = true;
    try {
      await onSubmit(email.trim(), password);
    } finally {
      submitLockRef.current = false;
    }
  }

  return (
    <main className="halo-mobile-app min-h-screen bg-halo-canvas px-4 py-6 text-halo-navy sm:py-8">
      <section className="mx-auto grid w-full max-w-[960px] gap-4 md:grid-cols-[0.9fr_1.1fr]">
        <div className="relative min-h-[240px] overflow-hidden rounded-[30px] bg-gradient-to-br from-halo-blue-dark to-halo-blue p-6 text-white shadow-halo-float">
          <div className="relative z-10">
            <HaloLoginLogo />
            <div className="mt-14 max-w-[300px]">
              <p className="text-[10px] font-black uppercase text-white/60">Ogeessa ta'i socho'i</p>
              <h1 className="mt-2 text-3xl font-black leading-tight">Fooyya'inaan geejjibi.</h1>
              <p className="mt-3 text-sm leading-6 text-white/70">Customer app, driver app fi live logistics workspace tokko keessatti.</p>
            </div>
          </div>
          <div className="customer-login-road" aria-hidden="true" />
        </div>

        <section className="rounded-[30px] border border-halo-line bg-white p-5 shadow-[0_24px_70px_rgba(16,33,61,0.12)] sm:p-7">
          <div>
            <p className="text-[10px] font-black uppercase text-halo-blue">Afaan keessan filadhaa</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">HALO mobile seeni</h2>
            <p className="mt-2 text-sm leading-6 text-halo-muted">Afaan filannoo UI qofaaf; account fi role database profile irraa mirkanaa'a.</p>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {languageOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLanguage(option.id)}
                className={`flex min-h-12 items-center gap-3 rounded-2xl border px-3 text-left transition active:scale-[0.99] ${language === option.id ? "border-emerald-400 bg-emerald-50" : "border-halo-line bg-white"}`}
              >
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-halo-soft text-[10px] font-black text-halo-blue">{option.flag}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-halo-navy">{option.label}</span>
                  <span className="block text-[10px] text-halo-muted">{option.hint}</span>
                </span>
                {language === option.id && <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-xs font-black text-white">✓</span>}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-[10px] font-black uppercase text-halo-muted">Workspace preview</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {workspaceOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setWorkspacePreview(option.id)}
                  className={`min-h-[110px] rounded-[22px] border p-4 text-left transition active:scale-[0.99] ${workspacePreview === option.id ? "border-halo-blue bg-halo-soft" : "border-halo-line bg-white"}`}
                >
                  <span className="text-base font-black text-halo-navy">{option.title}</span>
                  <span className="mt-2 block text-xs leading-5 text-halo-muted">{option.body}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={submit} aria-busy={busy}>
            <label className="block">
              <span className="text-sm font-bold">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                required
                disabled={busy}
                className="mt-2 min-h-12 w-full rounded-2xl border border-halo-line bg-white px-4 text-base outline-none transition focus:border-halo-blue focus:ring-4 focus:ring-halo-soft disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={busy}
                className="mt-2 min-h-12 w-full rounded-2xl border border-halo-line bg-white px-4 text-base outline-none transition focus:border-halo-blue focus:ring-4 focus:ring-halo-soft disabled:opacity-60"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="min-h-[52px] w-full rounded-2xl bg-halo-blue px-5 font-black text-white shadow-halo-button transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Account mirkaneessaa jira..." : "ITTI FUFI"}
            </button>
          </form>

          <p className="mt-5 text-xs leading-5 text-halo-muted">
            Role filachuun authorization hin jijjiiru. App kun `profiles.role` fi `driver_status` qofa dubbisee Customer ykn Driver workspace bana.
          </p>
        </section>
      </section>
    </main>
  );
}

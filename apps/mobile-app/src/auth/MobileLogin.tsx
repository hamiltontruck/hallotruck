import { useRef, useState, type FormEvent } from "react";

type MobileLoginProps = {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
};

export function MobileLogin({ busy, error, onSubmit }: MobileLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <main className="halo-mobile-app min-h-screen bg-halo-canvas px-4 py-8 text-halo-navy">
      <section className="mx-auto w-full max-w-[440px] rounded-[30px] border border-halo-line bg-white p-6 shadow-[0_24px_70px_rgba(16,33,61,0.12)] sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-halo-blue text-lg font-black text-white">H</div>
          <div>
            <p className="text-xl font-black tracking-tight">HALLO Logistics</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-halo-muted">Mobile workspace</p>
          </div>
        </div>

        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-halo-blue">Nageenyaan seeni</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Account kee bani</h1>
          <p className="mt-3 text-sm leading-6 text-halo-muted">
            Email fi password HALLOTRUCK duraan qabdu fayyadami. Driver ykn Customer workspace database role keetiin ofumaan banama.
          </p>
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
              minLength={10}
              required
              disabled={busy}
              className="mt-2 min-h-12 w-full rounded-2xl border border-halo-line bg-white px-4 text-base outline-none transition focus:border-halo-blue focus:ring-4 focus:ring-halo-soft disabled:opacity-60"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="min-h-12 w-full rounded-2xl bg-halo-blue px-5 font-black text-white shadow-lg shadow-blue-900/15 transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Account mirkaneessaa jira…" : "Seeni"}
          </button>
        </form>

        <p className="mt-5 text-xs leading-5 text-halo-muted">
          Role filachuun hin barbaachisu. App kun metadata irraa osoo hin taane database profile kee irraa Driver ykn Customer ta'uu mirkaneessa.
        </p>
      </section>
    </main>
  );
}

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { supabase } from "../../services/supabase.client";
import {
  isPasswordRecoveryLocation,
  isValidNewRolePassword,
  MIN_RECOVERY_PASSWORD_LENGTH,
  recoveryLoginHash,
  ROLE_PIN_ERROR,
  usesSixDigitPin,
  type RecoveryPortal,
} from "../../domain/password-recovery";
import { LanguageSwitcher, useLanguage } from "../../i18n/LanguageProvider";
import { passwordRecoveryCopy } from "../../i18n/passwordRecoveryCopy";
import { resolveRecoveryPortal } from "../../services/password-recovery.service";

export interface PasswordRecoveryGateFixture {
  recovering: boolean;
  portal?: RecoveryPortal;
  updatePassword?: (password: string) => Promise<void>;
}

export function PasswordRecoveryGate({ children, fixture }: { children: ReactNode; fixture?: PasswordRecoveryGateFixture }) {
  const { language } = useLanguage();
  const c = passwordRecoveryCopy[language];
  const [recovering, setRecovering] = useState(() => fixture?.recovering ?? isPasswordRecoveryLocation(window.location.href));
  const [portal, setPortal] = useState<RecoveryPortal>(fixture?.portal ?? "account");
  const [portalResolved, setPortalResolved] = useState(() => Boolean(fixture?.portal) || !(fixture?.recovering ?? isPasswordRecoveryLocation(window.location.href)));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const pinRecovery = usesSixDigitPin(portal);

  useEffect(() => {
    if (fixture) return;

    const resolvePortal = async (user: Parameters<typeof resolveRecoveryPortal>[0]) => {
      setPortal(await resolveRecoveryPortal(user));
      setPortalResolved(true);
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        setRecovering(true);
        setPortalResolved(false);
        setSuccess(false);
        setError("");
        void resolvePortal(session.user);
      }
    });

    if (isPasswordRecoveryLocation(window.location.href)) {
      setRecovering(true);
      setPortalResolved(false);
      void supabase.auth.getUser().then(({ data: userData }) => {
        if (userData.user) void resolvePortal(userData.user);
      });
    }

    return () => data.subscription.unsubscribe();
  }, [fixture]);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!portalResolved) return;
    if (pinRecovery) {
      if (!isValidNewRolePassword(password)) {
        setError(ROLE_PIN_ERROR);
        return;
      }
    } else if (password.length < MIN_RECOVERY_PASSWORD_LENGTH) {
      setError(c.tooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(c.mismatch);
      return;
    }

    setSaving(true);
    if (fixture?.updatePassword) {
      try {
        await fixture.updatePassword(password);
      } catch (fixtureError) {
        setError(fixtureError instanceof Error ? fixtureError.message : c.mismatch);
        setSaving(false);
        return;
      }
    } else {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
      setPortal(await resolveRecoveryPortal(data.user));
      await supabase.auth.signOut();
    }

    setSaving(false);
    setSuccess(true);
  }

  function continueLabel() {
    if (portal === "customer") return c.continueCustomer;
    if (portal === "driver") return c.continueDriver;
    if (portal === "admin") return c.continueAdmin;
    return c.continueAccount;
  }

  function continueToLogin() {
    if (fixture) {
      setRecovering(false);
      return;
    }
    window.location.replace(`${window.location.origin}${window.location.pathname}${recoveryLoginHash(portal)}`);
  }

  if (!recovering) return <>{children}</>;

  return (
    <main className="grid min-h-screen place-items-center bg-asphalt p-5 text-white sm:p-6">
      <section className="w-full max-w-md bg-white p-6 text-asphalt sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center bg-amber font-display font-bold">HT</span>
          <LanguageSwitcher />
        </div>
        <h1 className="mt-7 font-display text-3xl font-bold">{c.setTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-steel">{c.setDescription}</p>

        {success ? (
          <div className="mt-6">
            <p className="border border-emerald-700/30 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{c.updated}</p>
            <button
              type="button"
              onClick={continueToLogin}
              className="mt-5 w-full bg-asphalt px-3 py-4 font-semibold text-white"
            >
              {continueLabel()}
            </button>
          </div>
        ) : (
          <form onSubmit={updatePassword}>
            {error && <p className="mt-5 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}
            <label className="mt-7 mb-2 block text-xs font-semibold">{c.newPassword}</label>
            <input
              required
              inputMode={pinRecovery ? "numeric" : undefined}
              pattern={pinRecovery ? "[0-9]{6}" : undefined}
              minLength={pinRecovery ? 6 : MIN_RECOVERY_PASSWORD_LENGTH}
              maxLength={pinRecovery ? 6 : undefined}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-asphalt/20 px-4 py-3 outline-none focus:border-amber"
            />
            <label className="mt-5 mb-2 block text-xs font-semibold">{c.confirmPassword}</label>
            <input
              required
              inputMode={pinRecovery ? "numeric" : undefined}
              pattern={pinRecovery ? "[0-9]{6}" : undefined}
              minLength={pinRecovery ? 6 : MIN_RECOVERY_PASSWORD_LENGTH}
              maxLength={pinRecovery ? 6 : undefined}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full border border-asphalt/20 px-4 py-3 outline-none focus:border-amber"
            />
            <button disabled={saving || !portalResolved} className="mt-7 w-full bg-asphalt px-3 py-4 font-semibold text-white disabled:opacity-60">
              {saving ? c.updating : c.update}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

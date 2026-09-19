# Driver Mobile Splash and Login QA

final result: blocked

## Scope and visual target

- Only `apps/driver-mobile-app/` changed: unauthenticated splash/login, associated assets, OAuth adapter and tests.
- Source visual truth: user attachment `1000245929.jpg`, local `/workspace/scratch/e71d6b4b238c/upload/01-1000245929.jpg`.
- Target: green/yellow HALLO wordmark, truck-on-highway splash, pale login screen, green actions, skyline footer. Device bezel/status bar are not app UI.
- Production baseline inspected in the cloud browser at the supplied `/hallotruck/driver-mobile/` URL. It displayed the old icon, yellow sign-in button, and no Google action.

## Browser verification blocker

The supervised local preview started, but the cloud browser rejected both the app URL and the prescribed preview root with `net::ERR_BLOCKED_BY_CLIENT`. The browser subsequently explicitly prohibited workarounds. No alternate browser surface was used.

- Implementation screenshot path: unavailable; browser access blocked.
- Full-view comparison: not performed.
- Focused comparison: not performed.
- Viewport targets: 320, 360, 390, 412 CSS px; not verified.
- Source/implementation density normalization: not performed because no implementation capture exists.
- State to compare: logged-out English login and splash, followed by OR/AM, password reveal, invalid inputs, keyboard, Google failure and callback cancellation.
- Console verification and browser primary interactions: blocked, not passed.
- Comparison history: baseline production capture only; no local visual-QA pass.

## Required fidelity surfaces

- Typography: system sans serif and responsive language wrapping implemented; visual comparison pending.
- Spacing/layout: reference hierarchy and scoped responsive CSS implemented; viewport/keyboard checks pending.
- Colors: deep green actions, pale white/green canvas and sage footer implemented; visual/contrast verification pending.
- Images: generated reference-based truck, wordmark and skyline assets inspected individually; in-app crop and scale pending.
- Copy: login/recovery/Google actions localized EN/OR/AM. Existing PIN/password compatibility retained. Splash marketing/brand copy follows the reference.

## Automated verification

- `npm run build`: passed (existing aggregate JS chunk >500 KB advisory).
- `npm test`: 73 passed, 0 failed, including four new OAuth adapter tests.
- Driver authorization remains through existing `DriverAccess`: database role must be driver, suspended drivers denied, pending drivers sent to existing onboarding.
- No changes to DriverWorkspace, authenticated screens, Android, database schema, RLS, production data or analytics.

## Release blockers

1. [P1] Supabase Google provider is disabled. Read-only `/auth/v1/settings` returned `external.google: false`. The button reports a localized unavailable message and allows normal email/password login.
2. [P1] Google credentials/redirect configuration and end-to-end session/account linking have not been configured or verified. Fresh OAuth-only account creation is also incompatible with the current signup trigger's mandatory Ethiopian phone; do not weaken this trigger or claim fresh Google signup works.
3. [P1] Visual QA and responsive/browser interaction checks remain blocked by preview access.

## Implementation checklist before release

- Configure Google OAuth securely in the existing Supabase project; never put client secrets in Vite variables or source.
- Allow `https://hamiltontruck.github.io/hallotruck/driver-mobile/` as the Supabase redirect and configure the project's Auth callback in Google Cloud.
- Confirm existing verified-email Driver linking, pending/approved/suspended behavior, non-driver denial, cancel/error/back behavior, and restart session restore with authorized test accounts.
- Keep fresh account signup through existing email/phone/PIN flow until a separately reviewed phone-completion flow is designed.
- Run the viewport/keyboard/language and full/focused screenshot comparisons above and attach evidence.
- Keep this PR draft and unmerged until those gates pass.

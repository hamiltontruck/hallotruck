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
- Viewport targets: 320, 360, 390, 412 CSS px; dedicated CSS breakpoints and `visualViewport` sizing are implemented and unit-guarded, but browser rendering is not verified.
- Source/implementation density normalization: not performed because no implementation capture exists.
- State to compare: logged-out English login and splash, followed by OR/AM, password reveal, invalid inputs, keyboard, Google failure and callback cancellation.
- Console verification and browser primary interactions: blocked, not passed.
- Comparison history: baseline production capture only; no local visual-QA pass.

## Required fidelity surfaces

- Typography: system sans serif and responsive language wrapping implemented; visual comparison pending.
- Spacing/layout: reference hierarchy, safe-area insets, exact visible-WebView height, independently scrolling app surfaces and keyboard-focus compaction implemented; rendered viewport checks pending.
- Colors: deep green actions, pale white/green canvas and sage footer implemented; visual/contrast verification pending.
- Images: generated reference-based truck, wordmark and skyline assets inspected individually; in-app crop and scale pending.
- Copy: login/recovery/Google actions localized EN/OR/AM. Existing PIN/password compatibility retained. Splash marketing/brand copy follows the reference.

## Automated verification

- `npm run test:ci`: passed (existing aggregate JS chunk >500 KB advisory).
- `npm test`: 74 passed, 0 failed, including four OAuth adapter tests and Android viewport regression coverage.
- Driver authorization remains through existing `DriverAccess`: database role must be driver, suspended drivers denied, pending drivers sent to existing onboarding.
- No database schema, RLS, production data or analytics changes. Android viewport hardening applies to login, onboarding and authenticated Driver surfaces without changing authorization.

## Release blockers

1. [P1] Driver-specific Google session/account linking is not yet verified with a database-authorized Driver account. User evidence confirms the shared Google provider now opens the Google chooser and returns through Supabase for Customer Mobile, clearing the former provider-disabled blocker. Fresh Google-only Driver creation remains incompatible with the mandatory-phone signup trigger; do not weaken this trigger or claim that flow works.
2. [P1] Visual QA and responsive/browser interaction checks remain blocked because the required cloud browser rejects `http://terminal.local:4173/` with `net::ERR_BLOCKED_BY_CLIENT`.

## Implementation checklist before release

- Confirm existing verified-email Driver linking, pending/approved/suspended behavior, non-driver denial, cancel/error/back behavior, and restart session restore with authorized test accounts.
- Keep fresh account signup through existing email/phone/PIN flow until a separately reviewed phone-completion flow is designed.
- After deployment, run the viewport/keyboard/language and full/focused screenshot comparisons above and attach evidence.
- Keep this PR draft and unmerged until those gates pass.

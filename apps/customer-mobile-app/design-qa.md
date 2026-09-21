**Source visual truth**

- `/workspace/scratch/e71d6b4b238c/upload/IMG_0083(1).jpeg`
- `/workspace/scratch/e71d6b4b238c/upload/IMG_0084(1).jpeg`

**Implementation**

- Customer Mobile splash and login under `src/auth/CustomerAuthBoundaryV2.tsx` and `src/auth/customer-entry.css`.
- Intended viewports: 320, 360, 390, 412 and 430 CSS pixels.
- States: splash, sign-in, language switching, password visibility, password recovery, Google OAuth and create-account switch.

**Full-view comparison evidence**

- Browser capture is currently unavailable because the Work cloud browser returned `ERR_BLOCKED_BY_CLIENT` for the supervised local preview.
- Source images were opened and inspected. The implementation uses dedicated raster splash, HALLO wordmark, Google mark and skyline assets with isolated entry CSS.

**Focused region comparison evidence**

- Blocked with the full-view capture. Code-level checks confirm green sign-in action, bordered Google action, compact top-right language control, icon-bearing email/password fields and the skyline footer.

**Findings**

- [P1] Browser-rendered visual comparison unavailable.
  Impact: exact pixel fidelity and overflow at all five target widths cannot be claimed yet.
  Fix: verify the deployed public page in the cloud browser after CI and Pages deployment.

**Primary interactions tested**

- Automated Customer Mobile suite: 75/75 passed.
- TypeScript typecheck: passed.
- Production build: passed.
- Browser interactions and console errors: blocked by the local-preview browser restriction.

**Comparison history**

- Initial implementation replaced the legacy card/blue action with the selected white/green entry composition and real artwork.
- Accessibility regression expectations were restored for the HALLO logo.
- Post-fix automated suite and production build passed.

final result: blocked

---

## Customer authentication validation polish — 2026-09-21

**Source visual truth**

- `/workspace/scratch/e71d6b4b238c/upload/01-1000249133.jpg` (688 × 1536 px) — invalid numeric-only name and overlong mixed-character phone entry.
- `/workspace/scratch/e71d6b4b238c/upload/02-1000249130.jpg` (688 × 1536 px) — password-reset confirmation presented with error styling.

**Rendered implementation evidence**

- Cloud-browser capture of the production `AuthForm` component at a 1348px browser content viewport; the app surface measured 440px client width and 440px scroll width with no horizontal overflow.
- The source phone screenshots are device-density captures; comparison was normalized to the app-owned 430–440 CSS-pixel content region and excluded browser/status/navigation chrome.
- States captured: invalid sign-up input, valid sign-up input, and successful password-reset notice.

**Full-view comparison evidence**

- Invalid sign-up: numeric-only `58800088` was removed from Full name, the visible name error appeared, the pasted overlong mixed phone was bounded to `+251911250415`, and Create Account remained disabled.
- Valid sign-up: `Adil Abdu`, `0911250415`, a valid email, six-digit PIN and accepted terms enabled Create Account without submitting the form.
- Reset notice: the same confirmation copy rendered in the green success token instead of the source screenshot's red error token.
- Both login and sign-up preserved the HALLO wordmark, centered hierarchy, 44px+ controls, skyline footer and narrow mobile composition.

**Focused region comparison evidence**

- Full name: input now accepts Unicode letters/marks, spaces, apostrophes and hyphens; numeric-only content cannot remain in the field.
- Phone: input is capped at 13 displayed characters and normalizes only `09XXXXXXXX`, `2519XXXXXXXX`, or `+2519XXXXXXXX`.
- PIN: placeholder explicitly says `6-digit PIN`; non-digits are removed and exactly six digits are required.
- Feedback: invalid states use the red semantic token; reset success uses `customer-entry-alert is-success` and a status role.

**Fidelity surfaces**

- Typography: existing Arial/Noto Sans Ethiopic family, hierarchy and weights preserved; PIN copy is clearer.
- Spacing/layout: existing vertical rhythm preserved; inline errors add only contextual height and no horizontal overflow.
- Colors/tokens: reset confirmation corrected from error red to success green; invalid inputs use restrained red border/background.
- Image quality: official HALLO wordmark and skyline assets are unchanged and remain sharp.
- Copy/content: EN/OR/AM PIN labels updated; validation messages remain localized.

**Comparison history**

- [P0] Numeric-only names passed the old length-only check. Fixed with Unicode name sanitization and executable validation tests; browser evidence shows the numeric value is removed.
- [P0] Overlong/mixed-character phone text could remain visible until submit. Fixed with bounded input sanitization plus strict Ethiopian normalization; browser evidence shows the bounded canonical number and disabled submit.
- [P1] Reset confirmation looked like an error. Fixed by tracking success/error feedback kind; browser evidence shows the green status notice.

**Primary interactions and console**

- Invalid and valid sign-up field transitions tested without transmitting or creating an account.
- Create Account disabled/enabled gating tested.
- Browser console contained only the cloud-browser extension's metadata errors and a temporary QA-harness HMR warning; no production component error was observed.
- Automated Customer Mobile suite: 84/84 passed; TypeScript typecheck and production build passed.

final result: passed

---

## Booking, compact Orders and Live Tracking polish — 2026-09-21

**Source visual truth**

- `/workspace/scratch/e71d6b4b238c/upload/01-1000246111.jpg` — truck selection.
- `/workspace/scratch/e71d6b4b238c/upload/02-1000246104.jpg` — compact Customer Portal order card.
- `/workspace/scratch/e71d6b4b238c/upload/03-1000246112.jpg` — immersive live tracking.

**Implementation and viewport**

- Customer Mobile booking, Orders and live tracking under `src/CustomerBookingJourney.tsx`, `src/CustomerTrackingPage.tsx`, `src/CustomerTrackingMap.tsx` and `src/customer-android-responsive.css`.
- Browser comparison used a 430 CSS-pixel Customer app viewport inside the supervised preview.
- The tested order card measured 402px client width and 402px scroll width, confirming no horizontal overflow.

**Full-view and focused comparisons**

- Truck selection: all visible vehicle choices were enabled before cargo entry, selection worked, vehicle photos remained visible and the misleading `0 ton` label was removed.
- Orders: the assigned truck/Driver block retained its real image elements while being reduced to a compact two-column mobile layout.
- Live tracking: the marked top brand/header section was removed, status moved beside Close, the map region was enlarged and the manual Refresh button was removed.
- Live map marker: code and automated checks confirm a Lucide truck marker replaces the arrow glyph. The supervised cloud browser cannot initialize WebGL, so a rendered marker comparison could not be captured there; the screen now fails safely with a user-facing map-unavailable state instead of crashing.

**Primary interactions tested**

- Route → Truck: all vehicle options enabled and selectable before cargo weight entry.
- Cargo → Quote: incompatible weight blocks quote progression after weight is known.
- Customer order card: no horizontal overflow at the tested narrow viewport.
- Automated Customer Mobile suite: 81/81 passed.
- TypeScript typecheck: passed.
- Production build: passed.

**Remaining visual gate**

- [P1] Verify the live Lucide truck marker and map heading rotation on a WebGL-capable Android browser after deployment. Cloud-browser WebGL is unavailable, so exact rendered-map comparison remains blocked.

final result: blocked

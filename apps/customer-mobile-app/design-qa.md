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

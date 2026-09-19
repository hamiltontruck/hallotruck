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

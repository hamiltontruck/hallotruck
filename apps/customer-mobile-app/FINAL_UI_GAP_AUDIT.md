# Customer Mobile V4 — Final UI baseline gap audit

Baseline audited before implementation: `main@194fa37e06ab3a10eb62b1d149c28e3e214ec3f8`.

Visual authority: **HALLO Smart Logistics — Customer App — Final UI Design Specification** (19-page PDF supplied for this work). Functional authority remains the production Customer Mobile services and the richer root Customer Portal behavior.

| Screen | Baseline state on main | Final-UI gap identified |
| --- | --- | --- |
| Splash | Missing | Add branded launch surface without delaying an existing restored session. |
| Login | Real Supabase Customer auth | Geometry/typography did not match final design; brittle CSS; no password visibility or explicit IME treatment. |
| Register | Real signup with Ethiopian phone normalization | Combined auth view did not match final design; add terms UI and responsive form polish without changing auth contract. |
| Home | Real booking map was the home screen | Replace with dashboard/quick actions/recent orders; move real map into Route step. |
| Route | Real MapLibre search/geolocation/HGV route | Preserve real map and route service but present as booking step 1. |
| Cargo | Real cargo contract inside monolithic flow | Separate into step 2 and apply approved row/input hierarchy. |
| Choose Truck | Full production vehicle catalog | Convert dense grid into final-design list while preserving capacity validation. |
| Quote | Authoritative Supabase quote existed inline | Separate quote screen; never invent rate components not returned by backend. |
| Review | Inline confirmation only | Add explicit route/cargo/truck/payment/terms review. |
| Booking Confirmed | Toast only | Add full confirmation screen using the created production order. |
| My Orders | Rich portal-parity data already present | Keep metrics, one assignment card, invoice, cancellation and realtime; apply lighter visual language. |
| Order Details | Expanded order card only | Add dedicated detail screen with real order, assignment, invoice, tracking and call actions. |
| Live Tracking | Rich real GPS/map/chat flow already present | Preserve LIVE/STALE/OFFLINE truthfulness and portal parity; only visual/language polish. |
| Payments | Real read-only ledger; inline-heavy UI | Match final visual hierarchy without fabricating a wallet balance. |
| Profile | Real profile/avatar/edit/logout | Add final-design account menu while preserving secure avatar and profile RPCs. |
| Saved Locations | No dedicated production saved-location table/service | Add truthful screen backed only by the existing Customer profile home address; do not invent locations. |
| Help & Support | Missing | Add informational/support navigation without inventing support contacts or backend actions. |
| Language & Settings | Global EN/OR/አማ control only | Add settings surface that reuses the same persisted language control. |
| Responsive | Existing booking/portal parity safeguards | Re-audit final structure at 320/360/390/412/430 and safe-area/IME boundaries. |

## Scope guard

Implementation is restricted to `apps/customer-mobile-app/`. No schema, migration, RLS, pricing rule, service-role access, production data, root Customer Portal, Driver, Partner, Admin/CEO, Finance, or native Android changes are part of this branch.

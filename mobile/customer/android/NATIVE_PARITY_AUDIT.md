# HALLO Customer Android Native Parity Audit

## Scope lock

Native Android only (`mobile/customer/android/`). Kotlin + XML presentation. Reuse the existing production Customer backend/data contracts. Do not change Supabase schema, migrations, RLS, pricing rules, production data, Admin/CEO, Driver, Partner or Finance.

## Source of truth

Portal routes/components audited from current `main`:
- `CustomerLogin`
- `CustomerMapHome`
- `CustomerPortal`
- `CustomerLiveOrders`
- `CustomerTrackingPage`
- `CustomerProfilePage`
- `CustomerQuoteMap`
- `CustomerDriverChat`
- customer services for orders, cargo, quote pricing, routing, payment, profile and media

Android backend/data layer audited from current `main`:
- `CustomerRepository`
- `CustomerParityService`
- `CustomerCompletionService`
- `CustomerViewModel`
- `CustomerLiveMapView`
- `MainActivity` / `activity_main.xml`

## Contract rule

Portal behavior/data is authoritative. Android may use a different mobile-native visual design, icons, colors, cards, typography and bottom navigation, but must not invent a second pricing, routing, payment, tracking or authorization contract.

## Feature-gap inventory

| Feature | Portal behavior | Existing Android | Status | Authoritative source | Required Android action |
|---|---|---|---|---|---|
| Session restore + customer role gate | Restores Supabase session; verifies `profiles.role=customer` | Present | Working | Supabase Auth + `profiles` | Preserve; presentation only |
| Login | Existing customer password accepted; network/offline/retry handling | Present but presentation/validation has drifted | Needs improvement | Supabase Auth | Match portal auth semantics; native error/offline states |
| Signup | Full name + Ethiopian phone + email + 6-digit numeric new-role PIN | Present | Partial | Supabase Auth metadata + shared validation intent | Keep 6-digit signup PIN; normalize phone/email; native field validation |
| Password reset | Email reset flow from Customer Login | Not complete in final native flow | Partial | password recovery service/backend | Add native reset screen/action without changing backend |
| EN / Afaan Oromoo / Amharic | Full customer operational localization | Present but inconsistent recreation/mixed text observed | Needs improvement | Portal copy + Android resources | One locale source; no runtime mixed-language overlays |
| Bottom navigation | Customer home/orders/track/payments/profile plus create-order entry | Existing navigation has accumulated runtime adapters | Needs improvement | Portal route model | Native fixed 6-item nav: Home, Orders, Book, Track, Payments, Profile |
| Place autocomplete | MapTiler autocomplete; language-aware; routable places only | Present; Android search currently hardcodes `language=en` | Partial | MapTiler geocoding + operating-region guard | Pass active locale; debounce; render native suggestion list |
| Current location | Browser/device location can select pickup | Incomplete/fragile in booking UX | Partial | Device location only | Native permission + location selection; no fake coordinates |
| Map tap / reverse geocode / draggable refinement | Full interactive quote map supports map selection/refinement | Android map is a custom embedded surface and has had blank/loading issues | Needs improvement | MapTiler + selected coordinates | Build stable native map interaction and full-screen/large route map |
| HGV road route | `quote-route` Edge Function; OpenRouteService `driving-hgv` | Present and already reuses same Edge Function | Working backend | `quote-route` | Preserve contract; improve route UI only |
| Operating corridor guard | Ethiopia–Djibouti–Somalia operating corridor | Present in Android repository | Working backend | existing corridor rules | Preserve |
| Vehicle selection | Portal vehicle list/capacity rules | Present | Partial UI | shared vehicle/capacity rules | Native truck cards with one selected state |
| Cargo quantity/unit | Ton/Quintal and capacity validation | Present | Working/partial UI | cargo-load rules | Preserve logic; rebuild native fields |
| Cargo category | Category required/validated | Present in Android create-order model | Partial UI | cargo-details rules | Native category selector |
| Packaging type | Packaging required/validated | Present in model | Partial UI | cargo-details rules | Native packaging selector |
| Cargo notes/description | Portal builds validated cargo description | Android accepts description/model fields | Partial | cargo-details contract | Align native review payload exactly |
| Quote | Admin-managed `calculate_transport_quote_v2` | Present | Working backend | RPC `calculate_transport_quote_v2` | Never calculate a local replacement; native loading/error/breakdown UI |
| Payment method at booking | Cash or Bank/Telebirr | Present in create order | Partial UI | order contract | Native selector + Review confirmation |
| Review before order creation | Portal shows route/load/capacity/price before confirm | Existing Android flow is less stable | Needs improvement | current route + quote + cargo state | Dedicated native Review screen |
| Secure order create | Creates real order with coordinates, cargo, selected payment method and verified quote | Present; re-verifies quote before insert | Working backend | existing orders contract | Preserve; add Success screen |
| Success / View Order / Create Another | Portal/new-order continuation | Incomplete final native UX | Missing/partial | created order result | Native Success screen and actions |
| Orders list | Full order list, newest first | Present | Working/partial UI | `orders` | Rebuild native cards |
| Order filters | all / active / payment / delivered / cancelled | Existing search/status UI differs | Partial | portal filtering semantics | Native chips with exact semantics |
| Order details | Route, cargo, vehicle, payment, status, timestamps | Present in pieces | Partial | orders + payments + assignments | Unified native detail sheet/screen |
| Cancellation | Allowed for portal statuses with reason 5–500 chars | Present via `customer_cancel_order` | Working backend | RPC `customer_cancel_order` | Native modal and localized validation |
| Driver assignment | Verified driver + truck info | Present via `customer_driver_assignment_cards` | Working backend/partial UI | RPC `customer_driver_assignment_cards` | Professional assignment card |
| Driver photo + truck photo | Signed secure verification media | Present in parity service | Working backend/partial UI | `driver-verification` signed URLs | Native secure image cards/fallbacks |
| Live orders | Portal live-order queue, refresh + realtime/polling | Android loads orders but no direct portal-equivalent live queue | Partial | orders + assignments | Track screen should expose current live orders |
| Live GPS | Portal tracks accepted/in-transit/delivered with real GPS only | Present via `customer_get_live_trip` | Working backend/partial UI | RPC `customer_get_live_trip` | Stable native live map; no fake GPS |
| Live road route + remaining route/ETA | Portal uses HGV route with live trip | Android parity service already derives road/remaining routes | Working backend | `quote-route` + live trip | Render route, truck marker, freshness, distance/ETA |
| Tracking freshness/offline state | Real GPS availability determines state | Present in Android policy/viewmodel | Partial UI | live-trip timestamps | Semantic LIVE/STALE/OFFLINE states |
| Call assigned driver | `tel:` from verified assignment | Not consistently surfaced | Partial | assignment phone | Native call action |
| Customer ↔ driver chat | Opens secure order thread, realtime messages/read state | No equivalent Android chat found in audited native layer | Missing | existing customer-driver-chat backend/service contract | Add native chat using existing tables/RPC/realtime contract only |
| Payments overview | Uses actual order payments and verified/pending/released/refunded semantics | Read support exists | Partial | `payments` + payment summary semantics | Native payment cards with backend-backed states |
| Submit payment evidence | Portal uploads JPG/PNG/WebP/PDF then calls `customer_submit_payment` | No native `customer_submit_payment` implementation found in audited repository layer | Missing | `payment-receipts` + RPC `customer_submit_payment` | Add native picker/upload/RPC adapter matching portal exactly |
| Open payment receipt | Signed `payment-receipts` URL | Present | Working backend | storage signed URL | Native open/share action |
| Invoice / print-PDF | Portal invoice/receipt view | Android has `CustomerInvoiceWriter` | Present | order/payment data | Align content with portal payment semantics |
| Delivery proof | Photo/signature/note/recipient after delivery | Android completion service loads proof | Working backend/partial UI | `delivery_proofs` | Native proof viewer |
| Rating | Customer rating after completion | Android completion service supports `customer_submit_rating` | Working backend/partial UI | RPC `customer_submit_rating` | Native rating card/modal |
| Profile view/edit | full name, phone, email, home address, individual/business, company | Present | Working backend/needs UI cleanup | `customer_update_profile` | Native profile card + edit form |
| Customer avatar | Android already supports avatar storage/RPC | Present (Android enhancement) | Working | existing customer avatar contracts | Keep only if current production contract remains valid |
| Device-location privacy control | Portal Profile exposes location-sharing control | Not equivalent in final Android UX | Partial/missing | device permission/local preference | Native privacy/location control |
| Notifications | Portal/customer notifications available | Android repository/ViewModel already loads/marks read | Working backend/partial UI | `my_notifications`, `mark_notification_read` | Native notifications sheet/page + badge |
| Loading / empty / error / retry | Portal has explicit states per feature | Inconsistent across current Android screens | Needs improvement | UI concern only | Define reusable native state components |
| 320/360/390/412dp + IME + safe areas | Required mobile behavior | Existing monolithic layout/runtime polish is fragile | Needs improvement | UI concern only | Screen-specific XML, WindowInsets, adjustResize, no horizontal overflow |

## Architecture decision

1. Keep `CustomerRepository`, `CustomerParityService`, `CustomerCompletionService` and their current production contracts where they already match Portal behavior.
2. Do not put new presentation logic into backend/data services.
3. Replace the monolithic/runtime-restyled presentation incrementally with authoritative native screens.
4. Prefer one screen/layout/controller path per destination instead of stacked UI-polisher adapters.
5. Each screen must have Loading / Content / Empty / Error states and localized strings.
6. No fake jobs, quote values, assignment media, GPS coordinates, routes or payment values.

## Build order

1. Auth: Login / Signup / Password Reset
2. Native app shell + fixed 6-item bottom navigation
3. Home dashboard
4. Book: Route autocomplete + full map + Cargo + Truck + Quote + Review + Success
5. Orders + filters + order details + cancellation
6. Track: live orders + driver/truck assignment + call/chat + full live GPS map
7. Payments: summary + receipt upload + verification states + invoice/receipt
8. Profile: edit + account type/company + avatar + device-location privacy + sign out
9. Notifications
10. EN/OR/AM, 320/360/390/412dp, IME, safe-area, accessibility and physical-device smoke

## Release gates

- Backend diff must remain empty outside Customer Android-specific client code.
- Unit tests + Android lint + debug build green.
- Full physical-device smoke: Login/Register → Home → Book → Route → Cargo → Truck → Quote → Review → Success → Orders → Track → Payments → Profile.
- Real MapTiler/route data only.
- Real Supabase live-trip data only.
- No crash/ANR/meaningful logcat errors.
- PR remains unmerged until device smoke passes.

# Driver Mobile V4 ↔ Driver Portal parity

This audit maps the authenticated Driver Portal to `apps/driver-mobile-app`.

## Scope guard

- Driver login/auth UI is intentionally unchanged.
- Existing `driver-v4.css` remains the visual base; parity styling is appended to that layer.
- No migration, RLS policy, finance rule, commission formula, pricing rule, or production data change is required.
- Mobile V4 reuses the same authenticated Supabase tables/RPCs used by the Driver Portal.

## Parity matrix

| Driver capability | Portal | Driver Mobile V4 |
| --- | --- | --- |
| Home operational summary | Driver shell + operational cards | Real profile, truck, jobs, finance, commission and document summary |
| Available jobs + claim | JobBoard | Existing real marketplace preserved |
| Driver availability | DriverAvailabilityCard / `driver_set_presence` | Added GPS-backed online/offline availability with LIVE/STALE state |
| Customer cancellation | DriverOrderCancellationNotice | Added latest assigned cancellation notice with reason and dismiss |
| Active trip route + GPS | ActiveTrip | Existing V4 route/GPS/offline queue preserved |
| Assigned customer contact | DriverCustomerContact / `driver_order_contact` | Added verified customer call card |
| Delivery proof | DriverDeliveryProofForm | Existing V4 photo/signature/payment-result flow preserved |
| Payment confirmation | DriverPaymentConfirmation + payment banner | Added trip status + Wallet pending confirmation/report-not-received actions |
| Wallet | DriverWallet | Existing deposit/released gross/trip history preserved |
| Earnings | Earnings | Consolidated into V4 Wallet financial summary and trip history |
| Commission | DriverCommission | Existing V4 commission summary/payment panel preserved |
| Documents | Documents | Existing V4 identity/vehicle upload, preview and review status preserved |
| Expiry warning | DriverDocumentExpiryAlert | Existing V4 expiry summary/warnings preserved in Profile |
| Notifications | Driver notifications | Existing realtime V4 notifications retained; moved to header access |
| HALLO Operations chat | DriverOperationsChatLauncher | Added secure realtime Driver ↔ Admin/CEO chat with unread count and order context |
| Primary mobile navigation | Home / Jobs / Trip / Wallet / Profile | Same five primary destinations; Alerts and Support are header utilities |

## Mobile layout rule

The primary bottom navigation is five columns so 320/360/390/412dp screens do not clip a sixth item. All new controls use the existing V4 tokens, safe-area spacing, and minimum mobile touch sizes.

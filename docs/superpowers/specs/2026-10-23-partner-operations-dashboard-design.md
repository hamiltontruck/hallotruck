# HALLO Partner operations dashboard

Status: approved by user, including lifecycle visibility below. The user selected dashboard, live map and driver management as the priority. Amazon Relay is a reference for operating a fleet; HALLO retains its own identity and business rules.

User-approved lifecycle: available work → accept → assign own driver/truck → track trip → verify delivery. Dashboard, Live map and Drivers support this flow and distinguish accepted work/awaiting HALLO confirmation, confirmed assignment awaiting start, in-transit work and delivered work. Existing HALLO confirmation, approval and payment rules remain authoritative; this work does not introduce Partner self-dispatch or a new delivery-confirmation write action. Delivery appears only from canonical delivered order status.

## Approach and boundaries

Build on existing React/HashRouter pages and scoped Supabase RPCs. A visual reskin alone would leave the fragmented workflow intact; replacing the backend would add risk without serving this scope. The selected implementation approach is a proposal by the builder, not an additional user requirement. No new dispatch model, self-dispatch, commission changes, payment bypass, account migration or simulated GPS is included.

## Dashboard

Make `/partner` and the successful Partner login destination an operations dashboard. Show the active organization, last successful refresh, fleet totals, active confirmed trips and attention items from authorized server data. Owners/admins also see approved-driver and onboarding counts where their RPC permissions allow them. Loading or denied reads are not represented as zero.

Provide clear Dashboard, Live map, Drivers and Workspace navigation with the organization retained in every link. Show active-trip summaries and direct actions to the existing fleet and driver screens. The legacy projects, payments, documents, activity/chat and fleet functions remain accessible through `/partner/workspace`; support the existing tab names via validated query parameters so the Fleet action opens the right tab. Jobs links remain available without changing assignment rules.

## Live map

Reuse the existing real telemetry and confirmed-trip authorization. Pair the map with a selectable trip list: plate, assigned driver, trip reference, status, last GPS age, and LIVE/STALE/OFFLINE. Selecting a located trip focuses its marker; selecting a marker selects its trip card. Missing coordinates are explained without inventing a location. An empty active-trip list still shows the base map. Render marker/popup values safely as text.

Refresh at the existing eight-second cadence while visible, with manual refresh, last-updated feedback and recoverable errors. Preserve the mounted map during refresh. Use scoped fleet/live reads and avoid unrelated maintenance/history downloads on each refresh. Switching organizations clears the previous organization's data immediately and ignores late responses. No valid GPS/telemetry response is replaced with a simulated position.

## Driver management

Owners/admins get searchable driver rows with approval status, assigned vehicle and relevant invitation/onboarding state. Provide status filters, counts and clear Add driver/invitation actions using the existing registration flow. Present registration state separately from driver approval. Explain missing vehicle linkage and pending HALLO review. Do not label an approved driver dispatch-ready unless existing server data establishes readiness. HALLO remains responsible for document review and approval; Partner users cannot approve themselves or edit another organization's driver.

Viewer/editor memberships receive only data/actions permitted by existing RPCs; hidden management controls never substitute for server authorization. Driver portal, HALLO driver separation and session isolation during invitations stay intact.

## Builder decisions after feasibility review

- Count active confirmed trips only after successful `partner_get_live_trip` reads, not merely fleet `active_trip_id` values. Use the current freshness classifier rather than new thresholds.
- Use `fleet_enterprise_vehicles` and `fleet_enterprise_summary` directly for operational snapshots. Maintain independent errors for fleet, telemetry and owner/admin driver sources. Attention items come from available expiry/service alerts, missing vehicle linkage, pending registrations and telemetry warnings; no document-level progress is invented.
- Join registrations to roster with `registration.driver_id === roster.id`; retain unclaimed invitations separately. Count approved drivers from the roster. Private invitation links are generated for manual sharing; no email/SMS sending is added.
- Preserve viewport during polling; fit once initially and on deliberate selection. Clear disappeared selections, validate coordinates and display map-key/tile failures visibly.
- Apply organization race protection to dashboard, drivers and legacy workspace. Validate requested workspace tabs against that membership's permitted tabs. Restricted driver access is explicit and does not invoke manager-only RPCs.

## Verification and release

Test data aggregation and restricted membership behavior, organization-switch races, empty/error/refresh states, driver search/filter/invitation flow, and trip-card/marker selection. Browser checks cover 320–768px layouts, navigation and deep links without production writes. Keep current SQL tenant/ownership tests and full regression/build checks passing. Real-account consent and physical-device GPS remain separate from fixture browser checks.

Implement in an isolated branch based on current production main, independently review, then merge and deploy through the normal GitHub Pages checks. Verify the public release and production backend configuration. No database migration is expected; a newly discovered requirement that changes business authority or schema returns for review before implementation.

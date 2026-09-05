# HALLO Supabase RPC/RLS security audit — 2026-09-05

Scope: application-owned PostgreSQL `SECURITY DEFINER` RPCs, EXECUTE grants, private helper exposure, RLS gaps/performance warnings, and PostGIS ownership. This audit was performed against HALLO Supabase and repository `main` at commit `47f6f3ee0e4d199f9543ef197db0bddb201d690d`.

No production migration was applied. No production data was edited. No merge or deployment is part of this audit.

## Classification

- **A — authenticated execution intentionally required:** signed-in application clients intentionally call the RPC; no elevated role override is exposed.
- **B — leadership-only:** authenticated may have EXECUTE, but the function must enforce active Admin/CEO authorization from current database profile state before privileged work.
- **C — role/self scoped:** authenticated execution is intentional, with customer/driver/partner/own-resource scope enforced inside the function or a trusted delegated helper.
- **D — internal-only:** browser/mobile clients should not execute it directly; service/database/trigger/internal callers only.

Trigger-returning functions are not counted as RPCs below because PostgreSQL cannot invoke them as ordinary RPC calls. Their ACLs were audited separately under **Private/internal helper exposure**.

### Inventory summary

| Class | RPCs | Result |
| --- | ---: | --- |
| A | 4 | Intentional authenticated quote/pricing surface |
| B | 53 | Active Admin/CEO database-profile authorization verified directly or through guarded delegation |
| C | 70 | Self/role/tenant scoping verified directly or through trusted helper/delegation |
| D | 42 | Internal/service surface; one execute-grant regression requires hardening |
| **Total** | **169** | Application-owned, non-trigger `SECURITY DEFINER` RPCs audited |

For the audited application-owned public RPC surface, no RPC has direct `anon` EXECUTE. The PostGIS `st_estimatedextent` functions flagged separately by the advisor are extension-owned and are not HALLO application RPCs.

## A — authenticated execution intentionally required (4)

All four are read/compute quote-pricing APIs used by signed-in application clients. `anon` EXECUTE is denied and `authenticated` EXECUTE is intentional.

- `public.calculate_transport_quote(p_distance_km numeric, p_vehicle_type text, p_cargo_tons numeric)`
- `public.calculate_transport_quote_v2(p_distance_km numeric, p_vehicle_type text, p_cargo_tons numeric)`
- `public.get_quote_pricing_rules()`
- `public.get_quote_pricing_rules_v2()`

Client call sites were verified for the V2 quote/rules RPCs in the web/customer mobile quote services. No privileged mutation is performed through this class.

## B — leadership-only (53)

Every authenticated-executable Admin RPC below was inspected. Each has a direct current-database leadership check using `private.is_admin_or_ceo()` / `private.require_active_leadership()`, or delegates to another Admin RPC that performs that check before mutation/read. No audited B function relies on `user_metadata` for leadership authorization.

- `public.admin_activate_partner_commission_rule(p_partner_id uuid, p_commission_type text, p_commission_value numeric, p_effective_from date)`
- `public.admin_approve_driver_onboarding(p_driver_id uuid)`
- `public.admin_assign_fleet_driver(p_truck_id uuid, p_driver_id uuid, p_reason text)`
- `public.admin_assign_order(p_order_id uuid, p_truck_id uuid, p_driver_id uuid)`
- `public.admin_cancel_partner_job_request(p_request_id uuid, p_reason text)`
- `public.admin_confirm_partner_job_request(p_request_id uuid, p_request_key uuid)`
- `public.admin_create_partner_organization(p_name text, p_code text, p_contact_email text, p_contact_phone text, p_status text)`
- `public.admin_create_partner_settlement(p_partner_id uuid, p_amount_etb numeric, p_provider text, p_transaction_ref text, p_note text)` — delegates to guarded `admin_create_partner_settlement_request`
- `public.admin_create_partner_settlement_request(p_partner_id uuid, p_amount_etb numeric, p_project_id uuid, p_note text, p_request_key uuid)`
- `public.admin_customer_driver_reconciliation()`
- `public.admin_delete_cancelled_order(p_order_id uuid)`
- `public.admin_driver_chat_inbox()`
- `public.admin_finalize_driver_onboarding(p_driver_id uuid)`
- `public.admin_get_customer_dispatch_request(p_order_id uuid)`
- `public.admin_get_or_create_driver_chat_thread(p_driver_id uuid)`
- `public.admin_offer_partner_job(p_order_id uuid, p_partner_id uuid, p_note text, p_request_key uuid)`
- `public.admin_onboard_partner_member(p_partner_id uuid, p_user_id uuid, p_member_role partner_member_role, p_active boolean, p_confirm_role_replacement boolean)`
- `public.admin_order_assignment_candidates(p_order_id uuid)`
- `public.admin_partner_members(p_partner_id uuid)`
- `public.admin_partner_organization_overview()`
- `public.admin_payment_integrity_report()`
- `public.admin_payment_reference_conflicts()`
- `public.admin_place_partner_order(p_order_id uuid, p_request_key uuid)`
- `public.admin_platform_commission_accruals()`
- `public.admin_quote_partner_order(p_order_id uuid, p_quote_amount_etb numeric, p_quote_expires_at timestamptz, p_admin_notes text, p_request_key uuid)`
- `public.admin_record_driver_deposit(p_driver_id uuid, p_amount_etb numeric, p_reference text, p_note text)`
- `public.admin_record_partner_freight(p_partner_id uuid, p_order_id uuid, p_vehicle_id uuid)`
- `public.admin_record_partner_freight(p_partner_id uuid, p_order_id uuid, p_vehicle_id uuid, p_project_id uuid)`
- `public.admin_record_partner_settlement_payment(p_settlement_id uuid, p_amount_etb numeric, p_payment_method text, p_provider text, p_transaction_ref text, p_paid_at timestamptz, p_request_key uuid)`
- `public.admin_record_payment(p_order_id uuid, p_provider text, p_provider_ref text, p_amount_etb numeric, p_event payment_event)`
- `public.admin_release_confirmed_driver_payment(p_payment_id uuid)`
- `public.admin_restore_driver(p_driver_id uuid)`
- `public.admin_restore_legacy_excess_refund(p_refund_payment_id uuid, p_amount_etb numeric, p_reason text, p_external_evidence_reference text, p_request_key uuid)`
- `public.admin_reverse_driver_commission_deposit(p_deposit_id uuid, p_reason text)`
- `public.admin_reverse_partner_settlement(p_settlement_id uuid, p_reason text, p_request_key uuid)`
- `public.admin_reverse_payment(p_payment_id uuid, p_amount_etb numeric, p_reason text, p_correction_type text, p_request_key uuid)`
- `public.admin_review_customer_payment(p_payment_id uuid, p_approve boolean, p_rejection_reason text)`
- `public.admin_review_driver_commission_payment(p_payment_id uuid, p_approve boolean, p_rejection_reason text)`
- `public.admin_review_driver_verification_document(p_document_id uuid, p_expected_file_path text, p_status text, p_rejection_reason text)`
- `public.admin_search_partner_profiles(p_query text, p_limit integer)`
- `public.admin_set_partner_organization_status(p_partner_id uuid, p_status text)`
- `public.admin_set_truck_operational_status(p_truck_id uuid, p_status text)` — delegates to guarded three-argument overload
- `public.admin_set_truck_operational_status(p_truck_id uuid, p_status text, p_reason text)`
- `public.admin_start_partner_order_review(p_order_id uuid, p_admin_notes text, p_request_key uuid)`
- `public.admin_suspend_driver(p_driver_id uuid)`
- `public.admin_transfer_partner_ownership(p_partner_id uuid, p_from_membership_id uuid, p_to_membership_id uuid)`
- `public.admin_transition_order(p_order_id uuid, p_status order_status)`
- `public.admin_transition_partner_settlement(p_settlement_id uuid, p_action text, p_notes text)`
- `public.admin_update_partner_membership(p_membership_id uuid, p_member_role partner_member_role, p_active boolean)`
- `public.admin_update_payment_event(p_payment_id uuid, p_event payment_event)`
- `public.admin_update_quote_pricing_rule(p_vehicle_key text, p_rate_per_km numeric, p_rate_per_ton numeric, p_base_fee_etb numeric, p_minimum_fare_etb numeric, p_market_adjustment_percent numeric)`
- `public.admin_update_quote_pricing_rule_v2(p_vehicle_key text, p_rate_per_ton_km numeric, p_base_fee_etb numeric, p_minimum_fare_etb numeric, p_market_adjustment_percent numeric)`
- `public.admin_upsert_driver_document(p_driver_id uuid, p_truck_id uuid, p_document_key text, p_file_path text, p_original_name text, p_mime_type text, p_expiry_date date, p_verify boolean, p_source_note text)`

`private.require_active_leadership()` resolves `auth.uid()` and queries `public.profiles` for `role IN ('admin','ceo')` while rejecting `driver_status='suspended'`. It only normalizes legacy `app_metadata.role` after the current database profile has already passed authorization. This means demotion or suspension fails closed without waiting for token refresh.

## C — role/self scoped (70)

These are intentionally authenticated but enforce current actor ownership, customer/driver assignment, active Partner membership, organization identity, or a trusted helper/delegated scoped RPC.

- `private.can_manage_partner(p_partner_id uuid)`
- `private.is_admin_or_ceo()`
- `private.is_partner_member(p_partner_id uuid)`
- `public.can_view_partner_finance(p_partner_id uuid)`
- `public.claim_order(p_order_id uuid)`
- `public.claim_order_with_truck(p_order_id uuid, p_truck_id uuid)`
- `public.create_fleet_branch(p_partner_id uuid, p_name text, p_code text, p_address text)`
- `public.create_fleet_vehicle(p_partner_id uuid, p_plate_number text, p_vehicle_type text, p_capacity_tons numeric, p_ownership_type text, p_fuel_type text, p_branch_id uuid)`
- `public.create_truck_maintenance_record(p_truck_id uuid, p_maintenance_type text, p_status text, p_service_date date, p_odometer_km numeric, p_cost_etb numeric, p_vendor text, p_notes text, p_next_service_date date, p_next_service_odometer_km numeric)`
- `public.customer_can_read_assignment_photo(p_object_name text)`
- `public.customer_cancel_order(p_order_id uuid, p_reason text)`
- `public.customer_driver_assignment_cards()`
- `public.customer_get_dispatch_request(p_order_id uuid)`
- `public.customer_get_live_trip(p_order_id uuid)`
- `public.customer_get_profile()`
- `public.customer_order_assignment_candidates(p_order_id uuid)`
- `public.customer_request_dispatch_candidate(p_order_id uuid, p_driver_id uuid, p_truck_id uuid)`
- `public.customer_submit_payment(p_order_id uuid, p_provider text, p_provider_ref text, p_amount_etb numeric, p_receipt_path text)`
- `public.customer_submit_rating(p_order_id uuid, p_score smallint, p_comment text)`
- `public.customer_update_profile(p_full_name text, p_phone text, p_email text, p_home_address text, p_customer_type text, p_company_name text)`
- `public.driver_available_trucks_for_order(p_order_id uuid)`
- `public.driver_can_view_available_order(p_order_id uuid, p_vehicle_type text, p_cargo_weight_tons numeric)`
- `public.driver_collected_payment_status(p_order_id uuid)`
- `public.driver_commission_balance(p_driver_id uuid)`
- `public.driver_confirm_verified_payment(p_payment_id uuid)`
- `public.driver_financial_summary(p_driver_id uuid)`
- `public.driver_finish_trip(p_order_id uuid, p_recipient_name text, p_delivery_note text, p_photo_path text, p_signature_path text, p_result_type text, p_amount_collected numeric, p_payment_note text)`
- `public.driver_get_or_create_chat_thread()`
- `public.driver_has_matching_ready_truck(p_vehicle_type text, p_cargo_weight_tons numeric)`
- `public.driver_order_contact(p_order_id uuid)`
- `public.driver_payment_status(p_order_id uuid)`
- `public.driver_record_trip_payment_result(p_order_id uuid, p_result_type text, p_amount_collected numeric, p_note text)`
- `public.driver_register_vehicle_profile(p_plate_number text, p_vehicle_type text, p_capacity_tons numeric)`
- `public.driver_report_payment_not_received(p_payment_id uuid, p_reason text)`
- `public.driver_save_vehicle_profile(p_plate_number text, p_vehicle_type text, p_capacity_tons numeric)`
- `public.driver_set_presence(p_is_available boolean, p_lat numeric, p_lng numeric, p_accuracy_m numeric)`
- `public.driver_submit_collected_payment(p_order_id uuid, p_collection_method text, p_provider text, p_provider_ref text, p_amount_etb numeric, p_receipt_path text, p_note text)`
- `public.driver_unreported_deliveries()`
- `public.fleet_enterprise_summary(p_partner_id uuid)` — delegates to scoped fleet inventory
- `public.fleet_enterprise_vehicles(p_partner_id uuid)`
- `public.get_available_jobs()`
- `public.get_latest_tracking_point(p_order_id uuid)`
- `public.is_admin()`
- `public.is_approved_driver()`
- `public.mark_driver_chat_read(p_thread_id uuid)`
- `public.mark_notification_read(p_notification_id uuid)`
- `public.my_android_devices()`
- `public.my_driver_chat_unread_count()`
- `public.my_driver_commission_summary()`
- `public.my_notifications(p_limit integer)`
- `public.order_payment_financial_summary(p_order_id uuid)`
- `public.partner_create_project(p_partner_id uuid, p_name text, p_description text, p_request_key uuid)`
- `public.partner_login_access()`
- `public.partner_register_document(p_partner_id uuid, p_project_id uuid, p_folder_id uuid, p_file_name text, p_storage_path text, p_mime_type text, p_size_bytes bigint, p_request_key uuid)`
- `public.partner_respond_job_request(p_request_id uuid, p_action text, p_truck_id uuid, p_note text, p_request_key uuid)`
- `public.partner_respond_to_order_quote(p_order_id uuid, p_action text, p_reason text, p_request_key uuid)`
- `public.partner_save_order_draft(p_partner_id uuid, p_order_id uuid, p_payload jsonb, p_request_key uuid)`
- `public.partner_submit_order(p_order_id uuid, p_reason text, p_request_key uuid)`
- `public.partner_update_project_progress(p_project_id uuid, p_progress integer, p_note text, p_request_key uuid)`
- `public.partner_wallet_summary(p_partner_id uuid)`
- `public.register_android_device(p_android_device_id text, p_fcm_token text, p_app_version text)`
- `public.send_driver_chat_message(p_thread_id uuid, p_body text, p_order_id uuid, p_client_message_id uuid, p_message_kind text)`
- `public.submit_delivery_proof(p_order_id uuid, p_recipient_name text, p_delivery_note text, p_photo_path text, p_signature_path text)`
- `public.submit_driver_commission_payment(p_provider text, p_transaction_id text, p_amount_etb numeric, p_receipt_path text)`
- `public.touch_android_device(p_android_device_id text, p_app_version text)`
- `public.trip_completion_summary(p_order_id uuid)`
- `public.unregister_android_device(p_android_device_id text)`
- `public.update_android_notification_preferences(p_android_device_id text, p_locale text, p_notifications_enabled boolean)`
- `public.update_fleet_vehicle_profile(p_truck_id uuid, p_ownership_type text, p_fuel_type text, p_branch_id uuid, p_current_odometer_km numeric, p_insurance_expiry date, p_license_expiry date, p_roadworthiness_expiry date, p_reason text)`
- `public.update_truck_maintenance_status(p_record_id uuid, p_status text, p_reason text)`

### Partner tenant boundary verification

Partner finance and mutation paths do not trust a caller-provided organization identifier by itself:

- `private.can_manage_partner()` requires exact `membership.partner_id = p_partner_id`, `membership.user_id = auth.uid()`, active membership, owner/admin/editor role, and active organization; leadership override is database-backed.
- `public.can_view_partner_finance()` requires the same organization match and only owner/admin for non-leadership finance access.
- Partner order/job RPCs resolve the persisted Partner order/request first, then require the actor membership to match that persisted `partner_id`.
- Partner job acceptance additionally restricts the selected truck to `trucks.partner_id = request.partner_id` and verifies the Partner fleet record against the same organization.

Therefore a Partner member cannot cross organization boundaries merely by supplying another organization/order/truck UUID.

## D — internal-only (42)

Authenticated clients should not execute these directly. Most are already service-role/database-only. `order_payment_ready_for_dispatch()` is the one confirmed current grant regression: a later finance migration recreated it and re-granted `authenticated` after an earlier migration had correctly restricted it to internal/service use. Repository call-site search found database-side consumers and no browser/mobile RPC call, so the minimal patch safely restores the intended boundary.

- `private.can_manage_partner_fleet(p_partner_id uuid)`
- `private.next_partner_settlement_reference()`
- `private.record_partner_freight_internal(p_partner_id uuid, p_order_id uuid, p_vehicle_id uuid, p_project_id uuid)`
- `private.record_partner_settlement_event(p_settlement_id uuid, p_partner_id uuid, p_event_type text, p_from_status text, p_to_status text, p_amount_etb numeric, p_reason text, p_actor_id uuid, p_metadata jsonb)`
- `private.require_active_leadership(p_operation text, p_allow_service_role boolean)`
- `public.admin_approve_driver_onboarding_unchecked_188(p_driver_id uuid)`
- `public.admin_assign_order_unchecked_188(p_order_id uuid, p_truck_id uuid, p_driver_id uuid)`
- `public.admin_finalize_driver_onboarding_unchecked_188(p_driver_id uuid)`
- `public.admin_get_customer_dispatch_request_unchecked_188(p_order_id uuid)`
- `public.admin_mark_partner_settlement_paid(p_settlement_id uuid)`
- `public.admin_order_assignment_candidates_unchecked_188(p_order_id uuid)`
- `public.admin_record_driver_deposit_unchecked_188(p_driver_id uuid, p_amount_etb numeric, p_reference text, p_note text)`
- `public.admin_record_payment_unchecked_188(p_order_id uuid, p_provider text, p_provider_ref text, p_amount_etb numeric, p_event payment_event)`
- `public.admin_refund_order_credit(p_order_id uuid)`
- `public.admin_restore_driver_unchecked_188(p_driver_id uuid)`
- `public.admin_reverse_driver_commission_deposit_unchecked_188(p_deposit_id uuid, p_reason text)`
- `public.admin_review_driver_commission_payment_unchecked_188(p_payment_id uuid, p_approve boolean, p_rejection_reason text)`
- `public.admin_suspend_driver_unchecked_188(p_driver_id uuid)`
- `public.admin_transition_order_unchecked_188(p_order_id uuid, p_status order_status)`
- `public.admin_update_quote_pricing_rule_unchecked_188(p_vehicle_key text, p_rate_per_km numeric, p_rate_per_ton numeric, p_base_fee_etb numeric, p_minimum_fare_etb numeric, p_market_adjustment_percent numeric)`
- `public.admin_update_quote_pricing_rule_v2_unchecked_188(p_vehicle_key text, p_rate_per_ton_km numeric, p_base_fee_etb numeric, p_minimum_fare_etb numeric, p_market_adjustment_percent numeric)`
- `public.admin_upsert_driver_document_unchecked_188(p_driver_id uuid, p_truck_id uuid, p_document_key text, p_file_path text, p_original_name text, p_mime_type text, p_expiry_date date, p_verify boolean, p_source_note text)`
- `public.claim_push_notifications(p_limit integer)`
- `public.cleanup_tracking_pings(p_retention_days integer)`
- `public.complete_order(p_order_id uuid)`
- `public.complete_push_notification(p_outbox_id uuid, p_status text, p_error text)`
- `public.customer_get_live_trip_unchecked_188(p_order_id uuid)`
- `public.customer_submit_payment(p_order_id uuid, p_provider text, p_provider_ref text, p_amount_etb numeric)` — legacy internal overload
- `public.dispatch_documents_valid(p_driver_id uuid, p_truck_id uuid)`
- `public.driver_commission_balance_unchecked_188(p_driver_id uuid)`
- `public.driver_financial_summary_unchecked_188(p_driver_id uuid)`
- `public.enqueue_document_expiry_notifications()`
- `public.enqueue_user_notification(p_user_id uuid, p_event_type text, p_title text, p_body text, p_data jsonb, p_dedupe_key text, p_expires_at timestamptz)`
- `public.invoke_push_dispatch()`
- `public.order_payment_ready_for_dispatch(p_order_id uuid)` — **current authenticated EXECUTE is a regression; patch restores D boundary**
- `public.recompute_order_payment_status(p_order_id uuid)`
- `public.record_driver_tracking_ping(p_driver_id uuid, p_order_id uuid, p_lng double precision, p_lat double precision, p_heading numeric, p_speed_kmh numeric, p_accuracy_m numeric, p_source_recorded_at timestamptz, p_android_device_id text)`
- `public.release_confirmed_driver_payment_internal(p_payment_id uuid)`
- `public.release_stale_push_claims()`
- `public.submit_delivery_proof_unchecked_188(p_order_id uuid, p_recipient_name text, p_delivery_note text, p_photo_path text, p_signature_path text)`
- `public.validate_push_dispatch_secret(p_secret text)`
- `public.vehicle_billing_capacity_tons(p_vehicle_type text)`

## EXECUTE grant audit

### Public application RPCs

- Direct `anon` EXECUTE on application-owned public non-trigger `SECURITY DEFINER` RPCs: **0**.
- `authenticated` is retained only for A, B, C, plus the identified D regression pending migration application.
- `service_role` remains on service workflows and on most public A/B/C functions where existing backend flows require it.
- `_unchecked_188` implementations remain non-executable by `authenticated`; guarded wrappers are the client surface.

### Private schema helpers

`private` schema gives `authenticated` USAGE because RLS policies invoke selected helpers. That does not justify broad function EXECUTE.

Expected authenticated helper EXECUTE is limited to:

- `private.is_admin_or_ceo()` — needed by RLS policies; current database profile + suspension check.
- `private.is_partner_member(uuid)` — needed by tenant RLS policies.
- `private.can_manage_partner(uuid)` — needed by Partner mutation/storage RLS policies.

Other private security-definer helpers are internal. One trigger-only helper, `private.reject_driver_trip_payment_result_mutation()`, had a null ACL and therefore PostgreSQL default PUBLIC EXECUTE. The patch explicitly revokes direct API-role execution. Trigger behavior is preserved.

## Authorization source audit

- Leadership authorization is derived from `public.profiles.role` plus current suspended state, not caller-controlled `user_metadata`.
- Partner authorization is derived from persisted memberships/organization status and `auth.uid()`.
- Driver/customer self scope is derived from `auth.uid()`, persisted role/status, order assignment/ownership, or a guarded delegated RPC.
- `public.handle_new_driver()` reads `auth.users.raw_user_meta_data.role` only to choose the non-privileged signup class `customer` versus default `driver`; it never accepts Admin/CEO/Partner authority from user metadata. This is onboarding classification, not privileged authorization.

## RLS-enabled tables with no policies

The three advisor findings are intentional deny-by-default/internal surfaces and should not receive broad policies merely to clear a warning:

| Table | Owner | Direct anon/auth access | Service role | Decision |
| --- | --- | --- | --- | --- |
| `private.payment_reference_registry` | `postgres` | none | none | Keep no policies; owner/internal helper only |
| `public.quote_pricing_audit` | `postgres` | none | table privileges present for service role | Keep no policies; internal audit/service surface |
| `public.quote_pricing_rules` | `postgres` | none | table privileges present for service role | Keep no policies; authenticated reads use guarded quote RPCs |

## `spatial_ref_sys` / PostGIS

`public.spatial_ref_sys` is **not HALLO application-owned**. It is an extension member of PostGIS `3.3.7`; the table owner and PostGIS extension owner are `supabase_admin`. RLS is disabled as part of the extension-managed PostGIS surface.

Decision: **do not enable RLS and do not alter its ACL in this patch.** Treating an extension-owned system catalog as an application table risks breaking PostGIS behavior/upgrades and is outside HALLO authorization ownership.

The advisor also reports `postgis` and `pg_net` installed in `public`; this audit does not relocate extensions because that is a separate compatibility/extension lifecycle change, not minimal RPC/RLS hardening.

## RLS policy findings and minimal patch

Ten `auth_rls_initplan` warnings were confirmed. The migration rewrites only the affected auth/helper expressions with `select` wrappers so the helper can be initialized once per statement while preserving policy semantics:

1. `orders: customer creates`
2. `tracking: driver inserts own`
3. `profiles: self or admin read`
4. `docs: driver own or admin`
5. `tracking: participants or admin read`
6. `driver verification history own read`
7. `mobile_devices_select_own_or_admin`
8. `notifications: user reads own`
9. `push outbox: admin reads`
10. `push deliveries: admin reads`

Three of those policies also had stale-token leadership authorization using `auth.jwt()->app_metadata.role`:

- `mobile_devices_select_own_or_admin`
- `push outbox: admin reads`
- `push deliveries: admin reads`

They are changed to `private.is_admin_or_ceo()`, which checks current `public.profiles` state and therefore fails closed after Admin/CEO suspension or demotion.

The advisor also reports multiple-permissive-policy and unused-index findings. They are deliberately not bundled into this patch because consolidating permissive policies or dropping indexes can change authorization/query behavior and requires a separate workload-specific review.

## Regression verification matrix

| Requirement | Evidence/coverage |
| --- | --- |
| Customer cannot execute Admin/CEO mutations | B functions use database-backed leadership guard; existing suspended-leadership regression suite checks guarded Admin wrappers |
| Driver cannot execute Admin/CEO mutations | Same B boundary; no role from user metadata is accepted for privileged authorization |
| Partner cannot cross organization boundaries | Partner finance/order/job functions require actor membership against persisted `partner_id`; existing Partner finance regression includes cross-organization denial |
| Suspended/demoted leadership fails closed | `private.require_active_leadership()` / `private.is_admin_or_ceo()` query current profile; mobile/push RLS migrated off stale JWT role |
| Admin/CEO intended operations still work | Authenticated EXECUTE on guarded B wrappers is retained; no blanket revocation of Admin RPCs |
| Internal dispatch helper not exposed | New migration restores `order_payment_ready_for_dispatch(uuid)` to service/internal execution only after client call-site verification |
| PostGIS not broken by blind RLS | Migration contains no PostGIS/system-table alteration |
| RLS init-plan warnings | Ten affected policies receive semantics-preserving select-wrapped auth/helper expressions |

New regression suite: `tests/regression/rpc-rls-security-audit.test.ts`.

## Prepared changes

- `supabase/migrations/20260905213000_rpc_rls_security_audit_hardening.sql`
- `tests/regression/rpc-rls-security-audit.test.ts`
- `scripts/run-regression-tests.mjs` updated to include the new suite

These changes are preparation only. Production migration application, merge, and deployment remain explicitly out of scope.

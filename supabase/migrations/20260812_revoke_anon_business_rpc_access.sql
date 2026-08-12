-- Defense in depth: business RPCs are for signed-in application users only.
-- Their internal role/ownership checks remain the authoritative authorization layer.

revoke all on function public.admin_assign_order(uuid, uuid, uuid) from anon;
revoke all on function public.admin_record_payment(uuid, text, text, numeric, public.payment_event) from anon;
revoke all on function public.admin_refund_order_credit(uuid) from anon;
revoke all on function public.admin_restore_driver(uuid) from anon;
revoke all on function public.admin_review_driver_commission_payment(uuid, boolean, text) from anon;
revoke all on function public.admin_suspend_driver(uuid) from anon;
revoke all on function public.admin_transition_order(uuid, public.order_status) from anon;
revoke all on function public.admin_update_payment_event(uuid, public.payment_event) from anon;
revoke all on function public.claim_order(uuid) from anon;
revoke all on function public.claim_order_with_truck(uuid, uuid) from anon;
revoke all on function public.complete_order(uuid) from anon;
revoke all on function public.customer_driver_assignment_cards() from anon;
revoke all on function public.customer_get_live_trip(uuid) from anon;
revoke all on function public.customer_submit_payment(uuid, text, text, numeric) from anon;
revoke all on function public.customer_submit_payment(uuid, text, text, numeric, text) from anon;
revoke all on function public.driver_available_trucks_for_order(uuid) from anon;
revoke all on function public.driver_commission_balance(uuid) from anon;
revoke all on function public.get_available_jobs() from anon;
revoke all on function public.is_admin() from anon;
revoke all on function public.is_approved_driver() from anon;
revoke all on function public.my_driver_commission_summary() from anon;
revoke all on function public.recompute_order_payment_status(uuid) from anon;
revoke all on function public.submit_delivery_proof(uuid, text, text, text, text) from anon;
revoke all on function public.submit_driver_commission_payment(text, text, numeric, text) from anon;

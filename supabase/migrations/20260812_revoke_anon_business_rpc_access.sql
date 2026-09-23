-- Defense in depth: business RPCs are for signed-in application users only.
-- Their internal role/ownership checks remain the authoritative authorization layer.
-- Some RPCs were introduced by later historical migrations; clean replay must skip missing signatures.

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.admin_assign_order(uuid,uuid,uuid)',
    'public.admin_record_payment(uuid,text,text,numeric,public.payment_event)',
    'public.admin_refund_order_credit(uuid)',
    'public.admin_restore_driver(uuid)',
    'public.admin_review_driver_commission_payment(uuid,boolean,text)',
    'public.admin_suspend_driver(uuid)',
    'public.admin_transition_order(uuid,public.order_status)',
    'public.admin_update_payment_event(uuid,public.payment_event)',
    'public.claim_order(uuid)',
    'public.claim_order_with_truck(uuid,uuid)',
    'public.complete_order(uuid)',
    'public.customer_driver_assignment_cards()',
    'public.customer_get_live_trip(uuid)',
    'public.customer_submit_payment(uuid,text,text,numeric)',
    'public.customer_submit_payment(uuid,text,text,numeric,text)',
    'public.driver_available_trucks_for_order(uuid)',
    'public.driver_commission_balance(uuid)',
    'public.get_available_jobs()',
    'public.is_admin()',
    'public.is_approved_driver()',
    'public.my_driver_commission_summary()',
    'public.recompute_order_payment_status(uuid)',
    'public.submit_delivery_proof(uuid,text,text,text,text)',
    'public.submit_driver_commission_payment(text,text,numeric,text)'
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke all on function %s from anon', v_signature);
    end if;
  end loop;
end;
$$;
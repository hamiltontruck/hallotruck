begin;

-- This SECURITY DEFINER helper is used only by trusted database-side dispatch
-- guards and service-role workflows. Direct authenticated execution leaks a
-- boolean about another order's payment readiness when its UUID is known.
revoke all on function public.order_payment_ready_for_dispatch(uuid)
  from public, anon, authenticated;

grant execute on function public.order_payment_ready_for_dispatch(uuid)
  to service_role;

commit;

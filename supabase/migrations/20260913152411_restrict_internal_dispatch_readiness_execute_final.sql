begin;

-- Internal payment-readiness helper is consumed by guarded SECURITY DEFINER
-- driver helpers and dispatch triggers. It is not an end-user RPC endpoint.
revoke execute on function public.order_payment_ready_for_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.order_payment_ready_for_dispatch(uuid) to service_role;

commit;

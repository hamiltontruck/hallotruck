create or replace function public.admin_reports_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin_or_ceo() then
    raise exception 'Admin or CEO access required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'totalOrders', (select count(*) from public.orders),
    'deliveredOrders', (select count(*) from public.orders where status = 'delivered'),
    'activeShipments', (select count(*) from public.orders where status in ('accepted', 'in_transit')),
    'waitingAssignment', (select count(*) from public.orders where status = 'placed'),
    'totalTrucks', (select count(*) from public.trucks),
    'availableTrucks', (select count(*) from public.trucks where status = 'available'),
    'assignedTrucks', (select count(*) from public.trucks where status = 'assigned'),
    'totalDrivers', (select count(*) from public.profiles where role = 'driver'),
    'approvedDrivers', (select count(*) from public.profiles where role = 'driver' and driver_status = 'approved'),
    'totalCustomers', (select count(*) from public.customers),
    'releasedGrossEtb', (select coalesce(sum(amount_etb), 0) from public.payments where event = 'released'),
    'refundedEtb', (select coalesce(sum(amount_etb), 0) from public.payments where event = 'refunded'),
    'heldEscrowEtb', (select coalesce(sum(amount_etb), 0) from public.payments where event = 'held_escrow'),
    'initiatedEtb', (select coalesce(sum(amount_etb), 0) from public.payments where event = 'initiated'),
    'paymentsNeedingVerification', (select count(*) from public.payments where event = 'initiated')
  );
end;
$$;

revoke execute on function public.admin_reports_summary() from public;
revoke execute on function public.admin_reports_summary() from anon;
grant execute on function public.admin_reports_summary() to authenticated;

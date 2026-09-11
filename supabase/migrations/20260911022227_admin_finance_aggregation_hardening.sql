begin;

create index if not exists payments_created_at_desc_idx
  on public.payments (created_at desc, id desc);

create index if not exists delivery_proofs_delivered_at_desc_idx
  on public.delivery_proofs (delivered_at desc, id desc);

create or replace function public.admin_finance_dashboard_summary()
returns table (
  released_total_etb numeric,
  refunded_total_etb numeric,
  held_total_etb numeric,
  initiated_total_etb numeric,
  payment_count bigint,
  delivery_proof_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin_or_ceo() then
    raise exception 'Admin or CEO access required' using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(p.amount_etb) filter (where p.event = 'released'::public.payment_event), 0)::numeric,
    coalesce(sum(p.amount_etb) filter (where p.event = 'refunded'::public.payment_event), 0)::numeric,
    coalesce(sum(p.amount_etb) filter (where p.event = 'held_escrow'::public.payment_event), 0)::numeric,
    coalesce(sum(p.amount_etb) filter (where p.event = 'initiated'::public.payment_event), 0)::numeric,
    count(p.id)::bigint,
    (select count(*)::bigint from public.delivery_proofs)
  from public.payments p;
end;
$$;

revoke all on function public.admin_finance_dashboard_summary() from public, anon;
grant execute on function public.admin_finance_dashboard_summary() to authenticated;

commit;

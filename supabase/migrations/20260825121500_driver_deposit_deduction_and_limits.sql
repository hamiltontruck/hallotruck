-- Driver commission deposits are prepaid wallet funds.
-- Active commission charges consume the wallet balance automatically.

create or replace function public.admin_record_driver_deposit(
  p_driver_id uuid,
  p_amount_etb numeric,
  p_reference text default null,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role','');
  v_id uuid;
  v_reference text := nullif(btrim(coalesce(p_reference,'')), '');
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
begin
  if v_actor is null or v_role not in ('admin','ceo') then
    raise exception 'Admin or CEO role required';
  end if;
  if p_amount_etb is null or p_amount_etb < 5000 or p_amount_etb > 100000 then
    raise exception 'Deposit amount must be between ETB 5,000 and ETB 100,000';
  end if;
  if v_reference is not null and char_length(v_reference) > 120 then
    raise exception 'Reference must be 120 characters or fewer';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Deposit note must be 500 characters or fewer';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_driver_id and role = 'driver'
  ) then
    raise exception 'Driver not found';
  end if;

  insert into public.driver_commission_deposits(
    driver_id, amount_etb, reference, note, created_by
  ) values (
    p_driver_id, round(p_amount_etb,2), v_reference, v_note, v_actor
  ) returning id into v_id;

  insert into public.driver_commission_audit(driver_id, action, actor_id, details)
  values (
    p_driver_id,
    'deposit_added',
    v_actor,
    jsonb_build_object(
      'deposit_id', v_id,
      'amount_etb', round(p_amount_etb,2),
      'reference', v_reference,
      'note', v_note
    )
  );

  return v_id;
end;
$$;

create or replace function public.driver_financial_summary(p_driver_id uuid)
returns table(
  completed_trips bigint,
  gross_released_etb numeric,
  commission_charged_etb numeric,
  commission_paid_etb numeric,
  admin_deposit_etb numeric,
  available_deposit_etb numeric,
  commission_due_etb numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() ->> 'role', '');
begin
  if v_uid is null and v_role <> 'service_role' then raise exception 'Authentication required'; end if;
  if p_driver_id is distinct from v_uid and v_role not in ('admin','ceo','service_role') then
    raise exception 'You can only view your own financial summary';
  end if;

  return query
  with vals as (
    select
      (select count(*) from public.orders o where o.driver_id=p_driver_id and o.status='delivered')::bigint as trips,
      coalesce((select sum(p.amount_etb) from public.payments p join public.orders o on o.id=p.order_id where o.driver_id=p_driver_id and p.event='released'),0)::numeric as gross,
      coalesce((select sum(c.commission_etb) from public.driver_commission_charges c where c.driver_id=p_driver_id and c.status='active'),0)::numeric as charged,
      coalesce((select sum(cp.amount_etb) from public.driver_commission_payments cp where cp.driver_id=p_driver_id and cp.status='approved'),0)::numeric as paid,
      coalesce((select sum(d.amount_etb) from public.driver_commission_deposits d where d.driver_id=p_driver_id and d.status='active'),0)::numeric as deposited
  )
  select trips, gross, charged, paid, deposited,
    greatest(0, deposited - charged),
    greatest(0, charged - deposited)
  from vals;
end;
$$;

grant execute on function public.admin_record_driver_deposit(uuid,numeric,text,text) to authenticated;
grant execute on function public.driver_financial_summary(uuid) to authenticated;

notify pgrst, 'reload schema';

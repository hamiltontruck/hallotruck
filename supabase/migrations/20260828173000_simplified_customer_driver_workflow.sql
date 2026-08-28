-- Simplified Customer–Driver workflow. Partner finance and Partner settlement logic are unchanged.
begin;

alter table public.orders add column if not exists selected_payment_method text;
update public.orders set selected_payment_method = case when lower(replace(coalesce(payment_provider,''),' ','_')) in ('telebirr','cbe','awash_bank','bank_of_abyssinia','dashen_bank','coop_bank_oromia','mpesa','other_bank') then 'bank_telebirr' else 'cash' end where selected_payment_method is null;
alter table public.orders alter column selected_payment_method set default 'cash', alter column selected_payment_method set not null;
alter table public.orders drop constraint if exists orders_selected_payment_method_check;
alter table public.orders add constraint orders_selected_payment_method_check check (selected_payment_method in ('cash','bank_telebirr'));

create table if not exists public.driver_trip_payment_results (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  assigned_driver_id uuid not null references public.profiles(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  result_type text not null check (result_type in ('cash_received','bank_telebirr','payment_not_received')),
  amount_collected numeric(14,2) not null default 0 check (amount_collected >= 0),
  payment_method text not null check (payment_method in ('cash','bank_telebirr','none')),
  collected_at timestamptz,
  completed_at timestamptz not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  note text check (note is null or char_length(note) <= 500),
  commission_etb numeric(14,2) not null default 0,
  driver_gross_etb numeric(14,2) not null default 0,
  driver_net_etb numeric(14,2) not null default 0,
  deposit_before_etb numeric(14,2) not null default 0,
  deposit_consumed_etb numeric(14,2) not null default 0,
  deposit_after_etb numeric(14,2) not null default 0,
  commission_due_after_etb numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint driver_trip_payment_result_actor_check check (actor_id = assigned_driver_id)
);
create unique index if not exists driver_trip_payment_results_positive_once_idx on public.driver_trip_payment_results(order_id) where result_type in ('cash_received','bank_telebirr');
create unique index if not exists driver_trip_payment_results_not_received_once_idx on public.driver_trip_payment_results(order_id) where result_type = 'payment_not_received';
alter table public.driver_trip_payment_results enable row level security;
revoke all on public.driver_trip_payment_results from public, anon, authenticated;
grant select on public.driver_trip_payment_results to authenticated;
grant all on public.driver_trip_payment_results to service_role;
drop policy if exists "driver trip payment results read" on public.driver_trip_payment_results;
create policy "driver trip payment results read" on public.driver_trip_payment_results for select to authenticated using (assigned_driver_id = (select auth.uid()) or (select private.is_admin_or_ceo()));

create or replace function private.reject_driver_trip_payment_result_mutation() returns trigger language plpgsql security definer set search_path='' as $$ begin raise exception 'Trip payment result history is immutable'; end; $$;
drop trigger if exists reject_driver_trip_payment_result_mutation on public.driver_trip_payment_results;
create trigger reject_driver_trip_payment_result_mutation before update or delete on public.driver_trip_payment_results for each row execute function private.reject_driver_trip_payment_result_mutation();

create or replace function private.driver_commission_charged_total(p_driver_id uuid) returns numeric language sql stable security invoker set search_path='' as $$
  select coalesce(sum(charge.commission_etb),0)::numeric from public.driver_commission_charges charge join public.payments payment on payment.id=charge.payment_id where charge.driver_id=p_driver_id and charge.status='active' and lower(replace(btrim(coalesce(payment.provider,'')),' ','_')) in ('cash','cash_to_driver','driver_cash');
$$;

create or replace function public.driver_record_trip_payment_result(p_order_id uuid,p_result_type text,p_amount_collected numeric default null,p_note text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_driver uuid; v_status public.order_status; v_total numeric; v_method text; v_delivered_at timestamptz; v_payment uuid; v_commission numeric:=0; v_deposit numeric:=0; v_consumed numeric:=0; v_due numeric:=0; v_id uuid;
begin
  if v_actor is null then raise exception 'Driver sign-in required'; end if;
  select driver_id,status,coalesce(price_etb,0),selected_payment_method,delivered_at into v_driver,v_status,v_total,v_method,v_delivered_at from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_driver is distinct from v_actor then raise exception 'Only the database-assigned driver may report this trip'; end if;
  if not exists(select 1 from public.profiles where id=v_actor and role::text='driver') then raise exception 'Driver role required'; end if;
  if v_status <> 'delivered' or v_delivered_at is null then raise exception 'Finish the trip before reporting payment'; end if;
  if p_result_type not in ('cash_received','bank_telebirr','payment_not_received') then raise exception 'Unsupported payment result'; end if;
  if exists(select 1 from public.driver_trip_payment_results where order_id=p_order_id and result_type in ('cash_received','bank_telebirr')) then raise exception 'Payment result already confirmed for this order'; end if;
  if p_result_type='payment_not_received' then
    if exists(select 1 from public.driver_trip_payment_results where order_id=p_order_id and result_type='payment_not_received') then raise exception 'Payment not received was already recorded'; end if;
    insert into public.driver_trip_payment_results(order_id,assigned_driver_id,result_type,amount_collected,payment_method,completed_at,actor_id,note) values(p_order_id,v_driver,'payment_not_received',0,'none',v_delivered_at,v_actor,nullif(btrim(coalesce(p_note,'')),'')) returning id into v_id;
    update public.orders set payment_status='unpaid' where id=p_order_id;
    return v_id;
  end if;
  if p_result_type='cash_received' then
    if v_method <> 'cash' then raise exception 'Customer selected Bank / Telebirr for this order'; end if;
    if p_amount_collected is null or abs(p_amount_collected-v_total)>0.005 then raise exception 'Exact collected amount must be ETB %',v_total; end if;
    insert into public.payments(order_id,provider,amount_etb,event,raw_payload) values(p_order_id,'cash_to_driver',v_total,'released',jsonb_build_object('source','driver_finish_trip','collection_method','cash','collected_by',v_actor,'collected_at',now())) returning id into v_payment;
    v_commission:=round(v_total*0.02,2);
    select coalesce(sum(amount_etb),0) into v_deposit from public.driver_commission_deposits where driver_id=v_driver and status='active';
    select greatest(0,v_deposit-v_commission),least(v_deposit,v_commission),greatest(0,v_commission-v_deposit) into v_deposit,v_consumed,v_due;
    insert into public.driver_trip_payment_results(order_id,assigned_driver_id,payment_id,result_type,amount_collected,payment_method,collected_at,completed_at,actor_id,note,commission_etb,driver_gross_etb,driver_net_etb,deposit_before_etb,deposit_consumed_etb,deposit_after_etb,commission_due_after_etb) values(p_order_id,v_driver,v_payment,'cash_received',v_total,'cash',now(),v_delivered_at,v_actor,nullif(btrim(coalesce(p_note,'')),''),v_commission,v_total,v_total-v_commission,v_deposit+v_consumed,v_consumed,v_deposit,v_due) returning id into v_id;
    perform public.recompute_order_payment_status(p_order_id); return v_id;
  end if;
  if v_method <> 'bank_telebirr' then raise exception 'Customer selected Cash for this order'; end if;
  select id into v_payment from public.payments where order_id=p_order_id and event in ('initiated','held_escrow','released') and lower(replace(btrim(provider),' ','_')) not in ('cash','cash_to_driver','driver_cash') order by created_at desc limit 1 for update;
  if v_payment is null then raise exception 'No HALLO Bank / Telebirr platform payment exists for this order'; end if;
  update public.payments set event=case when event='initiated' then 'held_escrow'::public.payment_event else event end where id=v_payment;
  v_commission:=round(v_total*0.02,2);
  select coalesce(sum(amount_etb),0) into v_deposit from public.driver_commission_deposits where driver_id=v_driver and status='active';
  insert into public.driver_trip_payment_results(order_id,assigned_driver_id,payment_id,result_type,amount_collected,payment_method,collected_at,completed_at,actor_id,note,commission_etb,driver_gross_etb,driver_net_etb,deposit_before_etb,deposit_consumed_etb,deposit_after_etb,commission_due_after_etb) values(p_order_id,v_driver,v_payment,'bank_telebirr',v_total,'bank_telebirr',now(),v_delivered_at,v_actor,nullif(btrim(coalesce(p_note,'')),''),v_commission,v_total,v_total-v_commission,v_deposit,0,v_deposit,0) returning id into v_id;
  insert into public.driver_payment_confirmation_events(order_id,assigned_driver_id,payment_id,confirmation_type,confirmed_amount_etb,provider,provider_ref,actor_id) select p_order_id,v_driver,p.id,'payment_confirmed',p.amount_etb,p.provider,p.provider_ref,v_actor from public.payments p where p.id=v_payment on conflict(payment_id,confirmation_type) do nothing;
  perform public.recompute_order_payment_status(p_order_id); return v_id;
exception when unique_violation then raise exception 'This trip payment result was already recorded';
end; $$;
revoke all on function public.driver_record_trip_payment_result(uuid,text,numeric,text) from public,anon;
grant execute on function public.driver_record_trip_payment_result(uuid,text,numeric,text) to authenticated;

create or replace function public.customer_submit_rating(p_order_id uuid,p_score smallint,p_comment text default null) returns public.ratings language plpgsql security definer set search_path='' as $$
declare v_customer uuid:=auth.uid(); v_driver uuid; v_rating public.ratings; begin
  if v_customer is null then raise exception 'Sign in required'; end if;
  if p_score<1 or p_score>5 then raise exception 'Rating must be between 1 and 5'; end if;
  select driver_id into v_driver from public.orders where id=p_order_id and customer_id=v_customer and status='delivered' and driver_id is not null;
  if v_driver is null then raise exception 'Only the owning customer may rate a completed order'; end if;
  if exists(select 1 from public.ratings where order_id=p_order_id) then raise exception 'This order was already rated'; end if;
  insert into public.ratings(order_id,customer_id,driver_id,score,comment) values(p_order_id,v_customer,v_driver,p_score,nullif(left(btrim(coalesce(p_comment,'')),500),'')) returning * into v_rating; return v_rating;
end; $$;
revoke all on function public.customer_submit_rating(uuid,smallint,text) from public,anon;
grant execute on function public.customer_submit_rating(uuid,smallint,text) to authenticated;


create or replace function public.driver_finish_trip(
  p_order_id uuid,
  p_recipient_name text,
  p_delivery_note text,
  p_photo_path text,
  p_signature_path text,
  p_result_type text,
  p_amount_collected numeric default null,
  p_payment_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_driver uuid;
  v_status public.order_status;
  v_result_id uuid;
begin
  if v_actor is null then raise exception 'Driver sign-in required'; end if;

  select driver_id, status
  into v_driver, v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_driver is distinct from v_actor then
    raise exception 'Only the database-assigned driver may finish this trip';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_actor and role::text = 'driver'
  ) then raise exception 'Driver role required'; end if;

  if v_status = 'delivered'
    or exists (select 1 from public.delivery_proofs where order_id = p_order_id)
    or exists (select 1 from public.driver_trip_payment_results where order_id = p_order_id)
  then
    raise exception 'This trip was already completed';
  end if;
  if v_status <> 'in_transit' then raise exception 'Trip must be in transit'; end if;

  perform public.submit_delivery_proof(
    p_order_id,
    p_recipient_name,
    p_delivery_note,
    p_photo_path,
    p_signature_path
  );

  select public.driver_record_trip_payment_result(
    p_order_id,
    p_result_type,
    p_amount_collected,
    p_payment_note
  ) into v_result_id;

  return v_result_id;
end;
$function$;

revoke all on function public.driver_finish_trip(uuid,text,text,text,text,text,numeric,text)
  from public, anon;
grant execute on function public.driver_finish_trip(uuid,text,text,text,text,text,numeric,text)
  to authenticated;

notify pgrst,'reload schema';
commit;

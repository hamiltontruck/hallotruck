-- Reconcile prepaid driver deposits with commission payments and require every
-- deposit mutation to pass through the audited Admin/CEO RPCs.

alter table public.driver_commission_deposits
  drop constraint if exists driver_commission_deposits_amount_etb_check;
alter table public.driver_commission_deposits
  add constraint driver_commission_deposits_amount_etb_check
  check (amount_etb between 5000 and 100000);

alter table public.driver_commission_deposits
  drop constraint if exists driver_commission_deposits_reference_length_check;
alter table public.driver_commission_deposits
  add constraint driver_commission_deposits_reference_length_check
  check (reference is null or char_length(reference) <= 120);

alter table public.driver_commission_deposits
  drop constraint if exists driver_commission_deposits_note_length_check;
alter table public.driver_commission_deposits
  add constraint driver_commission_deposits_note_length_check
  check (note is null or char_length(note) <= 1000);

drop policy if exists driver_commission_deposits_admin_write
  on public.driver_commission_deposits;
revoke insert, update, delete on table public.driver_commission_deposits
  from anon, authenticated;
grant select on table public.driver_commission_deposits to authenticated;

-- Remove the obsolete RPC whose amount rule allowed deposits outside the
-- current ETB 5,000-100,000 contract.
drop function if exists public.admin_add_driver_commission_deposit(uuid,numeric,text);

alter table public.notifications
  drop constraint if exists notifications_event_type_check;
alter table public.notifications
  add constraint notifications_event_type_check check (event_type in (
    'order_assigned',
    'payment_verified',
    'payment_rejected',
    'document_expiry',
    'delivery_completed',
    'driver_deposit_added',
    'driver_deposit_reversed'
  ));

create or replace function public.enqueue_user_notification(
  p_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then return null; end if;
  if p_event_type not in (
    'order_assigned',
    'payment_verified',
    'payment_rejected',
    'document_expiry',
    'delivery_completed',
    'driver_deposit_added',
    'driver_deposit_reversed'
  ) then
    raise exception 'Unsupported notification event type: %', p_event_type;
  end if;

  insert into public.notifications(
    user_id,event_type,title,body,data,dedupe_key,expires_at
  ) values (
    p_user_id,
    p_event_type,
    left(coalesce(nullif(btrim(p_title),''),'HalloTruck update'),160),
    left(coalesce(nullif(btrim(p_body),''),'Open HalloTruck for details.'),500),
    coalesce(p_data,'{}'::jsonb),
    nullif(btrim(coalesce(p_dedupe_key,'')),''),
    coalesce(p_expires_at,now()+interval '30 days')
  )
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  if v_id is null and p_dedupe_key is not null then
    select id into v_id from public.notifications
    where user_id=p_user_id and dedupe_key=p_dedupe_key limit 1;
    return v_id;
  end if;

  insert into public.push_notification_outbox(notification_id,user_id)
  values (v_id,p_user_id) on conflict (notification_id) do nothing;
  return v_id;
end;
$$;
revoke all on function public.enqueue_user_notification(uuid,text,text,text,jsonb,text,timestamptz)
  from public, anon, authenticated;

create or replace function public.admin_record_driver_deposit(
  p_driver_id uuid,
  p_amount_etb numeric,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  perform public.enqueue_user_notification(
    p_driver_id,
    'driver_deposit_added',
    'Driver deposit recorded',
    format('A deposit of ETB %s was added to your commission wallet.',
      to_char(round(p_amount_etb,2),'FM999G999G999G990D00')),
    jsonb_build_object(
      'deposit_id',v_id,
      'amount_etb',round(p_amount_etb,2),
      'reference',v_reference,
      'route','/driver/commission'
    ),
    format('driver-deposit:%s:added',v_id),
    now()+interval '90 days'
  );

  return v_id;
end;
$$;

create or replace function public.admin_reverse_driver_commission_deposit(
  p_deposit_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role','');
  v_driver uuid;
  v_amount numeric;
  v_reference text;
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if v_actor is null or v_role not in ('admin','ceo') then
    raise exception 'Admin or CEO role required';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Reversal reason must be at least 5 characters';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Reversal reason must be 500 characters or fewer';
  end if;

  update public.driver_commission_deposits
  set
    status='reversed',
    reversed_by=v_actor,
    reversed_at=now(),
    note=case
      when nullif(btrim(coalesce(note,'')),'') is null then 'Reversal: ' || v_reason
      else note || E'\nReversal: ' || v_reason
    end
  where id=p_deposit_id and status='active'
  returning driver_id,amount_etb,reference into v_driver,v_amount,v_reference;

  if v_driver is null then raise exception 'Active deposit not found'; end if;

  insert into public.driver_commission_audit(driver_id, action, actor_id, details)
  values (
    v_driver,
    'deposit_reversed',
    v_actor,
    jsonb_build_object(
      'deposit_id',p_deposit_id,
      'amount_etb',v_amount,
      'reference',v_reference,
      'reason',v_reason
    )
  );

  perform public.enqueue_user_notification(
    v_driver,
    'driver_deposit_reversed',
    'Driver deposit reversed',
    format('A deposit of ETB %s was reversed. Reason: %s',
      to_char(v_amount,'FM999G999G999G990D00'),v_reason),
    jsonb_build_object(
      'deposit_id',p_deposit_id,
      'amount_etb',v_amount,
      'reference',v_reference,
      'reason',v_reason,
      'route','/driver/commission'
    ),
    format('driver-deposit:%s:reversed',p_deposit_id),
    now()+interval '90 days'
  );
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() ->> 'role', '');
begin
  if v_uid is null and v_role <> 'service_role' then
    raise exception 'Authentication required';
  end if;
  if p_driver_id is distinct from v_uid and v_role not in ('admin','ceo','service_role') then
    raise exception 'You can only view your own financial summary';
  end if;

  return query
  with vals as (
    select
      (select count(*) from public.orders o
        where o.driver_id=p_driver_id and o.status='delivered')::bigint as trips,
      coalesce((select sum(p.amount_etb) from public.payments p
        join public.orders o on o.id=p.order_id
        where o.driver_id=p_driver_id and p.event='released'),0)::numeric as gross,
      coalesce((select sum(c.commission_etb) from public.driver_commission_charges c
        where c.driver_id=p_driver_id and c.status='active'),0)::numeric as charged,
      coalesce((select sum(cp.amount_etb) from public.driver_commission_payments cp
        where cp.driver_id=p_driver_id and cp.status='approved'),0)::numeric as paid,
      coalesce((select sum(d.amount_etb) from public.driver_commission_deposits d
        where d.driver_id=p_driver_id and d.status='active'),0)::numeric as deposited
  ), reconciled as (
    select *, greatest(0,charged-paid) as unpaid_charge from vals
  )
  select
    trips,
    gross,
    charged,
    paid,
    deposited,
    greatest(0,deposited-unpaid_charge),
    greatest(0,unpaid_charge-deposited)
  from reconciled;
end;
$$;

revoke all on function public.admin_record_driver_deposit(uuid,numeric,text,text)
  from public, anon;
grant execute on function public.admin_record_driver_deposit(uuid,numeric,text,text)
  to authenticated;

revoke all on function public.admin_reverse_driver_commission_deposit(uuid,text)
  from public, anon;
grant execute on function public.admin_reverse_driver_commission_deposit(uuid,text)
  to authenticated;

revoke all on function public.driver_financial_summary(uuid)
  from public, anon;
grant execute on function public.driver_financial_summary(uuid)
  to authenticated;

notify pgrst, 'reload schema';

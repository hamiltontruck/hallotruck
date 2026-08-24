create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

alter table public.mobile_devices
  add column if not exists notifications_enabled boolean not null default true,
  add column if not exists locale text not null default 'en';

alter table public.mobile_devices drop constraint if exists mobile_devices_locale_check;
alter table public.mobile_devices add constraint mobile_devices_locale_check
  check (locale in ('en','om','am','so','ti'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'order_assigned','payment_verified','payment_rejected','document_expiry','delivery_completed'
  )),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_user_dedupe_key_uidx
  on public.notifications(user_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "notifications: user reads own" on public.notifications;
create policy "notifications: user reads own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications: admin reads all" on public.notifications;
create policy "notifications: admin reads all" on public.notifications
  for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','ceo'));

create table if not exists public.push_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','partial','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_outbox_ready_idx
  on public.push_notification_outbox(next_attempt_at, created_at)
  where status in ('pending','failed');
create index if not exists push_outbox_user_idx
  on public.push_notification_outbox(user_id, created_at desc);
alter table public.push_notification_outbox enable row level security;
drop policy if exists "push outbox: admin reads" on public.push_notification_outbox;
create policy "push outbox: admin reads" on public.push_notification_outbox
  for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','ceo'));

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.push_notification_outbox(id) on delete cascade,
  device_id uuid not null references public.mobile_devices(id) on delete cascade,
  status text not null check (status in ('sent','failed','invalid_token','skipped')),
  fcm_message_name text,
  error_message text,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(outbox_id, device_id)
);

create index if not exists push_delivery_outbox_idx
  on public.push_notification_deliveries(outbox_id);
alter table public.push_notification_deliveries enable row level security;
drop policy if exists "push deliveries: admin reads" on public.push_notification_deliveries;
create policy "push deliveries: admin reads" on public.push_notification_deliveries
  for select to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','ceo'));

create table if not exists app_private.push_dispatch_config (
  singleton boolean primary key default true check (singleton),
  dispatch_url text not null,
  dispatch_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on app_private.push_dispatch_config from public, anon, authenticated;

insert into app_private.push_dispatch_config(singleton, dispatch_url, dispatch_secret)
values (
  true,
  'https://febgayjolfrooaqenlje.supabase.co/functions/v1/push-notifications',
  encode(gen_random_bytes(32), 'hex')
)
on conflict (singleton) do nothing;

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
  if p_event_type not in ('order_assigned','payment_verified','payment_rejected','document_expiry','delivery_completed') then
    raise exception 'Unsupported notification event type: %', p_event_type;
  end if;

  insert into public.notifications(user_id,event_type,title,body,data,dedupe_key,expires_at)
  values (
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

create or replace function public.validate_push_dispatch_secret(p_secret text)
returns boolean
language sql stable security definer set search_path=''
as $$
  select coalesce(auth.jwt()->>'role','')='service_role'
    and exists(select 1 from app_private.push_dispatch_config where singleton and dispatch_secret=p_secret);
$$;
revoke all on function public.validate_push_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.validate_push_dispatch_secret(text) to service_role;

create or replace function public.invoke_push_dispatch()
returns bigint
language plpgsql security definer set search_path=''
as $$
declare
  v_url text;
  v_secret text;
  v_request bigint;
begin
  select dispatch_url,dispatch_secret into v_url,v_secret
  from app_private.push_dispatch_config where singleton;
  if v_url is null or v_secret is null then return null; end if;
  select net.http_post(
    url:=v_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-hallo-dispatch-secret',v_secret),
    body:=jsonb_build_object('requested_at',now()),
    timeout_milliseconds:=10000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function public.invoke_push_dispatch() from public, anon, authenticated;

create or replace function public.claim_push_notifications(p_limit integer default 50)
returns table(
  outbox_id uuid,
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  data jsonb,
  expires_at timestamptz,
  attempt integer
)
language plpgsql security definer set search_path=''
as $$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;

  update public.push_notification_outbox o
  set status='skipped',processed_at=now(),updated_at=now(),last_error='Notification expired before delivery'
  from public.notifications n
  where n.id=o.notification_id and n.expires_at<=now() and o.status in ('pending','failed');

  return query
  with picked as (
    select o.id
    from public.push_notification_outbox o
    join public.notifications n on n.id=o.notification_id
    where o.status in ('pending','failed')
      and o.next_attempt_at<=now()
      and o.attempts<8
      and n.expires_at>now()
    order by o.created_at
    for update of o skip locked
    limit greatest(1,least(coalesce(p_limit,50),200))
  ), claimed as (
    update public.push_notification_outbox o
    set status='processing',attempts=o.attempts+1,locked_at=now(),updated_at=now(),last_error=null
    from picked p where o.id=p.id
    returning o.id,o.notification_id,o.user_id,o.attempts
  )
  select c.id,c.notification_id,c.user_id,n.title,n.body,n.data,n.expires_at,c.attempts
  from claimed c join public.notifications n on n.id=c.notification_id
  order by n.created_at;
end;
$$;
revoke all on function public.claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

create or replace function public.complete_push_notification(
  p_outbox_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql security definer set search_path=''
as $$
declare
  v_attempts integer;
  v_delay integer;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_status not in ('sent','partial','failed','skipped') then raise exception 'Invalid push completion status'; end if;
  select attempts into v_attempts from public.push_notification_outbox where id=p_outbox_id for update;
  if not found then raise exception 'Push outbox item not found'; end if;
  v_delay:=least(60,greatest(1,power(2,least(v_attempts,6))::integer));
  update public.push_notification_outbox
  set status=p_status,
      processed_at=case when p_status in ('sent','partial','skipped') then now() else null end,
      next_attempt_at=case when p_status='failed' then now()+make_interval(mins=>v_delay) else next_attempt_at end,
      locked_at=null,
      last_error=nullif(left(coalesce(p_error,''),1000),''),
      updated_at=now()
  where id=p_outbox_id;
end;
$$;
revoke all on function public.complete_push_notification(uuid,text,text) from public, anon, authenticated;
grant execute on function public.complete_push_notification(uuid,text,text) to service_role;

create or replace function public.release_stale_push_claims()
returns integer
language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  update public.push_notification_outbox
  set status='failed',locked_at=null,next_attempt_at=now(),last_error='Processing lease expired',updated_at=now()
  where status='processing' and locked_at<now()-interval '10 minutes';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.release_stale_push_claims() from public, anon, authenticated;

create or replace function public.my_notifications(p_limit integer default 100)
returns table(id uuid,event_type text,title text,body text,data jsonb,read_at timestamptz,created_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select id,event_type,title,body,data,read_at,created_at
  from public.notifications
  where user_id=auth.uid() and expires_at>now()
  order by created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;
grant execute on function public.my_notifications(integer) to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.notifications set read_at=coalesce(read_at,now())
  where id=p_notification_id and user_id=auth.uid();
  return found;
end;
$$;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.update_android_notification_preferences(
  p_android_device_id text,
  p_locale text,
  p_notifications_enabled boolean
)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_locale text:=lower(btrim(coalesce(p_locale,'en')));
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_locale not in ('en','om','am','so','ti') then raise exception 'Unsupported locale'; end if;
  update public.mobile_devices
  set locale=v_locale,notifications_enabled=coalesce(p_notifications_enabled,true),last_active_at=now(),updated_at=now()
  where user_id=auth.uid() and android_device_id=btrim(coalesce(p_android_device_id,''));
  return found;
end;
$$;
grant execute on function public.update_android_notification_preferences(text,text,boolean) to authenticated;

drop function if exists public.my_android_devices();
create function public.my_android_devices()
returns table(
  id uuid,android_device_id text,app_version text,locale text,notifications_enabled boolean,
  last_active_at timestamptz,is_active boolean,created_at timestamptz
)
language sql stable security definer set search_path=''
as $$
  select id,android_device_id,app_version,locale,notifications_enabled,last_active_at,is_active,created_at
  from public.mobile_devices where user_id=auth.uid() order by last_active_at desc;
$$;
grant execute on function public.my_android_devices() to authenticated;

create or replace function public.request_push_dispatch()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.invoke_push_dispatch();
  return new;
exception when others then return new;
end;
$$;
revoke all on function public.request_push_dispatch() from public, anon, authenticated;
drop trigger if exists push_outbox_request_dispatch on public.push_notification_outbox;
create trigger push_outbox_request_dispatch after insert on public.push_notification_outbox
for each statement execute function public.request_push_dispatch();

create or replace function public.enqueue_order_notifications()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.driver_id is not null and old.driver_id is distinct from new.driver_id then
    perform public.enqueue_user_notification(
      new.driver_id,'order_assigned','New delivery assigned',
      format('Order %s: %s to %s',new.tracking_id,new.pickup_address,new.dropoff_address),
      jsonb_build_object('order_id',new.id,'tracking_id',new.tracking_id,'route','/driver/jobs'),
      format('order:%s:assigned:%s',new.id,new.driver_id),now()+interval '14 days'
    );
  end if;

  if new.status='delivered'::public.order_status and old.status is distinct from new.status then
    if new.customer_id is not null then
      perform public.enqueue_user_notification(
        new.customer_id,'delivery_completed','Delivery completed',
        format('Order %s has been delivered successfully.',new.tracking_id),
        jsonb_build_object('order_id',new.id,'tracking_id',new.tracking_id,'route',format('/customer/tracking/%s',new.id)),
        format('order:%s:delivered:customer',new.id),now()+interval '30 days'
      );
    end if;
    if new.driver_id is not null then
      perform public.enqueue_user_notification(
        new.driver_id,'delivery_completed','Delivery recorded',
        format('Delivery proof for order %s was accepted.',new.tracking_id),
        jsonb_build_object('order_id',new.id,'tracking_id',new.tracking_id,'route','/driver/earnings'),
        format('order:%s:delivered:driver',new.id),now()+interval '30 days'
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_order_notifications() from public, anon, authenticated;
drop trigger if exists orders_enqueue_mobile_notifications on public.orders;
create trigger orders_enqueue_mobile_notifications after update of driver_id,status on public.orders
for each row execute function public.enqueue_order_notifications();

create or replace function public.enqueue_payment_notifications()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_source text:=coalesce(new.raw_payload->>'source','');
  v_reason text:=coalesce(new.rejection_reason,'Payment evidence was rejected.');
begin
  if old.event is not distinct from new.event or new.event not in ('held_escrow'::public.payment_event,'failed'::public.payment_event) then
    return new;
  end if;
  select * into v_order from public.orders where id=new.order_id;
  if not found then return new; end if;

  if new.event='failed'::public.payment_event then
    if v_source='driver_collection' and v_order.driver_id is not null then
      perform public.enqueue_user_notification(
        v_order.driver_id,'payment_rejected','Payment evidence rejected',
        format('Order %s: %s',v_order.tracking_id,v_reason),
        jsonb_build_object('payment_id',new.id,'order_id',v_order.id,'tracking_id',v_order.tracking_id,'reason',v_reason,'route',format('/driver/payment/%s',v_order.id)),
        format('payment:%s:rejected:driver',new.id),now()+interval '30 days'
      );
    elsif v_order.customer_id is not null then
      perform public.enqueue_user_notification(
        v_order.customer_id,'payment_rejected','Payment evidence rejected',
        format('Order %s: %s',v_order.tracking_id,v_reason),
        jsonb_build_object('payment_id',new.id,'order_id',v_order.id,'tracking_id',v_order.tracking_id,'reason',v_reason,'route','/customer/orders'),
        format('payment:%s:rejected:customer',new.id),now()+interval '30 days'
      );
    end if;
  else
    if v_order.customer_id is not null then
      perform public.enqueue_user_notification(
        v_order.customer_id,'payment_verified','Payment verified',
        format('Payment for order %s was verified.',v_order.tracking_id),
        jsonb_build_object('payment_id',new.id,'order_id',v_order.id,'tracking_id',v_order.tracking_id,'route','/customer/orders'),
        format('payment:%s:verified:customer',new.id),now()+interval '30 days'
      );
    end if;
    if v_order.driver_id is not null then
      perform public.enqueue_user_notification(
        v_order.driver_id,'payment_verified','Payment verified',
        format('Payment for order %s was verified.',v_order.tracking_id),
        jsonb_build_object('payment_id',new.id,'order_id',v_order.id,'tracking_id',v_order.tracking_id,'route','/driver/earnings'),
        format('payment:%s:verified:driver',new.id),now()+interval '30 days'
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_payment_notifications() from public, anon, authenticated;
drop trigger if exists payments_enqueue_mobile_notifications on public.payments;
create trigger payments_enqueue_mobile_notifications after update of event on public.payments
for each row execute function public.enqueue_payment_notifications();

create or replace function public.enqueue_document_expiry_notifications()
returns integer
language plpgsql security definer set search_path=''
as $$
declare
  v_row record;
  v_days integer;
  v_milestone text;
  v_title text;
  v_body text;
  v_count integer:=0;
begin
  for v_row in
    with document_dates as (
      select driver_id,null::uuid as truck_id,'driving_license'::text as document_type,min(expiry_date) as expiry_date
      from public.driver_verification_files
      where document_key in ('license_front','license_back') and status='verified' and expiry_date is not null
      group by driver_id
      union all
      select driver_id,truck_id,document_key,expiry_date
      from public.driver_verification_files
      where document_key in ('insurance','transport_permit') and status='verified' and expiry_date is not null
    )
    select * from document_dates where expiry_date<=current_date+30
  loop
    v_days:=v_row.expiry_date-current_date;
    v_milestone:=case v_days
      when 30 then '30d' when 14 then '14d' when 7 then '7d' when 3 then '3d'
      when 1 then '1d' when 0 then 'today' else case when v_days<0 then 'expired' end
    end;
    if v_milestone is null then continue; end if;

    if v_days<0 then
      v_title:='Required document expired';
      v_body:=format('%s expired on %s. Upload a verified replacement before accepting new jobs.',replace(v_row.document_type,'_',' '),v_row.expiry_date);
    elsif v_days=0 then
      v_title:='Required document expires today';
      v_body:=format('%s expires today. Upload a renewed document.',replace(v_row.document_type,'_',' '));
    else
      v_title:='Document renewal reminder';
      v_body:=format('%s expires in %s day%s on %s.',replace(v_row.document_type,'_',' '),v_days,case when v_days=1 then '' else 's' end,v_row.expiry_date);
    end if;

    perform public.enqueue_user_notification(
      v_row.driver_id,'document_expiry',v_title,v_body,
      jsonb_build_object('document_type',v_row.document_type,'truck_id',v_row.truck_id,'expiry_date',v_row.expiry_date,'days_remaining',v_days,'route','/driver/documents'),
      format('document:%s:%s:%s:%s',v_row.driver_id,v_row.document_type,coalesce(v_row.truck_id::text,'identity'),v_milestone),
      now()+interval '60 days'
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.enqueue_document_expiry_notifications() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

select cron.schedule('hallotruck-push-dispatch','*/2 * * * *',$$select public.invoke_push_dispatch();$$);
select cron.schedule('hallotruck-push-stale-claims','*/5 * * * *',$$select public.release_stale_push_claims();$$);
select cron.schedule(
  'hallotruck-document-expiry','15 3 * * *',
  $$select public.enqueue_document_expiry_notifications(); select public.invoke_push_dispatch();$$
);
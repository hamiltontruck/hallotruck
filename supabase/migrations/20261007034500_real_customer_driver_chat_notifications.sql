-- Real Customer <-> Driver chat notifications.
-- Keeps message storage append-only and routes notifications only to the peer participant.

alter table public.notifications drop constraint if exists notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type in (
    'order_assigned','payment_verified','payment_rejected','document_expiry','delivery_completed','chat_message'
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
  if p_event_type not in ('order_assigned','payment_verified','payment_rejected','document_expiry','delivery_completed','chat_message') then
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

create or replace function public.enqueue_customer_driver_chat_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.customer_driver_chat_threads%rowtype;
  v_recipient uuid;
  v_sender_name text;
  v_tracking_id text;
begin
  select * into v_thread
  from public.customer_driver_chat_threads
  where id=new.thread_id;

  if not found then return new; end if;

  if new.sender_id=v_thread.customer_id then
    v_recipient:=v_thread.driver_id;
  elsif new.sender_id=v_thread.driver_id then
    v_recipient:=v_thread.customer_id;
  else
    return new;
  end if;

  select coalesce(nullif(btrim(p.full_name),''),'HALLO user')
  into v_sender_name
  from public.profiles p
  where p.id=new.sender_id;

  select o.tracking_id into v_tracking_id
  from public.orders o
  where o.id=v_thread.order_id;

  perform public.enqueue_user_notification(
    v_recipient,
    'chat_message',
    case when new.sender_id=v_thread.customer_id then 'New customer message' else 'New driver message' end,
    format('%s: %s',coalesce(v_sender_name,'HALLO user'),left(regexp_replace(new.body,'[[:space:]]+',' ','g'),220)),
    jsonb_build_object(
      'message_id',new.id,
      'thread_id',new.thread_id,
      'order_id',v_thread.order_id,
      'tracking_id',v_tracking_id,
      'sender_id',new.sender_id,
      'route',case when v_recipient=v_thread.driver_id then '/driver/trip' else '/customer/orders' end
    ),
    format('chat:%s:%s',new.thread_id,new.id),
    now()+interval '14 days'
  );

  return new;
end;
$$;
revoke all on function public.enqueue_customer_driver_chat_notification() from public,anon,authenticated;

drop trigger if exists customer_driver_chat_enqueue_peer_notification on public.customer_driver_chat_messages;
create trigger customer_driver_chat_enqueue_peer_notification
after insert on public.customer_driver_chat_messages
for each row execute function public.enqueue_customer_driver_chat_notification();

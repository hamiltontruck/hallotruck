-- Order-scoped Customer <-> assigned Driver chat. Existing Admin <-> Driver chat remains unchanged.
create table if not exists public.customer_driver_chat_threads (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  customer_last_read_at timestamptz,
  driver_last_read_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.customer_driver_chat_messages (
  id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.customer_driver_chat_threads(id) on delete restrict,
  sender_id uuid not null references public.profiles(id) on delete restrict, body text not null check (char_length(btrim(body)) between 1 and 4000),
  client_message_id uuid not null, created_at timestamptz not null default now(), unique(sender_id,client_message_id)
);
create index if not exists customer_driver_chat_messages_thread_created_idx on public.customer_driver_chat_messages(thread_id,created_at,id);
alter table public.customer_driver_chat_threads enable row level security;
alter table public.customer_driver_chat_messages enable row level security;
revoke all on public.customer_driver_chat_threads,public.customer_driver_chat_messages from anon;
grant select on public.customer_driver_chat_threads,public.customer_driver_chat_messages to authenticated;
revoke insert,update,delete on public.customer_driver_chat_threads,public.customer_driver_chat_messages from authenticated;
create policy customer_driver_chat_threads_participant_read on public.customer_driver_chat_threads for select to authenticated using(customer_id=(select auth.uid()) or (driver_id=(select auth.uid()) and (select public.is_approved_driver())));
create policy customer_driver_chat_messages_participant_read on public.customer_driver_chat_messages for select to authenticated using(exists(select 1 from public.customer_driver_chat_threads t where t.id=customer_driver_chat_messages.thread_id and (t.customer_id=(select auth.uid()) or (t.driver_id=(select auth.uid()) and (select public.is_approved_driver())))));
create or replace function public.open_customer_driver_order_chat(p_order_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_customer uuid; v_driver uuid; v_thread uuid;
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 select o.customer_id,o.driver_id into v_customer,v_driver from public.orders o where o.id=p_order_id;
 if not found or v_driver is null then raise exception 'Assigned order is required'; end if;
 if v_actor<>v_customer and not(v_actor=v_driver and (select public.is_approved_driver())) then raise exception 'Order chat participant authorization is required'; end if;
 insert into public.customer_driver_chat_threads(order_id,customer_id,driver_id) values(p_order_id,v_customer,v_driver)
 on conflict(order_id) do update set driver_id=excluded.driver_id,updated_at=now() where public.customer_driver_chat_threads.customer_id=excluded.customer_id;
 select id into v_thread from public.customer_driver_chat_threads where order_id=p_order_id; return v_thread;
end $$;
create or replace function public.send_customer_driver_chat_message(p_thread_id uuid,p_body text,p_client_message_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_customer uuid; v_driver uuid; v_body text:=btrim(coalesce(p_body,'')); v_id uuid;
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 if char_length(v_body)<1 or char_length(v_body)>4000 then raise exception 'Message must be between 1 and 4000 characters'; end if;
 select customer_id,driver_id into v_customer,v_driver from public.customer_driver_chat_threads where id=p_thread_id for update;
 if not found or (v_actor<>v_customer and not(v_actor=v_driver and (select public.is_approved_driver()))) then raise exception 'Order chat participant authorization is required'; end if;
 insert into public.customer_driver_chat_messages(thread_id,sender_id,body,client_message_id) values(p_thread_id,v_actor,v_body,p_client_message_id) on conflict(sender_id,client_message_id) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.customer_driver_chat_messages where sender_id=v_actor and client_message_id=p_client_message_id; return v_id; end if;
 update public.customer_driver_chat_threads set last_message_at=now(),last_message_preview=left(regexp_replace(v_body,'[[:space:]]+',' ','g'),180),last_sender_id=v_actor,customer_last_read_at=case when v_actor=v_customer then now() else customer_last_read_at end,driver_last_read_at=case when v_actor=v_driver then now() else driver_last_read_at end,updated_at=now() where id=p_thread_id;
 return v_id;
end $$;
create or replace function public.mark_customer_driver_chat_read(p_thread_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_customer uuid; v_driver uuid;
begin
 select customer_id,driver_id into v_customer,v_driver from public.customer_driver_chat_threads where id=p_thread_id for update;
 if not found or (v_actor<>v_customer and not(v_actor=v_driver and (select public.is_approved_driver()))) then raise exception 'Order chat participant authorization is required'; end if;
 update public.customer_driver_chat_threads set customer_last_read_at=case when v_actor=v_customer then now() else customer_last_read_at end,driver_last_read_at=case when v_actor=v_driver then now() else driver_last_read_at end where id=p_thread_id;
end $$;
revoke all on function public.open_customer_driver_order_chat(uuid) from public,anon,authenticated;
revoke all on function public.send_customer_driver_chat_message(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.mark_customer_driver_chat_read(uuid) from public,anon,authenticated;
grant execute on function public.open_customer_driver_order_chat(uuid) to authenticated;
grant execute on function public.send_customer_driver_chat_message(uuid,text,uuid) to authenticated;
grant execute on function public.mark_customer_driver_chat_read(uuid) to authenticated;
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customer_driver_chat_threads') then alter publication supabase_realtime add table public.customer_driver_chat_threads; end if; if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customer_driver_chat_messages') then alter publication supabase_realtime add table public.customer_driver_chat_messages; end if; end if; end $$;

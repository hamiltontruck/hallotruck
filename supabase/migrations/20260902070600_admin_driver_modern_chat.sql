create table if not exists public.driver_chat_threads (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid references public.profiles(id) on delete restrict,
  admin_last_read_at timestamptz,
  driver_last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_chat_threads_preview_check
    check (last_message_preview is null or char_length(last_message_preview) <= 180)
);

create table if not exists public.driver_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.driver_chat_threads(id) on delete restrict,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  message_kind text not null default 'text',
  order_id uuid references public.orders(id) on delete restrict,
  client_message_id uuid not null,
  created_at timestamptz not null default now(),
  constraint driver_chat_messages_body_check
    check (char_length(btrim(body)) between 1 and 4000),
  constraint driver_chat_messages_kind_check
    check (message_kind in ('text', 'quick_reply', 'order_context')),
  constraint driver_chat_messages_sender_client_key
    unique (sender_id, client_message_id)
);

create index if not exists driver_chat_threads_last_message_idx
  on public.driver_chat_threads(last_message_at desc nulls last);
create index if not exists driver_chat_messages_thread_created_idx
  on public.driver_chat_messages(thread_id, created_at, id);
create index if not exists driver_chat_messages_order_idx
  on public.driver_chat_messages(order_id)
  where order_id is not null;

alter table public.driver_chat_threads enable row level security;
alter table public.driver_chat_messages enable row level security;

revoke all on table public.driver_chat_threads from anon;
revoke all on table public.driver_chat_messages from anon;
grant select on table public.driver_chat_threads to authenticated;
grant select on table public.driver_chat_messages to authenticated;
revoke insert, update, delete on table public.driver_chat_threads from authenticated;
revoke insert, update, delete on table public.driver_chat_messages from authenticated;

create policy driver_chat_threads_participant_read
  on public.driver_chat_threads
  for select
  to authenticated
  using (
    (select private.is_admin_or_ceo())
    or (
      driver_id = (select auth.uid())
      and (select public.is_approved_driver())
    )
  );

create policy driver_chat_messages_participant_read
  on public.driver_chat_messages
  for select
  to authenticated
  using (
    (select private.is_admin_or_ceo())
    or (
      (select public.is_approved_driver())
      and exists (
        select 1
        from public.driver_chat_threads thread
        where thread.id = driver_chat_messages.thread_id
          and thread.driver_id = (select auth.uid())
      )
    )
  );

create or replace function private.reject_driver_chat_message_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Driver chat messages are append-only';
end;
$$;

revoke all on function private.reject_driver_chat_message_mutation()
  from public, anon, authenticated;

drop trigger if exists driver_chat_messages_immutable on public.driver_chat_messages;
create trigger driver_chat_messages_immutable
before update or delete on public.driver_chat_messages
for each row execute function private.reject_driver_chat_message_mutation();

create or replace function public.admin_get_or_create_driver_chat_thread(
  p_driver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_thread_id uuid;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Active Admin or CEO authorization is required';
  end if;

  if p_driver_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = p_driver_id
      and profile.role = 'driver'::public.user_role
      and profile.driver_status = 'approved'::public.driver_status
  ) then
    raise exception 'Approved Driver is required';
  end if;

  insert into public.driver_chat_threads(driver_id, created_by)
  values (p_driver_id, v_actor)
  on conflict (driver_id) do nothing;

  select thread.id
  into v_thread_id
  from public.driver_chat_threads thread
  where thread.driver_id = p_driver_id;

  return v_thread_id;
end;
$$;

create or replace function public.driver_get_or_create_chat_thread()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_thread_id uuid;
begin
  if v_actor is null or not (select public.is_approved_driver()) then
    raise exception 'Approved Driver authorization is required';
  end if;

  insert into public.driver_chat_threads(driver_id, created_by)
  values (v_actor, v_actor)
  on conflict (driver_id) do nothing;

  select thread.id
  into v_thread_id
  from public.driver_chat_threads thread
  where thread.driver_id = v_actor;

  return v_thread_id;
end;
$$;

create or replace function public.send_driver_chat_message(
  p_thread_id uuid,
  p_body text,
  p_order_id uuid,
  p_client_message_id uuid,
  p_message_kind text default 'text'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_driver_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_kind text := lower(btrim(coalesce(p_message_kind, 'text')));
  v_is_admin boolean := false;
  v_is_driver boolean := false;
  v_message_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;
  if p_thread_id is null or p_client_message_id is null then
    raise exception 'Thread and client message id are required';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'Message must be between 1 and 4000 characters';
  end if;
  if v_kind not in ('text', 'quick_reply', 'order_context') then
    raise exception 'Unsupported chat message kind';
  end if;

  select thread.driver_id
  into v_driver_id
  from public.driver_chat_threads thread
  where thread.id = p_thread_id
  for update;

  if not found then
    raise exception 'Driver chat thread not found';
  end if;

  v_is_admin := (select private.is_admin_or_ceo());
  v_is_driver := v_actor = v_driver_id and (select public.is_approved_driver());
  if not v_is_admin and not v_is_driver then
    raise exception 'Driver chat participant authorization is required';
  end if;

  if p_order_id is not null and not exists (
    select 1
    from public.orders driver_order
    where driver_order.id = p_order_id
      and driver_order.driver_id = v_driver_id
  ) then
    raise exception 'Order context must belong to the conversation Driver';
  end if;

  insert into public.driver_chat_messages(
    thread_id,
    sender_id,
    body,
    message_kind,
    order_id,
    client_message_id
  ) values (
    p_thread_id,
    v_actor,
    v_body,
    v_kind,
    p_order_id,
    p_client_message_id
  )
  on conflict (sender_id, client_message_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select message.id
    into v_message_id
    from public.driver_chat_messages message
    where message.sender_id = v_actor
      and message.client_message_id = p_client_message_id;
    return v_message_id;
  end if;

  update public.driver_chat_threads
  set last_message_at = now(),
      last_message_preview = left(regexp_replace(v_body, '[[:space:]]+', ' ', 'g'), 180),
      last_sender_id = v_actor,
      admin_last_read_at = case when v_is_admin then now() else admin_last_read_at end,
      driver_last_read_at = case when v_is_driver then now() else driver_last_read_at end,
      updated_at = now()
  where id = p_thread_id;

  return v_message_id;
end;
$$;

create or replace function public.mark_driver_chat_read(
  p_thread_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_driver_id uuid;
  v_is_admin boolean := false;
  v_is_driver boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select thread.driver_id
  into v_driver_id
  from public.driver_chat_threads thread
  where thread.id = p_thread_id
  for update;

  if not found then
    raise exception 'Driver chat thread not found';
  end if;

  v_is_admin := (select private.is_admin_or_ceo());
  v_is_driver := v_actor = v_driver_id and (select public.is_approved_driver());
  if not v_is_admin and not v_is_driver then
    raise exception 'Driver chat participant authorization is required';
  end if;

  update public.driver_chat_threads
  set admin_last_read_at = case when v_is_admin then now() else admin_last_read_at end,
      driver_last_read_at = case when v_is_driver then now() else driver_last_read_at end
  where id = p_thread_id;
end;
$$;

create or replace function public.admin_driver_chat_inbox()
returns table(
  thread_id uuid,
  driver_id uuid,
  driver_name text,
  driver_phone text,
  driver_status text,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Active Admin or CEO authorization is required';
  end if;

  return query
  select
    thread.id,
    profile.id,
    profile.full_name,
    profile.phone,
    profile.driver_status::text,
    thread.last_message_at,
    thread.last_message_preview,
    thread.last_sender_id,
    coalesce((
      select count(*)
      from public.driver_chat_messages message
      where message.thread_id = thread.id
        and message.sender_id = profile.id
        and message.created_at > coalesce(thread.admin_last_read_at, '-infinity'::timestamptz)
    ), 0)::bigint
  from public.profiles profile
  left join public.driver_chat_threads thread on thread.driver_id = profile.id
  where profile.role = 'driver'::public.user_role
    and profile.driver_status = 'approved'::public.driver_status
  order by thread.last_message_at desc nulls last, profile.full_name;
end;
$$;

create or replace function public.my_driver_chat_unread_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_count bigint;
begin
  if v_actor is null or not (select public.is_approved_driver()) then
    return 0;
  end if;

  select count(*)
  into v_count
  from public.driver_chat_threads thread
  join public.driver_chat_messages message on message.thread_id = thread.id
  where thread.driver_id = v_actor
    and message.sender_id <> v_actor
    and message.created_at > coalesce(thread.driver_last_read_at, '-infinity'::timestamptz);

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.admin_get_or_create_driver_chat_thread(uuid)
  from public, anon, authenticated;
revoke all on function public.driver_get_or_create_chat_thread()
  from public, anon, authenticated;
revoke all on function public.send_driver_chat_message(uuid,text,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.mark_driver_chat_read(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_driver_chat_inbox()
  from public, anon, authenticated;
revoke all on function public.my_driver_chat_unread_count()
  from public, anon, authenticated;

grant execute on function public.admin_get_or_create_driver_chat_thread(uuid)
  to authenticated;
grant execute on function public.driver_get_or_create_chat_thread()
  to authenticated;
grant execute on function public.send_driver_chat_message(uuid,text,uuid,uuid,text)
  to authenticated;
grant execute on function public.mark_driver_chat_read(uuid)
  to authenticated;
grant execute on function public.admin_driver_chat_inbox()
  to authenticated;
grant execute on function public.my_driver_chat_unread_count()
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'driver_chat_threads'
    ) then
      alter publication supabase_realtime add table public.driver_chat_threads;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'driver_chat_messages'
    ) then
      alter publication supabase_realtime add table public.driver_chat_messages;
    end if;
  end if;
end;
$$;
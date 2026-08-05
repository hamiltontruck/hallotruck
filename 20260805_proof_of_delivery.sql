create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  recipient_name text not null check (length(btrim(recipient_name)) between 2 and 120),
  delivery_note text,
  photo_path text not null,
  signature_path text not null,
  delivered_by uuid not null references auth.users(id),
  delivered_at timestamptz not null default now()
);

alter table public.delivery_proofs enable row level security;
grant select on public.delivery_proofs to authenticated;

drop policy if exists "delivery proofs participants read" on public.delivery_proofs;
create policy "delivery proofs participants read" on public.delivery_proofs
for select to authenticated using (
  coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo')
  or exists (select 1 from public.orders o where o.id=order_id and ((select auth.uid())=o.driver_id or (select auth.uid())=o.customer_id))
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('delivery-proofs','delivery-proofs',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "delivery proof upload" on storage.objects;
create policy "delivery proof upload" on storage.objects for insert to authenticated with check (
  bucket_id='delivery-proofs' and exists (
    select 1 from public.orders o where o.id::text=(storage.foldername(name))[1] and o.status='in_transit'
      and (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo') or o.driver_id=(select auth.uid()))
  )
);

drop policy if exists "delivery proof read" on storage.objects;
create policy "delivery proof read" on storage.objects for select to authenticated using (
  bucket_id='delivery-proofs' and exists (
    select 1 from public.delivery_proofs dp join public.orders o on o.id=dp.order_id
    where name in (dp.photo_path,dp.signature_path)
      and (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo') or o.driver_id=(select auth.uid()) or o.customer_id=(select auth.uid()))
  )
);

drop policy if exists "delivery proof cleanup" on storage.objects;
create policy "delivery proof cleanup" on storage.objects for delete to authenticated using (
  bucket_id='delivery-proofs' and exists (
    select 1 from public.orders o where o.id::text=(storage.foldername(name))[1]
      and (coalesce((select auth.jwt()->'app_metadata'->>'role'),'') in ('admin','ceo') or o.driver_id=(select auth.uid()))
  )
);

create or replace function public.submit_delivery_proof(p_order_id uuid,p_recipient_name text,p_delivery_note text,p_photo_path text,p_signature_path text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid=(select auth.uid()); v_role text=coalesce((select auth.jwt()->'app_metadata'->>'role'),''); v_driver uuid; v_truck uuid; v_status public.order_status;
begin
  if v_actor is null then raise exception 'Sign in required'; end if;
  select driver_id,truck_id,status into v_driver,v_truck,v_status from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_role not in ('admin','ceo') and v_driver is distinct from v_actor then raise exception 'Not authorized for this order'; end if;
  if v_status<>'in_transit' then raise exception 'Order must be in transit'; end if;
  if p_photo_path not like p_order_id::text||'/%' or p_signature_path not like p_order_id::text||'/%' then raise exception 'Invalid proof path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='delivery-proofs' and name=p_photo_path) or not exists(select 1 from storage.objects where bucket_id='delivery-proofs' and name=p_signature_path) then raise exception 'Proof files are missing'; end if;
  insert into public.delivery_proofs(order_id,recipient_name,delivery_note,photo_path,signature_path,delivered_by) values(p_order_id,btrim(p_recipient_name),nullif(btrim(p_delivery_note),''),p_photo_path,p_signature_path,v_actor);
  update public.orders set status='delivered',delivered_at=now() where id=p_order_id;
  if v_truck is not null then update public.trucks set status='available',driver_id=null,updated_at=now() where id=v_truck; end if;
end $$;

revoke all on function public.submit_delivery_proof(uuid,text,text,text,text) from public,anon;
grant execute on function public.submit_delivery_proof(uuid,text,text,text,text) to authenticated;

do $$ begin alter publication supabase_realtime add table public.delivery_proofs; exception when duplicate_object then null; end $$;

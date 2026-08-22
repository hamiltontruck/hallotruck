alter table public.driver_verification_files
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists submission_source text not null default 'driver_portal',
  add column if not exists source_note text;

alter table public.driver_verification_history
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists submission_source text not null default 'driver_portal',
  add column if not exists source_note text;

update public.driver_verification_files
set submitted_by = driver_id
where submitted_by is null;

update public.driver_verification_history
set submitted_by = driver_id
where submitted_by is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'driver_verification_submission_source_check'
      and conrelid = 'public.driver_verification_files'::regclass
  ) then
    alter table public.driver_verification_files
      add constraint driver_verification_submission_source_check
      check (submission_source in ('driver_portal', 'admin_manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'driver_verification_history_submission_source_check'
      and conrelid = 'public.driver_verification_history'::regclass
  ) then
    alter table public.driver_verification_history
      add constraint driver_verification_history_submission_source_check
      check (submission_source in ('driver_portal', 'admin_manual'));
  end if;
end;
$$;

create or replace function public.archive_driver_verification_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := 'updated';
begin
  if tg_op = 'UPDATE' then
    if new.file_path is distinct from old.file_path then
      v_reason := 'replaced';
    elsif new.status is distinct from old.status then
      v_reason := 'status_changed';
    end if;
  elsif tg_op = 'DELETE' then
    v_reason := 'deleted';
  end if;

  insert into public.driver_verification_history (
    source_document_id,
    driver_id,
    truck_id,
    document_key,
    file_path,
    original_name,
    mime_type,
    expiry_date,
    status,
    rejection_reason,
    reviewed_by,
    reviewed_at,
    source_created_at,
    source_updated_at,
    archive_reason,
    submitted_by,
    submission_source,
    source_note
  ) values (
    old.id,
    old.driver_id,
    old.truck_id,
    old.document_key,
    old.file_path,
    old.original_name,
    old.mime_type,
    old.expiry_date,
    old.status,
    old.rejection_reason,
    old.reviewed_by,
    old.reviewed_at,
    old.created_at,
    old.updated_at,
    v_reason,
    old.submitted_by,
    old.submission_source,
    old.source_note
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop policy if exists "driver verification storage leadership insert" on storage.objects;
create policy "driver verification storage leadership insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'driver-verification'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'ceo')
);

drop policy if exists "driver verification storage leadership cleanup" on storage.objects;
create policy "driver verification storage leadership cleanup"
on storage.objects for delete to authenticated
using (
  bucket_id = 'driver-verification'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'ceo')
  and not exists (
    select 1 from public.driver_verification_files f where f.file_path = objects.name
  )
  and not exists (
    select 1 from public.driver_verification_history h where h.file_path = objects.name
  )
);

create or replace function public.admin_upsert_driver_document(
  p_driver_id uuid,
  p_truck_id uuid,
  p_document_key text,
  p_file_path text,
  p_original_name text,
  p_mime_type text,
  p_expiry_date date default null,
  p_verify boolean default false,
  p_source_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  v_key text := lower(btrim(coalesce(p_document_key, '')));
  v_file_path text := btrim(coalesce(p_file_path, ''));
  v_original_name text := btrim(coalesce(p_original_name, ''));
  v_mime_type text := lower(btrim(coalesce(p_mime_type, '')));
  v_note text := nullif(btrim(coalesce(p_source_note, '')), '');
  v_document_id uuid;
  v_identity_keys constant text[] := array[
    'driver_photo', 'license_front', 'license_back',
    'national_id_front', 'national_id_back'
  ];
  v_vehicle_keys constant text[] := array[
    'vehicle_registration', 'insurance', 'transport_permit',
    'truck_front', 'truck_back', 'truck_side', 'truck_loading_area'
  ];
begin
  if v_actor is null or v_role not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_driver_id and p.role::text = 'driver'
  ) then
    raise exception 'Driver profile not found';
  end if;

  if not (v_key = any(v_identity_keys) or v_key = any(v_vehicle_keys)) then
    raise exception 'Unsupported driver document type';
  end if;

  if v_key = any(v_identity_keys) and p_truck_id is not null then
    raise exception 'Identity documents cannot be attached to a truck';
  end if;

  if v_key = any(v_vehicle_keys) then
    if p_truck_id is null then
      raise exception 'Vehicle documents require a truck';
    end if;
    if not exists (
      select 1 from public.trucks t
      where t.id = p_truck_id
        and (t.driver_id = p_driver_id or t.created_by = p_driver_id)
    ) then
      raise exception 'Selected truck is not linked to this driver';
    end if;
  end if;

  if v_file_path = '' or split_part(v_file_path, '/', 1) <> p_driver_id::text then
    raise exception 'Document storage path must start with the driver ID';
  end if;

  if v_original_name = '' then
    raise exception 'Original file name is required';
  end if;

  if v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'Document must be JPG, PNG, WebP or PDF';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Source note must be 500 characters or fewer';
  end if;

  if p_verify and p_expiry_date is not null and p_expiry_date < current_date then
    raise exception 'An expired document cannot be verified';
  end if;

  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'driver-verification' and so.name = v_file_path
  ) then
    raise exception 'Uploaded document was not found in storage';
  end if;

  if p_truck_id is null then
    insert into public.driver_verification_files (
      driver_id, truck_id, document_key, file_path, original_name, mime_type,
      expiry_date, status, rejection_reason, reviewed_by, reviewed_at,
      submitted_by, submission_source, source_note, updated_at
    ) values (
      p_driver_id, null, v_key, v_file_path, v_original_name, v_mime_type,
      p_expiry_date, case when p_verify then 'verified' else 'pending' end,
      null, case when p_verify then v_actor else null end,
      case when p_verify then now() else null end,
      v_actor, 'admin_manual', v_note, now()
    )
    on conflict (driver_id, document_key) where truck_id is null
    do update set
      file_path = excluded.file_path,
      original_name = excluded.original_name,
      mime_type = excluded.mime_type,
      expiry_date = excluded.expiry_date,
      status = excluded.status,
      rejection_reason = null,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at,
      submitted_by = excluded.submitted_by,
      submission_source = excluded.submission_source,
      source_note = excluded.source_note,
      updated_at = now()
    returning id into v_document_id;
  else
    insert into public.driver_verification_files (
      driver_id, truck_id, document_key, file_path, original_name, mime_type,
      expiry_date, status, rejection_reason, reviewed_by, reviewed_at,
      submitted_by, submission_source, source_note, updated_at
    ) values (
      p_driver_id, p_truck_id, v_key, v_file_path, v_original_name, v_mime_type,
      p_expiry_date, case when p_verify then 'verified' else 'pending' end,
      null, case when p_verify then v_actor else null end,
      case when p_verify then now() else null end,
      v_actor, 'admin_manual', v_note, now()
    )
    on conflict (truck_id, document_key) where truck_id is not null
    do update set
      driver_id = excluded.driver_id,
      file_path = excluded.file_path,
      original_name = excluded.original_name,
      mime_type = excluded.mime_type,
      expiry_date = excluded.expiry_date,
      status = excluded.status,
      rejection_reason = null,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at,
      submitted_by = excluded.submitted_by,
      submission_source = excluded.submission_source,
      source_note = excluded.source_note,
      updated_at = now()
    returning id into v_document_id;
  end if;

  return v_document_id;
end;
$$;

create or replace function public.driver_submit_collected_payment(
  p_order_id uuid,
  p_collection_method text,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_receipt_path text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
  v_order_driver uuid;
  v_order_status public.order_status;
  v_order_total numeric;
  v_tracking_id text;
  v_method text := lower(btrim(coalesce(p_collection_method, '')));
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_provider_ref text := nullif(btrim(coalesce(p_provider_ref, '')), '');
  v_receipt_path text := btrim(coalesce(p_receipt_path, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payment_id uuid;
  v_existing_event public.payment_event;
  v_allowed_bank_providers constant text[] := array[
    'telebirr', 'cbe', 'awash_bank', 'bank_of_abyssinia',
    'dashen_bank', 'coop_bank_oromia', 'mpesa', 'other_bank'
  ];
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in required';
  end if;

  if not public.is_approved_driver() then
    raise exception 'Approved driver account required';
  end if;

  select o.driver_id, o.status, coalesce(o.price_etb, 0), o.tracking_id
    into v_order_driver, v_order_status, v_order_total, v_tracking_id
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order_driver is distinct from v_driver_id then
    raise exception 'Only the assigned driver can report this payment';
  end if;

  if v_order_status <> 'delivered' then
    raise exception 'Payment collection can only be reported after delivery';
  end if;

  if v_order_total <= 0 then
    raise exception 'Order invoice total is invalid';
  end if;

  if p_amount_etb is null or abs(p_amount_etb - v_order_total) > 0.005 then
    raise exception 'Partial payment is not enabled. Report the full invoice amount of ETB %', v_order_total;
  end if;

  if v_method not in ('cash', 'bank') then
    raise exception 'Collection method must be cash or bank';
  end if;

  if v_method = 'cash' then
    v_provider := 'cash_to_driver';
    v_provider_ref := null;
  else
    if not (v_provider = any(v_allowed_bank_providers)) then
      raise exception 'Select a supported bank or mobile payment provider';
    end if;
    if v_provider_ref is null then
      raise exception 'Transaction ID is required for bank or mobile payment';
    end if;
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Collection note must be 500 characters or fewer';
  end if;

  if v_receipt_path = '' or split_part(v_receipt_path, '/', 1) <> v_driver_id::text then
    raise exception 'Invalid payment evidence path';
  end if;

  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'payment-receipts' and so.name = v_receipt_path
  ) then
    raise exception 'Payment evidence upload was not found';
  end if;

  select p.id, p.event
    into v_payment_id, v_existing_event
  from public.payments p
  where p.order_id = p_order_id
    and p.event in ('initiated', 'held_escrow', 'released')
  order by p.created_at desc
  limit 1
  for update;

  if v_payment_id is not null then
    raise exception 'A payment is already submitted or verified for this order';
  end if;

  select p.id
    into v_payment_id
  from public.payments p
  where p.order_id = p_order_id
    and p.event = 'failed'
    and coalesce(p.raw_payload ->> 'source', '') = 'driver_collection'
  order by p.created_at desc
  limit 1
  for update;

  if v_payment_id is not null then
    update public.payments
    set provider = v_provider,
        provider_ref = v_provider_ref,
        amount_etb = v_order_total,
        event = 'initiated',
        receipt_path = v_receipt_path,
        raw_payload = jsonb_strip_nulls(jsonb_build_object(
          'source', 'driver_collection',
          'collection_method', v_method,
          'collected_by', v_driver_id,
          'direct_to_driver', true,
          'note', v_note,
          'tracking_id', v_tracking_id
        ))
    where id = v_payment_id;
  else
    insert into public.payments (
      order_id, provider, provider_ref, amount_etb, event, receipt_path, raw_payload
    ) values (
      p_order_id,
      v_provider,
      v_provider_ref,
      v_order_total,
      'initiated',
      v_receipt_path,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'driver_collection',
        'collection_method', v_method,
        'collected_by', v_driver_id,
        'direct_to_driver', true,
        'note', v_note,
        'tracking_id', v_tracking_id
      ))
    ) returning id into v_payment_id;
  end if;

  update public.orders
  set payment_provider = v_provider,
      payment_ref = v_provider_ref
  where id = p_order_id;

  return v_payment_id;
end;
$$;

create or replace function public.driver_collected_payment_status(p_order_id uuid)
returns table(
  payment_id uuid,
  payment_event text,
  collection_method text,
  provider text,
  provider_ref text,
  amount_etb numeric,
  receipt_path text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in required';
  end if;

  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.driver_id = v_driver_id
  ) then
    raise exception 'This order is not assigned to the signed-in driver';
  end if;

  return query
  select
    p.id,
    p.event::text,
    coalesce(p.raw_payload ->> 'collection_method', 'cash'),
    p.provider,
    p.provider_ref,
    p.amount_etb,
    p.receipt_path,
    p.rejection_reason,
    p.created_at,
    p.reviewed_at
  from public.payments p
  where p.order_id = p_order_id
    and coalesce(p.raw_payload ->> 'source', '') = 'driver_collection'
  order by p.created_at desc
  limit 1;
end;
$$;

create or replace function public.driver_unreported_deliveries()
returns table(
  order_id uuid,
  tracking_id text,
  pickup_address text,
  dropoff_address text,
  price_etb numeric,
  delivered_at timestamptz,
  rejection_reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
begin
  if v_driver_id is null then
    raise exception 'Driver sign-in required';
  end if;

  return query
  select
    o.id,
    o.tracking_id,
    o.pickup_address,
    o.dropoff_address,
    coalesce(o.price_etb, 0),
    o.delivered_at,
    failed_driver.rejection_reason
  from public.orders o
  left join lateral (
    select p.rejection_reason
    from public.payments p
    where p.order_id = o.id
      and p.event = 'failed'
      and coalesce(p.raw_payload ->> 'source', '') = 'driver_collection'
    order by p.created_at desc
    limit 1
  ) failed_driver on true
  where o.driver_id = v_driver_id
    and o.status = 'delivered'
    and not exists (
      select 1 from public.payments active_payment
      where active_payment.order_id = o.id
        and active_payment.event in ('initiated', 'held_escrow', 'released')
    )
  order by o.delivered_at desc nulls last, o.created_at desc
  limit 10;
end;
$$;

create or replace function public.sync_cash_driver_commission_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_driver uuid;
  v_driver_collection boolean := coalesce(new.raw_payload ->> 'source', '') = 'driver_collection';
  v_cash_provider boolean := lower(replace(btrim(new.provider), ' ', '_')) in ('cash', 'cash_to_driver', 'driver_cash');
begin
  if v_driver_collection or v_cash_provider then
    select o.driver_id into order_driver
    from public.orders o
    where o.id = new.order_id;

    if new.event = 'released' and order_driver is not null then
      insert into public.driver_commission_charges(
        driver_id, order_id, payment_id, gross_etb, commission_etb, status, source, updated_at
      ) values (
        order_driver,
        new.order_id,
        new.id,
        new.amount_etb,
        round(new.amount_etb * 0.02, 2),
        'active',
        case when v_driver_collection then 'driver_collection' else 'cash_to_driver' end,
        now()
      )
      on conflict(payment_id) do update set
        driver_id = excluded.driver_id,
        gross_etb = excluded.gross_etb,
        commission_etb = excluded.commission_etb,
        status = 'active',
        source = excluded.source,
        updated_at = now();
    elsif new.event in ('refunded', 'failed') then
      update public.driver_commission_charges
      set status = 'reversed', updated_at = now()
      where payment_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_review_customer_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.payment_event;
  v_order_id uuid;
  v_order_status public.order_status;
  v_source text;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  v_driver_collection boolean;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select p.event, p.order_id, coalesce(p.raw_payload ->> 'source', ''), o.status
    into v_event, v_order_id, v_source, v_order_status
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = p_payment_id
  for update of p, o;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_event <> 'initiated' then
    raise exception 'Only initiated payments can be reviewed';
  end if;

  v_driver_collection := v_source = 'driver_collection';

  if p_approve then
    if v_driver_collection and v_order_status <> 'delivered' then
      raise exception 'Driver-collected payment can only be verified after delivery';
    end if;

    update public.payments
    set event = 'held_escrow',
        reviewed_by = v_actor,
        reviewed_at = now(),
        rejection_reason = null
    where id = p_payment_id;

    if v_driver_collection then
      update public.payments
      set event = 'released'
      where id = p_payment_id and event = 'held_escrow';
    end if;
  else
    if v_reason is null or char_length(v_reason) < 5 then
      raise exception 'Write a rejection reason of at least 5 characters';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'Rejection reason must be 500 characters or fewer';
    end if;

    update public.payments
    set event = 'failed',
        reviewed_by = v_actor,
        reviewed_at = now(),
        rejection_reason = v_reason
    where id = p_payment_id;

    update public.customer_dispatch_requests
    set status = 'expired', updated_at = now()
    where order_id = v_order_id and status = 'requested';
  end if;

  perform public.recompute_order_payment_status(v_order_id);
end;
$$;

revoke all on function public.admin_upsert_driver_document(uuid, uuid, text, text, text, text, date, boolean, text) from public, anon;
grant execute on function public.admin_upsert_driver_document(uuid, uuid, text, text, text, text, date, boolean, text) to authenticated;

revoke all on function public.driver_submit_collected_payment(uuid, text, text, text, numeric, text, text) from public, anon;
grant execute on function public.driver_submit_collected_payment(uuid, text, text, text, numeric, text, text) to authenticated;

revoke all on function public.driver_collected_payment_status(uuid) from public, anon;
grant execute on function public.driver_collected_payment_status(uuid) to authenticated;

revoke all on function public.driver_unreported_deliveries() from public, anon;
grant execute on function public.driver_unreported_deliveries() to authenticated;

notify pgrst, 'reload schema';

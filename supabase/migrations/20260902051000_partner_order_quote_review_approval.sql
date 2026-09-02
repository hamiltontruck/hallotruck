begin;

alter table public.partner_orders
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete restrict,
  add column if not exists quoted_at timestamptz,
  add column if not exists quoted_by uuid references public.profiles(id) on delete restrict,
  add column if not exists quote_amount_etb numeric(14,2),
  add column if not exists quote_expires_at timestamptz,
  add column if not exists quote_version integer not null default 0,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz;

alter table public.partner_orders
  drop constraint if exists partner_orders_quote_amount_positive;
alter table public.partner_orders
  add constraint partner_orders_quote_amount_positive
  check (quote_amount_etb is null or quote_amount_etb > 0);

alter table public.partner_orders
  drop constraint if exists partner_orders_quote_state_complete;
alter table public.partner_orders
  add constraint partner_orders_quote_state_complete
  check (
    status not in ('quoted','approved')
    or (
      quote_amount_etb is not null
      and quoted_at is not null
      and quoted_by is not null
      and quote_expires_at is not null
      and quote_version > 0
    )
  );

create or replace function public.admin_start_partner_order_review(
  p_order_id uuid,
  p_admin_notes text,
  p_request_key uuid
)
returns public.partner_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.partner_orders%rowtype;
  v_notes text := nullif(btrim(coalesce(p_admin_notes,'')),'');
begin
  if v_actor is null or p_request_key is null then
    raise exception 'Admin session and request key are required';
  end if;
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Active Admin or CEO authorization is required.';
  end if;
  if length(coalesce(v_notes,'')) > 4000 then
    raise exception 'Admin notes must be 4000 characters or fewer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text,0));
  select * into v_order from public.partner_orders where id=p_order_id for update;
  if not found then raise exception 'Partner order not found'; end if;
  if v_order.status='under_review' then return v_order; end if;
  if v_order.status<>'submitted' then
    raise exception 'Only submitted Partner orders can enter review';
  end if;

  update public.partner_orders
  set status='under_review', reviewed_at=now(), reviewed_by=v_actor,
      admin_notes=coalesce(v_notes,admin_notes), updated_at=now()
  where id=v_order.id
  returning * into v_order;

  insert into public.partner_order_status_history(
    partner_order_id,partner_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_order.id,v_order.partner_id,'submitted','under_review',v_actor,
    coalesce(v_notes,'HALLO review started'),
    jsonb_build_object('request_key',p_request_key)
  );
  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    v_order.partner_id,v_actor,'partner_order_review_started','partner_order',v_order.id::text,
    jsonb_build_object('reference',v_order.reference,'request_key',p_request_key)
  );
  return v_order;
end;
$$;

create or replace function public.admin_quote_partner_order(
  p_order_id uuid,
  p_quote_amount_etb numeric,
  p_quote_expires_at timestamptz,
  p_admin_notes text,
  p_request_key uuid
)
returns public.partner_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.partner_orders%rowtype;
  v_notes text := nullif(btrim(coalesce(p_admin_notes,'')),'');
  v_amount numeric(14,2);
  v_version integer;
begin
  if v_actor is null or p_request_key is null then
    raise exception 'Admin session and request key are required';
  end if;
  if not (select private.is_admin_or_ceo()) then
    raise exception 'Active Admin or CEO authorization is required.';
  end if;
  if p_quote_amount_etb is null or p_quote_amount_etb <= 0 then
    raise exception 'Quote amount must be greater than zero';
  end if;
  if p_quote_expires_at is null or p_quote_expires_at <= now() then
    raise exception 'Quote expiry must be in the future';
  end if;
  if length(coalesce(v_notes,'')) > 4000 then
    raise exception 'Admin notes must be 4000 characters or fewer';
  end if;
  v_amount := round(p_quote_amount_etb,2);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text,0));
  select * into v_order from public.partner_orders where id=p_order_id for update;
  if not found then raise exception 'Partner order not found'; end if;
  if v_order.status='quoted' then
    if v_order.quote_amount_etb=v_amount and v_order.quote_expires_at=p_quote_expires_at then
      return v_order;
    end if;
    raise exception 'Partner order already has an active quote';
  end if;
  if v_order.status<>'under_review' then
    raise exception 'Only Partner orders under review can be quoted';
  end if;

  v_version := v_order.quote_version + 1;
  update public.partner_orders
  set status='quoted', quoted_at=now(), quoted_by=v_actor,
      quote_amount_etb=v_amount, quote_expires_at=p_quote_expires_at,
      quote_version=v_version,
      pricing=coalesce(pricing,'{}'::jsonb) || jsonb_build_object(
        'state','quoted','currency','ETB','quoted_amount_etb',v_amount,
        'quote_expires_at',p_quote_expires_at,'quote_version',v_version
      ),
      admin_notes=coalesce(v_notes,admin_notes), updated_at=now()
  where id=v_order.id
  returning * into v_order;

  insert into public.partner_order_status_history(
    partner_order_id,partner_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_order.id,v_order.partner_id,'under_review','quoted',v_actor,
    coalesce(v_notes,'HALLO quote issued'),
    jsonb_build_object(
      'request_key',p_request_key,'quote_amount_etb',v_amount,
      'quote_expires_at',p_quote_expires_at,'quote_version',v_version
    )
  );
  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    v_order.partner_id,v_actor,'partner_order_quoted','partner_order',v_order.id::text,
    jsonb_build_object(
      'reference',v_order.reference,'quote_amount_etb',v_amount,
      'quote_expires_at',p_quote_expires_at,'quote_version',v_version,
      'request_key',p_request_key
    )
  );
  return v_order;
end;
$$;

create or replace function public.partner_respond_to_order_quote(
  p_order_id uuid,
  p_action text,
  p_reason text,
  p_request_key uuid
)
returns public.partner_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.partner_orders%rowtype;
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_next_status text;
begin
  if v_actor is null or p_request_key is null then
    raise exception 'Partner session and request key are required';
  end if;
  if v_action not in ('accept','reject') then
    raise exception 'Quote action must be accept or reject';
  end if;
  if v_action='reject' and v_reason is null then
    raise exception 'A rejection reason is required';
  end if;
  if length(coalesce(v_reason,'')) > 2000 then
    raise exception 'Quote response reason must be 2000 characters or fewer';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text,0));
  select * into v_order from public.partner_orders where id=p_order_id for update;
  if not found then raise exception 'Partner order not found'; end if;

  if not exists (
    select 1 from public.partner_memberships membership
    join public.partner_organizations organization on organization.id=membership.partner_id
    join public.profiles profile on profile.id=membership.user_id
    where membership.partner_id=v_order.partner_id and membership.user_id=v_actor
      and membership.active and membership.member_role in ('owner','admin')
      and organization.status='active' and profile.role::text='partner'
  ) then raise exception 'Active Partner owner or admin access required'; end if;

  if v_action='accept' and v_order.status='approved' then return v_order; end if;
  if v_action='reject' and v_order.status='rejected' then return v_order; end if;
  if v_order.status<>'quoted' then
    raise exception 'Only quoted Partner orders can receive a quote response';
  end if;

  if v_order.quote_expires_at is null or v_order.quote_expires_at <= now() then
    update public.partner_orders
    set status='expired', pricing=coalesce(pricing,'{}'::jsonb) || jsonb_build_object('state','expired'), updated_at=now()
    where id=v_order.id
    returning * into v_order;
    insert into public.partner_order_status_history(
      partner_order_id,partner_id,from_status,to_status,actor_id,reason,metadata
    ) values (
      v_order.id,v_order.partner_id,'quoted','expired',v_actor,'Quote expired before Partner response',
      jsonb_build_object('request_key',p_request_key,'quote_version',v_order.quote_version)
    );
    insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
    values(
      v_order.partner_id,v_actor,'partner_order_quote_expired','partner_order',v_order.id::text,
      jsonb_build_object('reference',v_order.reference,'quote_version',v_order.quote_version,'request_key',p_request_key)
    );
    return v_order;
  end if;

  v_next_status := case when v_action='accept' then 'approved' else 'rejected' end;
  update public.partner_orders
  set status=v_next_status,
      approved_at=case when v_action='accept' then now() else approved_at end,
      rejected_at=case when v_action='reject' then now() else rejected_at end,
      pricing=coalesce(pricing,'{}'::jsonb) || jsonb_build_object('state',v_next_status),
      updated_at=now()
  where id=v_order.id
  returning * into v_order;

  insert into public.partner_order_status_history(
    partner_order_id,partner_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_order.id,v_order.partner_id,'quoted',v_next_status,v_actor,
    coalesce(v_reason,case when v_action='accept' then 'Partner accepted HALLO quote' else 'Partner rejected HALLO quote' end),
    jsonb_build_object(
      'request_key',p_request_key,'quote_amount_etb',v_order.quote_amount_etb,
      'quote_version',v_order.quote_version
    )
  );
  insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)
  values(
    v_order.partner_id,v_actor,
    case when v_action='accept' then 'partner_order_quote_accepted' else 'partner_order_quote_rejected' end,
    'partner_order',v_order.id::text,
    jsonb_build_object(
      'reference',v_order.reference,'quote_amount_etb',v_order.quote_amount_etb,
      'quote_version',v_order.quote_version,'request_key',p_request_key
    )
  );
  return v_order;
end;
$$;

revoke all on function public.admin_start_partner_order_review(uuid,text,uuid) from public,anon;
revoke all on function public.admin_quote_partner_order(uuid,numeric,timestamptz,text,uuid) from public,anon;
revoke all on function public.partner_respond_to_order_quote(uuid,text,text,uuid) from public,anon;
grant execute on function public.admin_start_partner_order_review(uuid,text,uuid) to authenticated;
grant execute on function public.admin_quote_partner_order(uuid,numeric,timestamptz,text,uuid) to authenticated;
grant execute on function public.partner_respond_to_order_quote(uuid,text,text,uuid) to authenticated;

commit;

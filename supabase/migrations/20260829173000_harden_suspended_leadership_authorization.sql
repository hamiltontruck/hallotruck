-- Issue #188: suspended Admin/CEO authorization hardening.
--
-- This migration establishes one database-backed leadership authorization model,
-- denies suspended leadership immediately (including existing JWT sessions), and
-- places a verified guard in front of every privileged RPC that previously relied
-- on JWT role claims or a role-only profile lookup.
--
-- Rollback note:
--   The original implementations are preserved under *_unchecked_188 names.
--   A rollback may drop the guarded wrappers and rename those implementations back,
--   but doing so re-opens the suspended-session vulnerability and must only happen
--   during a controlled incident rollback.

begin;

create or replace function private.require_active_leadership(
  p_operation text default null,
  p_allow_service_role boolean default false
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_auth_role text := coalesce(auth.role(), '');
  v_profile_role text;
  v_claims jsonb;
begin
  if p_allow_service_role and v_auth_role = 'service_role' then
    return 'service_role';
  end if;

  if v_actor is null then
    raise log 'Denied privileged operation %: unauthenticated actor',
      coalesce(p_operation, 'unspecified');
    raise exception 'Active Admin or CEO authorization is required.'
      using errcode = '42501';
  end if;

  select profile.role::text
    into v_profile_role
  from public.profiles profile
  where profile.id = v_actor
    and profile.role::text in ('admin', 'ceo')
    and coalesce(profile.driver_status::text, 'active') <> 'suspended';

  if v_profile_role is null then
    raise log 'Denied privileged operation % for actor %: profile missing, non-leadership, or suspended',
      coalesce(p_operation, 'unspecified'), v_actor;
    raise exception 'Active Admin or CEO authorization is required.'
      using errcode = '42501';
  end if;

  -- Legacy implementations behind guarded wrappers still inspect app_metadata.role.
  -- Normalize that claim only after the current database profile has been verified.
  v_claims := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
  v_claims := jsonb_set(
    v_claims,
    '{app_metadata}',
    coalesce(v_claims -> 'app_metadata', '{}'::jsonb)
      || jsonb_build_object('role', v_profile_role),
    true
  );
  perform set_config('request.jwt.claims', v_claims::text, true);

  return v_profile_role;
end;
$function$;

create or replace function private.is_admin_or_ceo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role::text in ('admin', 'ceo')
        and coalesce(profile.driver_status::text, 'active') <> 'suspended'
    );
$function$;

revoke all on function private.require_active_leadership(text, boolean) from public, anon, authenticated;
revoke all on function private.is_admin_or_ceo() from public, anon;
grant execute on function private.is_admin_or_ceo() to authenticated;

-- Preserve implementations while ensuring clients can execute only guarded wrappers.
alter function public.admin_approve_driver_onboarding(uuid)
  rename to admin_approve_driver_onboarding_unchecked_188;
alter function public.admin_assign_order(uuid, uuid, uuid)
  rename to admin_assign_order_unchecked_188;
alter function public.admin_finalize_driver_onboarding(uuid)
  rename to admin_finalize_driver_onboarding_unchecked_188;
alter function public.admin_get_customer_dispatch_request(uuid)
  rename to admin_get_customer_dispatch_request_unchecked_188;
alter function public.admin_order_assignment_candidates(uuid)
  rename to admin_order_assignment_candidates_unchecked_188;
alter function public.admin_record_driver_deposit(uuid, numeric, text, text)
  rename to admin_record_driver_deposit_unchecked_188;
alter function public.admin_record_payment(uuid, text, text, numeric, public.payment_event)
  rename to admin_record_payment_unchecked_188;
alter function public.admin_restore_driver(uuid)
  rename to admin_restore_driver_unchecked_188;
alter function public.admin_reverse_driver_commission_deposit(uuid, text)
  rename to admin_reverse_driver_commission_deposit_unchecked_188;
alter function public.admin_review_driver_commission_payment(uuid, boolean, text)
  rename to admin_review_driver_commission_payment_unchecked_188;
alter function public.admin_suspend_driver(uuid)
  rename to admin_suspend_driver_unchecked_188;
alter function public.admin_transition_order(uuid, public.order_status)
  rename to admin_transition_order_unchecked_188;
alter function public.admin_update_quote_pricing_rule(text, numeric, numeric, numeric, numeric, numeric)
  rename to admin_update_quote_pricing_rule_unchecked_188;
alter function public.admin_update_quote_pricing_rule_v2(text, numeric, numeric, numeric, numeric)
  rename to admin_update_quote_pricing_rule_v2_unchecked_188;
alter function public.admin_upsert_driver_document(uuid, uuid, text, text, text, text, date, boolean, text)
  rename to admin_upsert_driver_document_unchecked_188;
alter function public.customer_get_live_trip(uuid)
  rename to customer_get_live_trip_unchecked_188;
alter function public.driver_commission_balance(uuid)
  rename to driver_commission_balance_unchecked_188;
alter function public.driver_financial_summary(uuid)
  rename to driver_financial_summary_unchecked_188;
alter function public.submit_delivery_proof(uuid, text, text, text, text)
  rename to submit_delivery_proof_unchecked_188;

revoke all on function public.admin_approve_driver_onboarding_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.admin_assign_order_unchecked_188(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_finalize_driver_onboarding_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.admin_get_customer_dispatch_request_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.admin_order_assignment_candidates_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.admin_record_driver_deposit_unchecked_188(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.admin_record_payment_unchecked_188(uuid, text, text, numeric, public.payment_event) from public, anon, authenticated;
revoke all on function public.admin_restore_driver_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.admin_reverse_driver_commission_deposit_unchecked_188(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_review_driver_commission_payment_unchecked_188(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_suspend_driver_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.admin_transition_order_unchecked_188(uuid, public.order_status) from public, anon, authenticated;
revoke all on function public.admin_update_quote_pricing_rule_unchecked_188(text, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.admin_update_quote_pricing_rule_v2_unchecked_188(text, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.admin_upsert_driver_document_unchecked_188(uuid, uuid, text, text, text, text, date, boolean, text) from public, anon, authenticated;
revoke all on function public.customer_get_live_trip_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.driver_commission_balance_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.driver_financial_summary_unchecked_188(uuid) from public, anon, authenticated;
revoke all on function public.submit_delivery_proof_unchecked_188(uuid, text, text, text, text) from public, anon, authenticated;

create function public.admin_approve_driver_onboarding(p_driver_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_approve_driver_onboarding');
  perform public.admin_approve_driver_onboarding_unchecked_188(p_driver_id);
end;
$function$;

create function public.admin_assign_order(p_order_id uuid, p_truck_id uuid, p_driver_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_assign_order');
  perform public.admin_assign_order_unchecked_188(p_order_id, p_truck_id, p_driver_id);
end;
$function$;

create function public.admin_finalize_driver_onboarding(p_driver_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_finalize_driver_onboarding');
  perform public.admin_finalize_driver_onboarding_unchecked_188(p_driver_id);
end;
$function$;

create function public.admin_get_customer_dispatch_request(p_order_id uuid)
returns table(
  order_id uuid, driver_id uuid, truck_id uuid, status text,
  distance_km numeric, eta_minutes integer, updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership(
    'admin_get_customer_dispatch_request',
    true
  );
  return query
  select * from public.admin_get_customer_dispatch_request_unchecked_188(p_order_id);
end;
$function$;

create function public.admin_order_assignment_candidates(p_order_id uuid)
returns table(
  driver_id uuid, driver_name text, driver_phone text, truck_id uuid,
  plate_number text, vehicle_type text, capacity_tons numeric,
  distance_km numeric, location_accuracy_m numeric, presence_updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership(
    'admin_order_assignment_candidates',
    true
  );
  return query
  select * from public.admin_order_assignment_candidates_unchecked_188(p_order_id);
end;
$function$;

create function public.admin_record_driver_deposit(
  p_driver_id uuid,
  p_amount_etb numeric,
  p_reference text default null,
  p_note text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_record_driver_deposit');
  return public.admin_record_driver_deposit_unchecked_188(
    p_driver_id, p_amount_etb, p_reference, p_note
  );
end;
$function$;

create function public.admin_record_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_event public.payment_event
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_record_payment');
  perform public.admin_record_payment_unchecked_188(
    p_order_id, p_provider, p_provider_ref, p_amount_etb, p_event
  );
end;
$function$;

create function public.admin_restore_driver(p_driver_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_restore_driver');
  return public.admin_restore_driver_unchecked_188(p_driver_id);
end;
$function$;

create function public.admin_reverse_driver_commission_deposit(
  p_deposit_id uuid,
  p_reason text
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership(
    'admin_reverse_driver_commission_deposit'
  );
  perform public.admin_reverse_driver_commission_deposit_unchecked_188(
    p_deposit_id, p_reason
  );
end;
$function$;

create function public.admin_review_driver_commission_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership(
    'admin_review_driver_commission_payment'
  );
  perform public.admin_review_driver_commission_payment_unchecked_188(
    p_payment_id, p_approve, p_rejection_reason
  );
end;
$function$;

create function public.admin_suspend_driver(p_driver_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_suspend_driver');
  return public.admin_suspend_driver_unchecked_188(p_driver_id);
end;
$function$;

create function public.admin_transition_order(
  p_order_id uuid,
  p_status public.order_status
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_transition_order');
  perform public.admin_transition_order_unchecked_188(p_order_id, p_status);
end;
$function$;

create function public.admin_update_quote_pricing_rule(
  p_vehicle_key text,
  p_rate_per_km numeric,
  p_rate_per_ton numeric,
  p_base_fee_etb numeric,
  p_minimum_fare_etb numeric,
  p_market_adjustment_percent numeric
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership(
    'admin_update_quote_pricing_rule'
  );
  perform public.admin_update_quote_pricing_rule_unchecked_188(
    p_vehicle_key, p_rate_per_km, p_rate_per_ton, p_base_fee_etb,
    p_minimum_fare_etb, p_market_adjustment_percent
  );
end;
$function$;

create function public.admin_update_quote_pricing_rule_v2(
  p_vehicle_key text,
  p_rate_per_ton_km numeric,
  p_base_fee_etb numeric,
  p_minimum_fare_etb numeric,
  p_market_adjustment_percent numeric
)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership(
    'admin_update_quote_pricing_rule_v2'
  );
  perform public.admin_update_quote_pricing_rule_v2_unchecked_188(
    p_vehicle_key, p_rate_per_ton_km, p_base_fee_etb,
    p_minimum_fare_etb, p_market_adjustment_percent
  );
end;
$function$;

create function public.admin_upsert_driver_document(
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
returns uuid language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.require_active_leadership('admin_upsert_driver_document');
  return public.admin_upsert_driver_document_unchecked_188(
    p_driver_id, p_truck_id, p_document_key, p_file_path, p_original_name,
    p_mime_type, p_expiry_date, p_verify, p_source_note
  );
end;
$function$;

create function public.customer_get_live_trip(p_order_id uuid)
returns table(
  order_id uuid, status public.order_status,
  pickup_lng double precision, pickup_lat double precision,
  dropoff_lng double precision, dropoff_lat double precision,
  truck_lng double precision, truck_lat double precision,
  heading numeric, speed_kmh numeric, recorded_at timestamptz
)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_participant boolean;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select exists(
    select 1 from public.orders trip_order
    where trip_order.id = p_order_id
      and (trip_order.customer_id = v_actor or trip_order.driver_id = v_actor)
  ) into v_participant;

  if not v_participant then
    perform private.require_active_leadership('customer_get_live_trip');
  end if;

  return query
  select * from public.customer_get_live_trip_unchecked_188(p_order_id);
end;
$function$;

create function public.driver_commission_balance(p_driver_id uuid)
returns numeric language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and p_driver_id is distinct from v_actor then
    perform private.require_active_leadership('driver_commission_balance');
  end if;

  return public.driver_commission_balance_unchecked_188(p_driver_id);
end;
$function$;

create function public.driver_financial_summary(p_driver_id uuid)
returns table(
  completed_trips bigint,
  gross_released_etb numeric,
  commission_charged_etb numeric,
  commission_paid_etb numeric,
  admin_deposit_etb numeric,
  available_deposit_etb numeric,
  commission_due_etb numeric
)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and p_driver_id is distinct from v_actor then
    perform private.require_active_leadership('driver_financial_summary');
  end if;

  return query
  select * from public.driver_financial_summary_unchecked_188(p_driver_id);
end;
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role::text = 'admin'
        and coalesce(profile.driver_status::text, 'active') <> 'suspended'
    );
$function$;

create function public.submit_delivery_proof(
  p_order_id uuid,
  p_recipient_name text,
  p_delivery_note text,
  p_photo_path text,
  p_signature_path text
)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_assigned_driver uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select trip_order.driver_id
    into v_assigned_driver
  from public.orders trip_order
  where trip_order.id = p_order_id;

  if v_assigned_driver is distinct from v_actor then
    perform private.require_active_leadership('submit_delivery_proof');
  end if;

  perform public.submit_delivery_proof_unchecked_188(
    p_order_id, p_recipient_name, p_delivery_note,
    p_photo_path, p_signature_path
  );
end;
$function$;

-- Public RPC grants: minimum client surface only.
revoke all on function public.admin_approve_driver_onboarding(uuid) from public, anon;
revoke all on function public.admin_assign_order(uuid, uuid, uuid) from public, anon;
revoke all on function public.admin_finalize_driver_onboarding(uuid) from public, anon;
revoke all on function public.admin_get_customer_dispatch_request(uuid) from public, anon;
revoke all on function public.admin_order_assignment_candidates(uuid) from public, anon;
revoke all on function public.admin_record_driver_deposit(uuid, numeric, text, text) from public, anon;
revoke all on function public.admin_record_payment(uuid, text, text, numeric, public.payment_event) from public, anon;
revoke all on function public.admin_restore_driver(uuid) from public, anon;
revoke all on function public.admin_reverse_driver_commission_deposit(uuid, text) from public, anon;
revoke all on function public.admin_review_driver_commission_payment(uuid, boolean, text) from public, anon;
revoke all on function public.admin_suspend_driver(uuid) from public, anon;
revoke all on function public.admin_transition_order(uuid, public.order_status) from public, anon;
revoke all on function public.admin_update_quote_pricing_rule(text, numeric, numeric, numeric, numeric, numeric) from public, anon;
revoke all on function public.admin_update_quote_pricing_rule_v2(text, numeric, numeric, numeric, numeric) from public, anon;
revoke all on function public.admin_upsert_driver_document(uuid, uuid, text, text, text, text, date, boolean, text) from public, anon;
revoke all on function public.customer_get_live_trip(uuid) from public, anon;
revoke all on function public.driver_commission_balance(uuid) from public, anon;
revoke all on function public.driver_financial_summary(uuid) from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.submit_delivery_proof(uuid, text, text, text, text) from public, anon;

grant execute on function public.admin_approve_driver_onboarding(uuid) to authenticated;
grant execute on function public.admin_assign_order(uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_finalize_driver_onboarding(uuid) to authenticated;
grant execute on function public.admin_get_customer_dispatch_request(uuid) to authenticated;
grant execute on function public.admin_order_assignment_candidates(uuid) to authenticated;
grant execute on function public.admin_record_driver_deposit(uuid, numeric, text, text) to authenticated;
grant execute on function public.admin_record_payment(uuid, text, text, numeric, public.payment_event) to authenticated;
grant execute on function public.admin_restore_driver(uuid) to authenticated;
grant execute on function public.admin_reverse_driver_commission_deposit(uuid, text) to authenticated;
grant execute on function public.admin_review_driver_commission_payment(uuid, boolean, text) to authenticated;
grant execute on function public.admin_suspend_driver(uuid) to authenticated;
grant execute on function public.admin_transition_order(uuid, public.order_status) to authenticated;
grant execute on function public.admin_update_quote_pricing_rule(text, numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.admin_update_quote_pricing_rule_v2(text, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.admin_upsert_driver_document(uuid, uuid, text, text, text, text, date, boolean, text) to authenticated;
grant execute on function public.customer_get_live_trip(uuid) to authenticated;
grant execute on function public.driver_commission_balance(uuid) to authenticated;
grant execute on function public.driver_financial_summary(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.submit_delivery_proof(uuid, text, text, text, text) to authenticated;

grant execute on function public.admin_get_customer_dispatch_request(uuid) to service_role;
grant execute on function public.admin_order_assignment_candidates(uuid) to service_role;
grant execute on function public.driver_commission_balance(uuid) to service_role;
grant execute on function public.driver_financial_summary(uuid) to service_role;

comment on function private.require_active_leadership(text, boolean) is
  'Issue #188 database-backed authorization boundary. Requires a current active Admin/CEO profile and normalizes legacy JWT role checks only after verification.';
comment on function private.is_admin_or_ceo() is
  'True only for an authenticated current Admin/CEO profile that is not suspended.';
comment on function public.is_admin() is
  'True only for an authenticated current Admin profile that is not suspended.';

notify pgrst, 'reload schema';

commit;

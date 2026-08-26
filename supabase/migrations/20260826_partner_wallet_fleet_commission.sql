-- Partner wallet and fleet commission foundation.
-- Commission applies only to HALLO-generated freight explicitly accrued by Admin/CEO.

create table if not exists public.partner_commission_rules (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  commission_type text not null check (commission_type in ('percentage','fixed')), commission_value numeric(14,2) not null check (commission_value >= 0),
  applies_to text not null default 'hallo_generated_freight' check (applies_to='hallo_generated_freight'), effective_from date not null default current_date,
  effective_to date, active boolean not null default true, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to>=effective_from), check ((commission_type='percentage' and commission_value<=100) or commission_type='fixed')
);
create table if not exists public.partner_fleet_vehicles (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id) on delete cascade,
  plate_number text not null, vehicle_type text not null, capacity_tons numeric(10,2), status text not null default 'available' check(status in('available','assigned','maintenance','inactive')),
  external_reference text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(partner_id,plate_number)
);
create table if not exists public.partner_freight_earnings (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id), order_id uuid not null unique references public.orders(id),
  vehicle_id uuid references public.partner_fleet_vehicles(id) on delete set null, source text not null default 'hallo_generated' check(source='hallo_generated'),
  gross_etb numeric(14,2) not null check(gross_etb>=0), commission_type text not null check(commission_type in('percentage','fixed')), commission_value numeric(14,2) not null check(commission_value>=0),
  hallo_commission_etb numeric(14,2) not null check(hallo_commission_etb>=0), partner_net_etb numeric(14,2) not null check(partner_net_etb>=0),
  status text not null default 'accrued' check(status in('accrued','settled','reversed')), accrued_at timestamptz not null default now(), reversed_at timestamptz, created_by uuid not null references public.profiles(id),
  check(round(gross_etb-hallo_commission_etb,2)=round(partner_net_etb,2))
);
create table if not exists public.partner_settlements (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partner_organizations(id), amount_etb numeric(14,2) not null check(amount_etb>0),
  status text not null default 'pending' check(status in('pending','paid','rejected','reversed')), provider text, transaction_ref text, receipt_path text, note text,
  created_by uuid not null references public.profiles(id), approved_by uuid references public.profiles(id), created_at timestamptz not null default now(), paid_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists idx_partner_commission_rules_active on public.partner_commission_rules(partner_id,active,effective_from desc);
create index if not exists idx_partner_fleet_partner_status on public.partner_fleet_vehicles(partner_id,status);
create index if not exists idx_partner_fleet_plate_search on public.partner_fleet_vehicles(partner_id,lower(plate_number));
create index if not exists idx_partner_earnings_partner_status on public.partner_freight_earnings(partner_id,status,accrued_at desc);
create index if not exists idx_partner_settlements_partner_status on public.partner_settlements(partner_id,status,created_at desc);
create index if not exists idx_partner_memberships_finance on public.partner_memberships(user_id,partner_id,active,member_role);

alter table public.partner_commission_rules enable row level security; alter table public.partner_fleet_vehicles enable row level security;
alter table public.partner_freight_earnings enable row level security; alter table public.partner_settlements enable row level security;
revoke all on public.partner_commission_rules,public.partner_fleet_vehicles,public.partner_freight_earnings,public.partner_settlements from anon;
grant select,insert,update on public.partner_commission_rules,public.partner_fleet_vehicles,public.partner_freight_earnings,public.partner_settlements to authenticated;

create or replace function public.can_view_partner_finance(p_partner_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(select 1 from public.partner_memberships m where m.partner_id=p_partner_id and m.user_id=auth.uid() and m.active and m.member_role in('owner','admin'));
$$;
revoke all on function public.can_view_partner_finance(uuid) from public,anon; grant execute on function public.can_view_partner_finance(uuid) to authenticated;
create policy partner_commission_rules_select on public.partner_commission_rules for select to authenticated using(public.can_view_partner_finance(partner_id));
create policy partner_commission_rules_admin_write on public.partner_commission_rules for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy partner_fleet_select on public.partner_fleet_vehicles for select to authenticated using(public.can_view_partner_finance(partner_id));
create policy partner_fleet_admin_write on public.partner_fleet_vehicles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy partner_earnings_select on public.partner_freight_earnings for select to authenticated using(public.can_view_partner_finance(partner_id));
create policy partner_earnings_admin_write on public.partner_freight_earnings for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy partner_settlements_select on public.partner_settlements for select to authenticated using(public.can_view_partner_finance(partner_id));
create policy partner_settlements_admin_write on public.partner_settlements for all to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace function public.partner_wallet_summary(p_partner_id uuid)
returns table(gross_etb numeric,hallo_commission_etb numeric,partner_net_etb numeric,pending_settlement_etb numeric,paid_settlement_etb numeric,payable_etb numeric,fleet_total bigint,fleet_available bigint,hallo_freight_count bigint)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.can_view_partner_finance(p_partner_id) then raise exception 'Partner finance access denied'; end if;
 return query with e as(select coalesce(sum(gross_etb) filter(where status<>'reversed'),0) gross,coalesce(sum(hallo_commission_etb) filter(where status<>'reversed'),0) commission,coalesce(sum(partner_net_etb) filter(where status<>'reversed'),0) net,count(*) filter(where status<>'reversed') freight_count from public.partner_freight_earnings where partner_id=p_partner_id),s as(select coalesce(sum(amount_etb) filter(where status='pending'),0) pending,coalesce(sum(amount_etb) filter(where status='paid'),0) paid from public.partner_settlements where partner_id=p_partner_id),f as(select count(*) total,count(*) filter(where status='available') available from public.partner_fleet_vehicles where partner_id=p_partner_id) select e.gross,e.commission,e.net,s.pending,s.paid,greatest(e.net-s.paid-s.pending,0),f.total,f.available,e.freight_count from e,s,f;
end $$;
revoke all on function public.partner_wallet_summary(uuid) from public,anon; grant execute on function public.partner_wallet_summary(uuid) to authenticated;

-- Admin RPCs snapshot the active rule, require a released payment, and preserve immutable financial history.
create or replace function public.admin_record_partner_freight(p_partner_id uuid,p_order_id uuid,p_vehicle_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.partner_commission_rules%rowtype;g numeric;c numeric;i uuid;a uuid:=auth.uid();begin if not public.is_admin() then raise exception 'Admin or CEO access required';end if;select * into r from public.partner_commission_rules where partner_id=p_partner_id and active and effective_from<=current_date and(effective_to is null or effective_to>=current_date) order by effective_from desc,created_at desc limit 1;if not found then raise exception 'No active partner commission rule';end if;select coalesce(sum(amount_etb) filter(where event='released'),0) into g from public.payments where order_id=p_order_id;if g<=0 then raise exception 'Order has no released payment';end if;if p_vehicle_id is not null and not exists(select 1 from public.partner_fleet_vehicles where id=p_vehicle_id and partner_id=p_partner_id) then raise exception 'Vehicle does not belong to partner';end if;c:=case when r.commission_type='percentage' then round(g*r.commission_value/100,2) else least(r.commission_value,g) end;insert into public.partner_freight_earnings(partner_id,order_id,vehicle_id,gross_etb,commission_type,commission_value,hallo_commission_etb,partner_net_etb,created_by)values(p_partner_id,p_order_id,p_vehicle_id,g,r.commission_type,r.commission_value,c,g-c,a)returning id into i;insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)values(p_partner_id,a,'partner_freight_accrued','partner_freight',i::text,jsonb_build_object('order_id',p_order_id,'gross_etb',g,'hallo_commission_etb',c));return i;end $$;
revoke all on function public.admin_record_partner_freight(uuid,uuid,uuid) from public,anon;grant execute on function public.admin_record_partner_freight(uuid,uuid,uuid) to authenticated;

create or replace function public.admin_create_partner_settlement(p_partner_id uuid,p_amount_etb numeric,p_provider text,p_transaction_ref text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare s record;i uuid;a uuid:=auth.uid();begin if not public.is_admin() then raise exception 'Admin or CEO access required';end if;if p_amount_etb<=0 then raise exception 'Settlement amount must be positive';end if;select * into s from public.partner_wallet_summary(p_partner_id);if p_amount_etb>s.payable_etb then raise exception 'Settlement exceeds partner payable balance';end if;insert into public.partner_settlements(partner_id,amount_etb,status,provider,transaction_ref,note,created_by)values(p_partner_id,p_amount_etb,'pending',nullif(btrim(p_provider),''),nullif(btrim(p_transaction_ref),''),nullif(btrim(p_note),''),a)returning id into i;insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)values(p_partner_id,a,'partner_settlement_created','partner_settlement',i::text,jsonb_build_object('amount_etb',p_amount_etb));return i;end $$;
revoke all on function public.admin_create_partner_settlement(uuid,numeric,text,text,text) from public,anon;grant execute on function public.admin_create_partner_settlement(uuid,numeric,text,text,text) to authenticated;

create or replace function public.admin_mark_partner_settlement_paid(p_settlement_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.partner_settlements%rowtype;a uuid:=auth.uid();begin if not public.is_admin() then raise exception 'Admin or CEO access required';end if;select * into s from public.partner_settlements where id=p_settlement_id for update;if not found then raise exception 'Settlement not found';end if;if s.status<>'pending' then raise exception 'Only pending settlements can be paid';end if;update public.partner_settlements set status='paid',approved_by=a,paid_at=now(),updated_at=now() where id=p_settlement_id;insert into public.partner_activity_log(partner_id,actor_id,action,entity_type,entity_id,metadata)values(s.partner_id,a,'partner_settlement_paid','partner_settlement',p_settlement_id::text,jsonb_build_object('amount_etb',s.amount_etb));end $$;
revoke all on function public.admin_mark_partner_settlement_paid(uuid) from public,anon;grant execute on function public.admin_mark_partner_settlement_paid(uuid) to authenticated;

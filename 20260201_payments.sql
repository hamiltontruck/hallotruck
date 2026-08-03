-- Payments / escrow audit trail
create type payment_event as enum (
  'initiated', 'held_escrow', 'released', 'refunded', 'failed'
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,               -- 'telebirr' | 'mpesa'
  provider_ref text,                    -- provider transaction id
  amount_etb numeric(10,2) not null,
  event payment_event not null,
  raw_payload jsonb,                    -- store webhook body for audits/disputes
  created_at timestamptz not null default now()
);

create index payments_order_idx on payments (order_id, created_at desc);

alter table payments enable row level security;

create policy "payments: participants read" on payments
  for select using (
    exists (
      select 1 from orders o where o.id = order_id
      and (o.customer_id = auth.uid() or o.driver_id = auth.uid())
    )
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

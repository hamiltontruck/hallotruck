alter table public.orders
  add column if not exists cargo_category text not null default 'general_goods',
  add column if not exists packaging_type text not null default 'loose_bulk',
  add column if not exists cargo_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_cargo_category_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_cargo_category_check
      check (cargo_category in (
        'food',
        'grain_rice',
        'cooking_oil',
        'metal_steel',
        'construction_materials',
        'general_goods',
        'other'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_packaging_type_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_packaging_type_check
      check (packaging_type in (
        'bagged',
        'drum_tank',
        'pallet',
        'loose_bulk',
        'container_20ft',
        'container_40ft',
        'other'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_cargo_notes_length_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_cargo_notes_length_check
      check (cargo_notes is null or char_length(btrim(cargo_notes)) <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_other_cargo_requires_notes'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_other_cargo_requires_notes
      check (
        cargo_category <> 'other'
        or (cargo_notes is not null and char_length(btrim(cargo_notes)) >= 3)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_container_requires_trailer'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_container_requires_trailer
      check (
        packaging_type not in ('container_20ft', 'container_40ft')
        or lower(btrim(vehicle_type)) = 'trailer'
      );
  end if;
end;
$$;

create index if not exists orders_cargo_category_idx
  on public.orders(cargo_category);

create index if not exists orders_packaging_type_idx
  on public.orders(packaging_type);

comment on column public.orders.cargo_category is
  'Structured cargo category selected by the customer or Admin.';
comment on column public.orders.packaging_type is
  'Structured packaging/load form; container values require a Trailer.';
comment on column public.orders.cargo_notes is
  'Optional cargo handling/details; required when cargo_category is other.';

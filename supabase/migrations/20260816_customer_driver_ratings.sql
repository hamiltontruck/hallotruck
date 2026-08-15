create index if not exists ratings_customer_id_idx on public.ratings(customer_id);
create index if not exists ratings_driver_id_idx on public.ratings(driver_id);

drop policy if exists "ratings participants read" on public.ratings;

create policy "ratings participants read"
on public.ratings
for select
to authenticated
using (
  customer_id = (select auth.uid())
  or driver_id = (select auth.uid())
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
);

create or replace function public.customer_submit_rating(
  p_order_id uuid,
  p_score smallint,
  p_comment text default null
)
returns public.ratings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_driver_id uuid;
  v_rating public.ratings;
begin
  if v_customer_id is null then
    raise exception 'Sign in required.';
  end if;

  if p_score < 1 or p_score > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;

  select o.driver_id
  into v_driver_id
  from public.orders o
  where o.id = p_order_id
    and o.customer_id = v_customer_id
    and o.status = 'delivered'::public.order_status
    and o.driver_id is not null;

  if v_driver_id is null then
    raise exception 'Only a delivered order with an assigned driver can be rated.';
  end if;

  insert into public.ratings(order_id, customer_id, driver_id, score, comment)
  values (
    p_order_id,
    v_customer_id,
    v_driver_id,
    p_score,
    nullif(left(trim(coalesce(p_comment, '')), 500), '')
  )
  on conflict (order_id) do update
  set score = excluded.score,
      comment = excluded.comment
  where public.ratings.customer_id = v_customer_id
  returning * into v_rating;

  if not found then
    raise exception 'Rating could not be saved.';
  end if;

  return v_rating;
end;
$$;

revoke all on function public.customer_submit_rating(uuid, smallint, text) from public, anon;
grant execute on function public.customer_submit_rating(uuid, smallint, text) to authenticated;
grant select on public.ratings to authenticated;

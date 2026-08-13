-- Prevent a signed-in customer from changing rating identity fields through future
-- broader policies or accidental client-side updates. Ratings remain immutable via RLS.

create or replace function public.guard_rating_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.customer_id <> auth.uid() then
      raise exception 'Rating customer must match the signed-in user';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ratings_identity_guard on public.ratings;
create trigger ratings_identity_guard
before insert on public.ratings
for each row execute function public.guard_rating_identity();

revoke all on function public.guard_rating_identity() from public, anon, authenticated;

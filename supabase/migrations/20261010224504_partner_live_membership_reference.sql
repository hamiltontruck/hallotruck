begin;
set local lock_timeout = '5s';
do $migration$
declare
  definition text;
begin
  select pg_catalog.pg_get_functiondef('public.partner_get_live_trip(uuid,uuid)'::regprocedure) into definition;
  if pg_catalog.to_regprocedure('private.is_partner_member(uuid)') is null then
    raise exception 'Private Partner membership helper is required';
  end if;
  if pg_catalog.strpos(definition, 'public.is_partner_member(p_partner_id)') > 0 then
    execute pg_catalog.replace(definition, 'public.is_partner_member(p_partner_id)', 'private.is_partner_member(p_partner_id)');
  elsif pg_catalog.strpos(definition, 'private.is_partner_member(p_partner_id)') = 0 then
    raise exception 'Unexpected Partner membership helper; review before applying';
  end if;
end;
$migration$;
commit;

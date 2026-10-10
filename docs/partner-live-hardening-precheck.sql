begin read only;

select
  position('private.is_partner_member' in pg_get_functiondef(p.oid)) > 0 as uses_private_membership,
  position('public.is_partner_member' in pg_get_functiondef(p.oid)) = 0 as avoids_public_membership,
  to_regprocedure('private.is_partner_member(uuid)') is not null as private_helper_exists,
  position('Partner live assignment mismatch' in pg_get_functiondef(p.oid)) > 0 as mismatch_guard_present
from pg_proc p
where p.oid = to_regprocedure('public.partner_get_live_trip(uuid,uuid)');

select version
from supabase_migrations.schema_migrations
where version in ('20261006020000', '20261008023352');

rollback;

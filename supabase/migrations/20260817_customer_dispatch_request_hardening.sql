revoke insert, update, delete, truncate, references, trigger
on public.customer_dispatch_requests
from anon, authenticated;

grant select on public.customer_dispatch_requests to authenticated;

notify pgrst, 'reload schema';

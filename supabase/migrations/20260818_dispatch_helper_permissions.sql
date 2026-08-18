-- Keep document verification helper internal to security-definer dispatch RPCs.
revoke all on function public.dispatch_documents_valid(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.dispatch_documents_valid(uuid, uuid) to service_role;

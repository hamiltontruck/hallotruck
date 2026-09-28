begin;

create or replace function public.admin_notification_operations_report(
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := coalesce(p_page_size, 50);
  v_total bigint;
  v_rows jsonb;
begin
  perform private.require_active_leadership('admin_notification_operations_report');

  if p_page_size not in (50, 100) then
    raise exception 'Unsupported page size: %', p_page_size using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.notifications n;

  select coalesce(jsonb_agg(row_data order by created_at desc, notification_id desc), '[]'::jsonb)
    into v_rows
  from (
    select
      n.id as notification_id,
      n.user_id,
      n.event_type,
      n.title,
      n.body,
      n.read_at,
      n.expires_at,
      n.created_at,
      o.id as outbox_id,
      o.status as outbox_status,
      o.attempts,
      o.next_attempt_at,
      o.last_error,
      o.processed_at,
      to_jsonb(n) || jsonb_build_object(
        'outbox_id', o.id,
        'outbox_status', o.status,
        'attempts', o.attempts,
        'next_attempt_at', o.next_attempt_at,
        'last_error', o.last_error,
        'processed_at', o.processed_at
      ) as row_data
    from public.notifications n
    left join public.push_notification_outbox o
      on o.notification_id = n.id
    order by n.created_at desc, n.id desc
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ) page_rows;

  return jsonb_build_object(
    'page', v_page,
    'page_size', v_page_size,
    'total', v_total,
    'total_pages', greatest(1, ceil(v_total::numeric / v_page_size)::integer),
    'rows', v_rows
  );
end;
$function$;

revoke all on function public.admin_notification_operations_report(integer, integer)
  from public, anon;
grant execute on function public.admin_notification_operations_report(integer, integer)
  to authenticated;

commit;

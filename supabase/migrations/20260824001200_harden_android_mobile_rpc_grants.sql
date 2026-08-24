revoke all on function public.register_android_device(text,text,text) from public, anon;
grant execute on function public.register_android_device(text,text,text) to authenticated;

revoke all on function public.touch_android_device(text,text) from public, anon;
grant execute on function public.touch_android_device(text,text) to authenticated;

revoke all on function public.unregister_android_device(text) from public, anon;
grant execute on function public.unregister_android_device(text) to authenticated;

revoke all on function public.my_android_devices() from public, anon;
grant execute on function public.my_android_devices() to authenticated;

revoke all on function public.update_android_notification_preferences(text,text,boolean) from public, anon;
grant execute on function public.update_android_notification_preferences(text,text,boolean) to authenticated;

revoke all on function public.my_notifications(integer) from public, anon;
grant execute on function public.my_notifications(integer) to authenticated;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

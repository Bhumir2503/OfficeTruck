-- The dispatch link is gone: the web driver portal (/dispatch/<token>) was
-- removed, and drivers now work their loads in the driver app through the
-- signed-in my_* functions (20261125180000_driver_app.sql). The functions
-- behind the link were still callable by anyone holding the anon key, with
-- or without signing in, so no one may call them now.
--
-- They're kept rather than dropped: nothing depends on them, and if the
-- link ever comes back, a grant restores it.

revoke execute on function public.dispatch_stops(text)
  from public, anon, authenticated;

revoke execute on function public.open_dispatch(text)
  from public, anon, authenticated;

revoke execute on function public.record_stop_event_by_token(text, integer, text)
  from public, anon, authenticated;

revoke execute on function public.record_stop_odometer_by_token(text, integer, text, integer)
  from public, anon, authenticated;

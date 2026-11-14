-- Mark complete works on booked loads too, for loads that were run without
-- being dispatched through the app. Same as before otherwise: the load
-- moves to delivered, flagged completed by hand, and it's logged.

create or replace function public.mark_load_complete(target_load uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.loads;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or not public.is_organization_member(l.organization_id) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if l.status not in ('booked', 'dispatched', 'loaded') then
    raise exception 'Only a load that hasn''t been delivered can be marked complete.'
      using errcode = '42501', hint = 'not_completable';
  end if;

  perform set_config('officetruck.status_reason', 'completed', true);
  perform set_config('officetruck.status_detail', 'Marked complete by hand', true);
  update public.loads
  set status = 'delivered',
      completed_manually = true,
      completed_by = auth.uid(),
      completed_at = now()
  where id = target_load;
  perform set_config('officetruck.status_reason', '', true);
  perform set_config('officetruck.status_detail', '', true);
end;
$$;

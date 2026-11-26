-- Dispatching to a driver with no pay set yet failed: with the company's
-- "share rates with drivers" off, `false or (null = 'percent')` is null, and
-- load_dispatches.include_rate is not null. A driver with no pay type isn't
-- paid a percentage, so they don't get the rate.

CREATE OR REPLACE FUNCTION public.dispatch_load(target_load uuid)
 RETURNS TABLE(token text, email_to text, driver_name text, resent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.loads;
  d public.drivers;
  share boolean;
  new_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  was_dispatched boolean;
begin
  select * into l from public.loads where id = target_load for update;
  if l.id is null or not public.is_organization_member(l.organization_id) then
    raise exception 'That load doesn''t exist.' using errcode = 'P0002', hint = 'not_found';
  end if;
  if l.status not in ('booked', 'dispatched') then
    raise exception 'Only booked loads can be sent to a driver.'
      using errcode = '42501', hint = 'not_dispatchable';
  end if;
  if l.driver_id is null or l.truck_id is null then
    raise exception 'Assign a truck and driver before sending the load.'
      using errcode = '23514', hint = 'needs_assignment';
  end if;

  select * into d from public.drivers where id = l.driver_id;
  select o.share_rate_with_drivers into share from public.organizations o where o.id = l.organization_id;
  -- A driver paid a percentage of the load is owed the rated freight bill
  -- (49 CFR 376.12(g)), so they see the rate whatever the company setting.
  -- The pay locked on the load decides; the driver's current pay if none.
  share := coalesce(share, false)
    or coalesce(coalesce(l.driver_pay_type, d.pay_type) = 'percent', false);
  was_dispatched := l.status = 'dispatched';

  -- A new send replaces the last one; its link stops working.
  update public.load_dispatches set revoked_at = now()
  where load_id = l.id and revoked_at is null;

  insert into public.load_dispatches
    (organization_id, load_id, driver_id, token, email_to, packet, include_rate, sent_by)
  values
    (l.organization_id, l.id, l.driver_id, new_token, d.email,
     public.load_dispatch_packet(l.id, share), share, auth.uid());

  if was_dispatched then
    insert into public.load_events (organization_id, load_id, kind, from_status, to_status, detail)
    values (l.organization_id, l.id, 'resent', l.status, l.status, 'Sent again to ' || d.full_name);
  else
    perform set_config('officetruck.status_reason', 'dispatched', true);
    perform set_config('officetruck.status_detail', 'Sent to ' || d.full_name, true);
    update public.loads set status = 'dispatched' where id = l.id;
    perform set_config('officetruck.status_reason', '', true);
    perform set_config('officetruck.status_detail', '', true);
  end if;

  return query select new_token, d.email, d.full_name, was_dispatched;
end;
$function$;

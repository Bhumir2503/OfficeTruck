-- my_loads: each load also says when its last stop's window ends, so the
-- app can tell the driver when two loads overlap, by the same rule the
-- office's dispatch warning uses (web/lib/dispatch-format.ts). Otherwise
-- unchanged.

create or replace function public.my_loads()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_data order by on_road desc, pickup_start desc), '[]'::jsonb)
  from (
    select
      l.status in ('dispatched', 'loaded', 'delivered') as on_road,
      l.pickup_start,
      jsonb_build_object(
        'id', l.id,
        'organization_id', l.organization_id,
        'organization_name', o.name,
        'reference', l.reference,
        'status', l.status,
        'pickup_location', l.pickup_location,
        'pickup_start', l.pickup_start,
        'delivery_location', l.delivery_location,
        'delivery_start', l.delivery_start,
        'delivery_end', l.delivery_end,
        'delivered_on', l.delivered_on,
        'truck', (select t.unit_number from public.trucks t where t.id = l.truck_id),
        'trailer_number', l.trailer_number,
        'stop_count', (select count(*) from public.load_stops s where s.load_id = l.id),
        'stops_departed', (
          select count(*) from public.load_stops s
          where s.load_id = l.id and s.departed_at is not null
        )
      ) as row_data
    from public.loads l
    join public.drivers d
      on d.organization_id = l.organization_id and d.id = l.driver_id
    join public.organizations o on o.id = l.organization_id
    where d.user_id = (select auth.uid())
      and (d.end_date is null or d.end_date >= current_date)
      and l.status not in ('booked', 'cancelled')
      and (
        l.status in ('dispatched', 'loaded', 'delivered')
        or l.pickup_start >= (now() - interval '120 days')::timestamp
      )
    order by on_road desc, l.pickup_start desc
    limit 200
  ) mine;
$$;

revoke execute on function public.my_loads() from public, anon;
grant execute on function public.my_loads() to authenticated;

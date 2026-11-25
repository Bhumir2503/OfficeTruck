-- The driver app's Profile page: who the signed-in driver is and what they
-- need to keep current. One entry per carrier they drive for (usually one),
-- the same drivers my_dq_drivers lists.
--
-- Only what a driver should see about themselves: the CDL number is cut to
-- its last 4 digits, and office-only fields (notes, pay history, DQ
-- reviews) stay out. Pay is the driver's own setup, not any load's rate.

create function public.my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'driver_id', d.id,
    'full_name', d.full_name,
    'start_date', d.start_date,
    'organization', jsonb_build_object('id', o.id, 'name', o.name, 'phone', o.phone),
    'license_class', d.license_class,
    'cdl_class', d.cdl_class,
    'cdl_state', d.cdl_state,
    'cdl_number_last4', case when d.cdl_number is not null then right(d.cdl_number, 4) end,
    'cdl_endorsements', to_jsonb(d.cdl_endorsements),
    'cdl_restrictions', d.cdl_restrictions,
    'cdl_expires_on', d.cdl_expires_on,
    'medical_card_expires_on', d.medical_card_expires_on,
    'holds_medical_variance', d.holds_medical_variance,
    'pay_type', d.pay_type,
    'pay_rate', d.pay_rate,
    'pay_period', d.pay_period,
    'truck', (
      select jsonb_build_object('unit_number', t.unit_number, 'year', t.year, 'make', t.make, 'model', t.model)
      from public.trucks t
      where t.organization_id = d.organization_id
        and t.default_driver_id = d.id
        and t.status = 'active'
      order by t.unit_number
      limit 1
    )
  ) order by o.name), '[]'::jsonb)
  from public.drivers d
  join public.organizations o on o.id = d.organization_id
  where d.user_id = (select auth.uid())
    and (d.end_date is null or d.end_date >= current_date);
$$;

revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;
